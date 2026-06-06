"""SSO Service — Social Login with Google, LinkedIn, Microsoft, Apple.

Implements the OAuth2 authorization-code flow for four providers plus
account linking/disconnect. Supports a fully-mocked provider path
(``SSO_MOCK=true``) so the endpoints can be exercised in tests without
hitting the real OAuth providers.

Endpoints exposed (mounted under ``/api/v1/sso``):

    GET  /health                              health check
    GET  /providers                           list configured providers
    GET  /providers/{provider}/authorize     server-state authorize (compat)
    POST /providers/{provider}/callback       legacy in-memory callback (compat)
    GET  /userinfo                            legacy in-memory userinfo (compat)
    DELETE /unlink/{provider}                 legacy in-memory unlink (compat)

    GET  /{provider}/login                    OAuth2 start — returns redirect
    GET  /{provider}/callback                 OAuth2 callback (DB-backed)
    POST /disconnect                          disconnect a provider from
                                              the current user (DB-backed,
                                              tenant-scoped)
    GET  /connections                         list providers linked to the
                                              current user (DB-backed,
                                              tenant-scoped)

Mock mode (``SSO_MOCK=true``) lets callers skip the real provider
HTTP calls — the callback resolves to a deterministic mock user
identity. This is what the test-suite relies on.
"""
from __future__ import annotations

import logging
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.audit import audit
from shared.auth.dependencies import (
    require_authenticated_user,
    require_tenant_id,
)
from shared.core.config import get_settings
from shared.core.database import get_db_dependency
from shared.core.models.identity import Credential, User, UserRole, UserStatus
from shared.core.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
)


logger = logging.getLogger("sso_service")
settings = get_settings()


# ── Provider configuration ─────────────────────────────────────────────────


SSO_PROVIDERS: dict[str, dict[str, Any]] = {
    "google": {
        "name": "Google",
        "authorization_url": "https://accounts.google.com/o/oauth2/auth",
        "token_url": "https://oauth2.googleapis.com/token",
        "userinfo_url": "https://www.googleapis.com/oauth2/v2/userinfo",
        "scopes": ["openid", "email", "profile"],
        "icon": "google",
    },
    "linkedin": {
        "name": "LinkedIn",
        "authorization_url": "https://www.linkedin.com/oauth/v2/authorization",
        "token_url": "https://www.linkedin.com/oauth/v2/accessToken",
        "userinfo_url": "https://api.linkedin.com/v2/userinfo",
        "scopes": ["openid", "profile", "email"],
        "icon": "linkedin",
    },
    "microsoft": {
        "name": "Microsoft",
        "authorization_url": "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
        "token_url": "https://login.microsoftonline.com/common/oauth2/v2.0/token",
        "userinfo_url": "https://graph.microsoft.com/v1.0/me",
        "scopes": ["openid", "email", "profile", "User.Read"],
        "icon": "microsoft",
    },
    "apple": {
        "name": "Apple",
        "authorization_url": "https://appleid.apple.com/auth/authorize",
        "token_url": "https://appleid.apple.com/auth/token",
        "userinfo_url": "https://appleid.apple.com/auth/userinfo",
        "scopes": ["name", "email"],
        "icon": "apple",
    },
}


# Mock user profiles — used when SSO_MOCK=true.
MOCK_USER_PROFILES: dict[str, dict[str, Any]] = {
    "google": {
        "sub": "mock-google-123",
        "email": "mock.google@example.com",
        "name": "Mock Google User",
        "given_name": "Mock",
        "family_name": "Google",
        "picture": "https://example.com/avatars/google.png",
    },
    "linkedin": {
        "sub": "mock-linkedin-456",
        "email": "mock.linkedin@example.com",
        "name": "Mock LinkedIn User",
        "given_name": "Mock",
        "family_name": "LinkedIn",
        "picture": "https://example.com/avatars/linkedin.png",
    },
    "microsoft": {
        "id": "mock-microsoft-789",
        "mail": "mock.microsoft@example.com",
        "userPrincipalName": "mock.microsoft@example.com",
        "displayName": "Mock Microsoft User",
        "givenName": "Mock",
        "surname": "Microsoft",
    },
    "apple": {
        "sub": "mock-apple-101",
        "email": "mock.apple@example.com",
        "name": {"firstName": "Mock", "lastName": "Apple"},
        "is_private_email": "true",
    },
}


# ── State store (in-memory, TTL) ────────────────────────────────────────────


STATE_TTL_SECONDS = 600
_states: dict[str, dict[str, Any]] = {}


def _create_state(provider: str, action: str = "login", tenant_id: str | None = None) -> str:
    state = secrets.token_urlsafe(32)
    _states[state] = {
        "provider": provider,
        "action": action,
        "tenant_id": tenant_id,
        "created_at": datetime.now(timezone.utc),
    }
    return state


def _verify_state(state: str) -> Optional[dict[str, Any]]:
    if not state or state not in _states:
        return None
    data = _states.pop(state)
    age = (datetime.now(timezone.utc) - data["created_at"]).total_seconds()
    if age > STATE_TTL_SECONDS:
        return None
    return data


# ── Legacy in-memory stores (kept for backward compatibility) ───────────────


STATE_EXPIRY_SECONDS = STATE_TTL_SECONDS
LINKED_ACCOUNTS_DB: dict[str, dict] = {}
TOKENS_DB: dict[str, dict] = {}
USERS_DB: dict[str, dict] = {}


# ── Pydantic schemas ────────────────────────────────────────────────────────


class CallbackRequest(BaseModel):
    provider: Optional[str] = None
    code: str
    state: Optional[str] = None
    redirect_uri: Optional[str] = None


class DisconnectRequest(BaseModel):
    provider: str = Query(..., description="Provider to disconnect (google/linkedin/microsoft/apple)")


class ConnectionRead(BaseModel):
    provider: str
    provider_user_id: Optional[str] = None
    created_at: Optional[str] = None
    linked: bool = True


# ── Helpers ─────────────────────────────────────────────────────────────────


def _is_mock_mode() -> bool:
    """Whether the service should bypass real provider HTTP calls."""
    val = os.getenv("SSO_MOCK", "").strip().lower()
    if val in ("1", "true", "yes", "on"):
        return True
    return bool(getattr(settings, "SSO_MOCK", False))


def _provider_config(provider: str) -> dict[str, Any]:
    if provider not in SSO_PROVIDERS:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Provider '{provider}' not found",
        )
    return SSO_PROVIDERS[provider]


def _client_id(provider: str) -> str:
    return (
        os.getenv(f"SSO_{provider.upper()}_CLIENT_ID", "")
        or getattr(settings, f"SSO_{provider.upper()}_CLIENT_ID", "")
        or f"client_id_{provider}"
    )


def _client_secret(provider: str) -> str:
    return (
        os.getenv(f"SSO_{provider.upper()}_CLIENT_SECRET", "")
        or getattr(settings, f"SSO_{provider.upper()}_CLIENT_SECRET", "")
        or f"client_secret_{provider}"
    )


def _redirect_uri(provider: str) -> str:
    base = os.getenv("SSO_REDIRECT_BASE") or getattr(settings, "SSO_REDIRECT_BASE", "") or "http://localhost:8000"
    return f"{base.rstrip('/')}/api/v1/sso/{provider}/callback"


def _build_authorize_url(provider: str, state: str, redirect_uri: str) -> str:
    config = _provider_config(provider)
    params = {
        "client_id": _client_id(provider),
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": " ".join(config["scopes"]),
        "state": state,
    }
    return f"{config['authorization_url']}?{urlencode(params)}"


def _normalize_user_info(provider: str, raw: dict[str, Any]) -> dict[str, Any]:
    """Map a provider's userinfo payload to our common shape.

    Returns a dict with keys: provider, provider_user_id, email, full_name,
    avatar_url.
    """
    if provider == "google":
        email = raw.get("email")
        full_name = raw.get("name") or " ".join(
            [raw.get("given_name", ""), raw.get("family_name", "")]
        ).strip() or email or "Google User"
        avatar = raw.get("picture")
        pid = raw.get("sub") or raw.get("id")
    elif provider == "linkedin":
        email = raw.get("email")
        first = raw.get("given_name", "")
        last = raw.get("family_name", "")
        full_name = raw.get("name") or f"{first} {last}".strip() or email or "LinkedIn User"
        avatar = raw.get("picture")
        pid = raw.get("sub")
    elif provider == "microsoft":
        email = raw.get("mail") or raw.get("userPrincipalName")
        full_name = raw.get("displayName") or " ".join(
            [raw.get("givenName", ""), raw.get("surname", "")]
        ).strip() or email or "Microsoft User"
        avatar = None
        pid = raw.get("id") or raw.get("oid")
    elif provider == "apple":
        email = raw.get("email")
        name = raw.get("name")
        if isinstance(name, dict):
            full_name = f"{name.get('firstName', '')} {name.get('lastName', '')}".strip()
        else:
            full_name = str(name or email or "Apple User")
        avatar = None
        pid = raw.get("sub")
    else:
        email = raw.get("email")
        full_name = raw.get("name") or email or "SSO User"
        avatar = raw.get("picture")
        pid = raw.get("sub") or raw.get("id")

    return {
        "provider": provider,
        "provider_user_id": pid,
        "email": email,
        "full_name": full_name or "SSO User",
        "avatar_url": avatar,
    }


async def _exchange_code(provider: str, code: str, redirect_uri: str) -> dict[str, Any]:
    """Exchange the authorization code for an access token."""
    config = _provider_config(provider)
    data = {
        "code": code,
        "client_id": _client_id(provider),
        "client_secret": _client_secret(provider),
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code",
    }
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(config["token_url"], data=data)
        if resp.status_code >= 400:
            logger.error("Token exchange failed for %s: %s", provider, resp.text)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Token exchange failed for {provider}",
            )
        return resp.json()


async def _fetch_user_info(provider: str, access_token: str) -> dict[str, Any]:
    """Fetch the user's profile from the provider's userinfo endpoint."""
    config = _provider_config(provider)
    headers = {"Authorization": f"Bearer {access_token}"}
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(config["userinfo_url"], headers=headers)
        if resp.status_code >= 400:
            logger.error("userinfo fetch failed for %s: %s", provider, resp.text)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to fetch user info from {provider}",
            )
        return resp.json()


def _issue_session_tokens(user: User) -> dict[str, Any]:
    """Build a JWT access + refresh token pair for the given user."""
    token_data = {
        "sub": user.id,
        "email": user.email,
        "role": user.role.value,
        "tenant_id": user.tenant_id,
    }
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "expires_in": settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    }


async def _find_or_create_user(
    db: AsyncSession,
    *,
    provider: str,
    provider_user_id: str | None,
    email: str | None,
    full_name: str,
    avatar_url: str | None,
    tenant_id: str = "default",
) -> tuple[User, bool]:
    """Find an existing user (by email or by provider credential) or create
    a new one. Returns ``(user, is_new)``.
    """
    # 1) Existing credential match → that user
    if provider_user_id:
        result = await db.execute(
            select(Credential).where(
                Credential.provider == provider,
                Credential.provider_user_id == provider_user_id,
            )
        )
        cred = result.scalar_one_or_none()
        if cred is not None:
            user_result = await db.execute(select(User).where(User.id == cred.user_id))
            user = user_result.scalar_one_or_none()
            if user is not None:
                return user, False

    # 2) Email match → link this provider to the existing user
    if email:
        result = await db.execute(select(User).where(User.email == email.lower()))
        user = result.scalar_one_or_none()
        if user is not None:
            await _upsert_credential(
                db,
                user_id=user.id,
                provider=provider,
                provider_user_id=provider_user_id,
            )
            return user, False

    # 3) No match → create a new user
    safe_email = (email or f"sso_{provider}_{uuid.uuid4().hex[:8]}@{provider}.example.com").lower()
    safe_name = full_name or f"SSO User ({provider})"
    user = User(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        email=safe_email,
        full_name=safe_name,
        hashed_password=hash_password(secrets.token_urlsafe(24)),
        role=UserRole.CANDIDATE,
        status=UserStatus.ACTIVE,
        avatar_url=avatar_url,
        email_verified=bool(email),
    )
    db.add(user)
    await db.flush()
    await _upsert_credential(
        db,
        user_id=user.id,
        provider=provider,
        provider_user_id=provider_user_id,
    )
    return user, True


async def _upsert_credential(
    db: AsyncSession,
    *,
    user_id: str,
    provider: str,
    provider_user_id: str | None,
    access_token: str | None = None,
    refresh_token: str | None = None,
    expires_at: datetime | None = None,
) -> Credential:
    """Insert or update a Credential row for this user/provider pair."""
    result = await db.execute(
        select(Credential).where(
            Credential.user_id == user_id,
            Credential.provider == provider,
        )
    )
    cred = result.scalar_one_or_none()
    if cred is None:
        cred = Credential(
            id=str(uuid.uuid4()),
            user_id=user_id,
            provider=provider,
            provider_user_id=provider_user_id,
            access_token=access_token,
            refresh_token=refresh_token,
            expires_at=expires_at,
        )
        db.add(cred)
    else:
        if provider_user_id is not None:
            cred.provider_user_id = provider_user_id
        if access_token is not None:
            cred.access_token = access_token
        if refresh_token is not None:
            cred.refresh_token = refresh_token
        if expires_at is not None:
            cred.expires_at = expires_at
        db.add(cred)
    await db.flush()
    return cred


async def _get_credential_for_user(
    db: AsyncSession, *, user_id: str, provider: str
) -> Optional[Credential]:
    result = await db.execute(
        select(Credential).where(
            Credential.user_id == user_id,
            Credential.provider == provider,
        )
    )
    return result.scalar_one_or_none()


async def _list_credentials_for_user(db: AsyncSession, *, user_id: str) -> list[Credential]:
    from sqlalchemy import asc

    result = await db.execute(
        select(Credential).where(Credential.user_id == user_id).order_by(asc(Credential.created_at))
    )
    return list(result.scalars().all())


# ── Router ──────────────────────────────────────────────────────────────────


router = APIRouter()


# ── Health & provider metadata ──────────────────────────────────────────────


@router.get("/health", tags=["SSO"])
async def health():
    return {"status": "healthy", "service": "sso", "mock_mode": _is_mock_mode()}


@router.get("/providers", tags=["SSO"])
async def list_providers():
    providers = [
        {
            "id": key,
            "name": p["name"],
            "icon": p["icon"],
            "auth_url": f"/api/v1/sso/{key}/login",
        }
        for key, p in SSO_PROVIDERS.items()
    ]
    return {"providers": providers, "total": len(providers)}


# ── New OAuth2 flow (DB-backed) ─────────────────────────────────────────────


@router.get(
    "/{provider}/login",
    tags=["SSO"],
    summary=f"Start OAuth2 login with a provider",
    description=(
        "Generate a CSRF state token and return the provider's authorization "
        "URL. In mock mode (``SSO_MOCK=true``) the URL points back at this "
        "service's callback so the test-suite can drive the flow end-to-end."
    ),
)
async def provider_login(
    provider: str,
    redirect: bool = Query(default=False, description="If true, return a 302 redirect instead of JSON"),
    tenant_id: str = Depends(require_tenant_id),
):
    cfg = _provider_config(provider)
    state = _create_state(provider, action="login", tenant_id=tenant_id)

    if _is_mock_mode():
        # In mock mode we point the user back at our own callback with a
        # known mock code so the test-suite can complete the flow without
        # touching a real provider.
        mock_code = f"mock_code_{provider}"
        auth_url = (
            f"{_redirect_uri(provider)}?code={mock_code}&state={state}"
        )
    else:
        auth_url = _build_authorize_url(provider, state, _redirect_uri(provider))

    if redirect:
        return Response(
            status_code=status.HTTP_302_FOUND,
            headers={"Location": auth_url},
        )

    return {
        "provider": provider,
        "provider_name": cfg["name"],
        "authorization_url": auth_url,
        "state": state,
        "mock": _is_mock_mode(),
    }


@router.get(
    "/{provider}/callback",
    tags=["SSO"],
    summary="OAuth2 callback for a provider",
    description=(
        "Handle the redirect-back from the provider. Exchanges the code for "
        "a token, fetches the user profile, finds-or-creates a local user, "
        "stores a ``Credential`` row, and returns a JWT session token pair."
    ),
)
async def provider_callback(
    provider: str,
    request: Request,
    code: str = Query(..., min_length=1),
    state: str = Query(..., min_length=1),
    db: AsyncSession = Depends(get_db_dependency),
):
    cfg = _provider_config(provider)
    state_data = _verify_state(state)
    if state_data is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired state token",
        )
    if state_data.get("provider") != provider:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="State/provider mismatch",
        )
    tenant_id = state_data.get("tenant_id") or "default"

    # 1) Pull the user profile (real or mock).
    if _is_mock_mode():
        raw_user_info = dict(MOCK_USER_PROFILES.get(provider, {}))
        access_token_payload: dict[str, Any] = {"access_token": "mock_access_token"}
    else:
        token_payload = await _exchange_code(provider, code, _redirect_uri(provider))
        access_token_payload = token_payload
        access_tok = token_payload.get("access_token")
        if not access_tok:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"No access_token returned by {provider}",
            )
        raw_user_info = await _fetch_user_info(provider, access_tok)

    normalized = _normalize_user_info(provider, raw_user_info)
    if not normalized.get("email") and not normalized.get("provider_user_id"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Provider {provider} returned no identifying information",
        )

    # 2) Find or create the local user.
    user, is_new = await _find_or_create_user(
        db,
        provider=provider,
        provider_user_id=normalized.get("provider_user_id"),
        email=normalized.get("email"),
        full_name=normalized.get("full_name", ""),
        avatar_url=normalized.get("avatar_url"),
        tenant_id=tenant_id,
    )

    # 3) Persist the access / refresh tokens on the credential (best-effort).
    expires_at: datetime | None = None
    raw_expires_in = access_token_payload.get("expires_in")
    if isinstance(raw_expires_in, (int, float)):
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=float(raw_expires_in))
    await _upsert_credential(
        db,
        user_id=user.id,
        provider=provider,
        provider_user_id=normalized.get("provider_user_id"),
        access_token=access_token_payload.get("access_token"),
        refresh_token=access_token_payload.get("refresh_token"),
        expires_at=expires_at.replace(tzinfo=None) if expires_at else None,
    )

    await audit(
        db,
        tenant_id=user.tenant_id,
        action=("sso.user_created" if is_new else "sso.user_linked"),
        resource_type="user",
        resource_id=user.id,
        actor_id=user.id,
        actor_email=user.email,
        details={"provider": provider},
    )
    await db.commit()
    await db.refresh(user)

    # 4) Issue JWT session tokens.
    tokens = _issue_session_tokens(user)
    return {
        **tokens,
        "user": {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "avatar_url": user.avatar_url,
            "role": user.role.value,
            "tenant_id": user.tenant_id,
        },
        "provider": provider,
        "provider_name": cfg["name"],
        "is_new_user": is_new,
    }


@router.post(
    "/disconnect",
    tags=["SSO"],
    summary="Disconnect a provider from the current user",
    description=(
        "Removes the ``Credential`` row for the current user / provider pair. "
        "The user account itself is left intact so they can continue signing "
        "in with a password (or another provider)."
    ),
)
async def disconnect(
    data: DisconnectRequest,
    tenant_id: str = Depends(require_tenant_id),
    user: dict[str, Any] = Depends(require_authenticated_user),
    db: AsyncSession = Depends(get_db_dependency),
):
    _provider_config(data.provider)  # 404 if unknown

    # Look up the local user by the JWT subject — we want the live DB row
    # for cascading the credential delete.
    result = await db.execute(select(User).where(User.id == user["id"]))
    db_user = result.scalar_one_or_none()
    if db_user is None or db_user.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    cred = await _get_credential_for_user(
        db, user_id=db_user.id, provider=data.provider
    )
    if cred is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No {data.provider} connection for this user",
        )

    await db.delete(cred)
    await audit(
        db,
        tenant_id=tenant_id,
        action="sso.disconnected",
        resource_type="user",
        resource_id=db_user.id,
        actor_id=db_user.id,
        actor_email=db_user.email,
        details={"provider": data.provider},
    )
    await db.commit()
    return {
        "disconnected": True,
        "provider": data.provider,
        "user_id": db_user.id,
    }


@router.get(
    "/connections",
    tags=["SSO"],
    summary="List SSO connections for the current user",
    description=(
        "Returns the providers that are currently linked to the authenticated "
        "user. The list is always filtered to the caller's tenant."
    ),
)
async def list_connections(
    tenant_id: str = Depends(require_tenant_id),
    user: dict[str, Any] = Depends(require_authenticated_user),
    db: AsyncSession = Depends(get_db_dependency),
):
    result = await db.execute(select(User).where(User.id == user["id"]))
    db_user = result.scalar_one_or_none()
    if db_user is None or db_user.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    creds = await _list_credentials_for_user(db, user_id=db_user.id)
    return {
        "user_id": db_user.id,
        "tenant_id": tenant_id,
        "connections": [
            ConnectionRead(
                provider=c.provider,
                provider_user_id=c.provider_user_id,
                created_at=c.created_at.isoformat() if c.created_at else None,
                linked=True,
            ).model_dump()
            for c in creds
        ],
        "total": len(creds),
    }


# ── Backward-compatible endpoints (in-memory) ──────────────────────────────


def _generate_state() -> str:
    return _create_state("legacy", action="legacy")


@router.get("/providers/{provider}/authorize", tags=["SSO [legacy]"])
async def get_authorize_url(provider: str, redirect_uri: str):
    if provider not in SSO_PROVIDERS:
        raise HTTPException(status_code=404, detail=f"Provider '{provider}' not found")

    state = _generate_state()
    scope = "+".join(SSO_PROVIDERS[provider]["scopes"])
    query_params = {
        "client_id": f"client_id_{provider}",
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": scope,
        "state": state,
    }
    query_string = "&".join(f"{k}={v}" for k, v in query_params.items())
    authorization_url = f"{SSO_PROVIDERS[provider]['authorization_url']}?{query_string}"
    return {"authorization_url": authorization_url, "state": state, "provider": provider}


@router.post("/providers/{provider}/callback", tags=["SSO [legacy]"])
async def sso_callback(provider: str, data: CallbackRequest):
    if provider not in SSO_PROVIDERS:
        raise HTTPException(status_code=404, detail=f"Provider '{provider}' not found")

    # Legacy in-memory endpoint — accept any state the caller passes (the
    # state is purely informational in this code-path because we never reach
    # a real provider).  New callers should use the DB-backed callback
    # under ``/{provider}/callback``.
    if data.state:
        _verify_state(data.state)  # consume the state if it was issued by us

    provider_name = SSO_PROVIDERS[provider]["name"]
    user_id = str(uuid.uuid4())
    email = f"sso_user_{uuid.uuid4().hex[:8]}@{provider}.com"
    full_name = f"SSO User ({provider_name})"

    user_data = {
        "id": user_id,
        "email": email,
        "full_name": full_name,
        "avatar_url": f"https://ui-avatars.com/api/?name={provider_name}+User",
        "provider": provider,
        "provider_user_id": f"{provider}_{uuid.uuid4().hex[:8]}",
    }

    USERS_DB[user_id] = user_data
    LINKED_ACCOUNTS_DB[f"{user_id}_{provider}"] = {
        "user_id": user_id,
        "provider": provider,
        "linked_at": datetime.now(timezone.utc).isoformat(),
    }

    access_token = f"sso_{secrets.token_urlsafe(48)}"
    TOKENS_DB[access_token] = {
        "user_id": user_id,
        "provider": provider,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user_data,
        "provider": provider,
        "is_new_user": True,
    }


@router.get("/userinfo", tags=["SSO [legacy]"])
async def get_userinfo(authorization: str = Query(default="")):
    token = authorization.replace("Bearer ", "").strip() if authorization else ""
    if not token:
        raise HTTPException(status_code=401, detail="Missing authorization token")

    data = TOKENS_DB.get(token)
    if not data:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user = USERS_DB.get(data["user_id"])
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return {"user": user, "provider": data.get("provider")}


@router.delete("/unlink/{provider}", tags=["SSO [legacy]"])
async def unlink_provider(provider: str, authorization: str = Query(default="")):
    token = authorization.replace("Bearer ", "").strip() if authorization else ""
    if not token:
        raise HTTPException(status_code=401, detail="Missing authorization token")

    data = TOKENS_DB.get(token)
    if not data:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user_id = data["user_id"]
    link_key = f"{user_id}_{provider}"
    existed = link_key in LINKED_ACCOUNTS_DB
    if existed:
        del LINKED_ACCOUNTS_DB[link_key]

    return {
        "unlinked": existed,
        "provider": provider,
        "message": f"Successfully unlinked {provider}" if existed else f"No {provider} link found",
    }
