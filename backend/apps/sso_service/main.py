"""SSO Service — Single Sign-On with Google, LinkedIn, Microsoft, Apple."""
from __future__ import annotations

import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel


SSO_PROVIDERS = {
    "google": {
        "name": "Google",
        "authorization_url": "https://accounts.google.com/o/oauth2/auth",
        "token_url": "https://oauth2.googleapis.com/token",
        "userinfo_url": "https://www.googleapis.com/oauth2/v2/userinfo",
        "scopes": ["email", "profile"],
        "icon": "google",
    },
    "linkedin": {
        "name": "LinkedIn",
        "authorization_url": "https://www.linkedin.com/oauth/v2/authorization",
        "token_url": "https://www.linkedin.com/oauth/v2/accessToken",
        "userinfo_url": "https://api.linkedin.com/v2/userinfo",
        "scopes": ["r_liteprofile", "r_emailaddress"],
        "icon": "linkedin",
    },
    "microsoft": {
        "name": "Microsoft",
        "authorization_url": "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
        "token_url": "https://login.microsoftonline.com/common/oauth2/v2.0/token",
        "userinfo_url": "https://graph.microsoft.com/v1.0/me",
        "scopes": ["openid", "email", "profile"],
        "icon": "microsoft",
    },
    "apple": {
        "name": "Apple",
        "authorization_url": "https://appleid.apple.com/auth/authorize",
        "token_url": "https://appleid.apple.com/auth/token",
        "userinfo_url": "https://appleid.apple.com/auth/userinfo",
        "scopes": ["email", "name"],
        "icon": "apple",
    },
}

STATE_EXPIRY_SECONDS = 600
_states: dict[str, datetime] = {}
LINKED_ACCOUNTS_DB: dict[str, dict] = {}
TOKENS_DB: dict[str, dict] = {}
USERS_DB: dict[str, dict] = {}


class CallbackRequest(BaseModel):
    provider: str
    code: str
    state: Optional[str] = None
    redirect_uri: Optional[str] = None


router = APIRouter()


def _generate_state() -> str:
    state = secrets.token_urlsafe(32)
    _states[state] = datetime.now(timezone.utc)
    return state


def _verify_state(state: str) -> bool:
    if state not in _states:
        return False
    created = _states.pop(state)
    return (datetime.now(timezone.utc) - created).total_seconds() < STATE_EXPIRY_SECONDS


def _create_token(user_id: str, provider: str) -> str:
    token = f"sso_{secrets.token_urlsafe(48)}"
    TOKENS_DB[token] = {
        "user_id": user_id,
        "provider": provider,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    return token


def _get_user_from_token(token: str) -> Optional[dict]:
    data = TOKENS_DB.get(token)
    if not data:
        return None
    return USERS_DB.get(data["user_id"])


@router.get("/health")
async def health():
    return {"status": "healthy", "service": "sso"}


@router.get("/providers")
async def list_providers():
    return {
        "providers": [
            {
                "id": key,
                "name": p["name"],
                "icon": p["icon"],
                "auth_url": f"/sso/providers/{key}/authorize",
            }
            for key, p in SSO_PROVIDERS.items()
        ]
    }


@router.get("/providers/{provider}/authorize")
async def get_authorize_url(provider: str, redirect_uri: str):
    if provider not in SSO_PROVIDERS:
        raise HTTPException(status_code=404, detail=f"Provider '{provider}' not found")

    config = SSO_PROVIDERS[provider]
    state = _generate_state()
    scope = "+".join(config["scopes"])

    query_params = {
        "client_id": f"client_id_{provider}",
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": scope,
        "state": state,
    }
    query_string = "&".join(f"{k}={v}" for k, v in query_params.items())
    authorization_url = f"{config['authorization_url']}?{query_string}"

    return {"authorization_url": authorization_url, "state": state}


@router.post("/providers/{provider}/callback")
async def sso_callback(provider: str, data: CallbackRequest):
    if provider not in SSO_PROVIDERS:
        raise HTTPException(status_code=404, detail=f"Provider '{provider}' not found")

    if data.state and not _verify_state(data.state):
        raise HTTPException(status_code=400, detail="Invalid or expired state token")

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

    access_token = _create_token(user_id, provider)

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user_data,
    }


@router.get("/userinfo")
async def get_userinfo(authorization: str = Header(default="")):
    token = authorization.replace("Bearer ", "").strip() if authorization else ""
    if not token:
        raise HTTPException(status_code=401, detail="Missing authorization token")

    data = TOKENS_DB.get(token)
    if not data:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user = USERS_DB.get(data["user_id"])
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return {"user": user}


@router.delete("/unlink/{provider}")
async def unlink_provider(provider: str, authorization: str = Header(default="")):
    token = authorization.replace("Bearer ", "").strip() if authorization else ""
    if not token:
        raise HTTPException(status_code=401, detail="Missing authorization token")

    data = TOKENS_DB.get(token)
    if not data:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user_id = data["user_id"]
    link_key = f"{user_id}_{provider}"

    if link_key in LINKED_ACCOUNTS_DB:
        del LINKED_ACCOUNTS_DB[link_key]

    return {"success": True, "message": f"Successfully unlinked {provider}"}
