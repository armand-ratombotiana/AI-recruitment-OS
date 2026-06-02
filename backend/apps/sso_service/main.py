"""SSO Service — Single Sign-On with Google, LinkedIn, Microsoft, Apple."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel


SSO_PROVIDERS = {
    "google": {
        "name": "Google",
        "authorization_url": "https://accounts.google.com/o/oauth2/v2/auth",
        "token_url": "https://oauth2.googleapis.com/token",
        "userinfo_url": "https://www.googleapis.com/oauth2/v2/userinfo",
        "scopes": ["openid", "email", "profile"],
        "icon": "google",
    },
    "microsoft": {
        "name": "Microsoft",
        "authorization_url": "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
        "token_url": "https://login.microsoftonline.com/common/oauth2/v2.0/token",
        "userinfo_url": "https://graph.microsoft.com/v1.0/me",
        "scopes": ["openid", "profile", "email"],
        "icon": "microsoft",
    },
    "linkedin": {
        "name": "LinkedIn",
        "authorization_url": "https://www.linkedin.com/oauth/v2/authorization",
        "token_url": "https://www.linkedin.com/oauth/v2/accessToken",
        "userinfo_url": "https://api.linkedin.com/v2/userinfo",
        "scopes": ["openid", "profile", "email"],
        "icon": "linkedin",
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

LINKED_ACCOUNTS_DB: dict[str, dict] = {}
TOKENS_DB: dict[str, dict] = {}


class CallbackRequest(BaseModel):
    code: str
    state: Optional[str] = None


router = APIRouter()


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
                "authorization_url": p["authorization_url"],
                "scopes": p["scopes"],
            }
            for key, p in SSO_PROVIDERS.items()
        ],
        "total": len(SSO_PROVIDERS),
    }


@router.get("/providers/{provider}/authorize")
async def get_authorize_url(provider: str, redirect_uri: str, state: Optional[str] = None):
    if provider not in SSO_PROVIDERS:
        raise HTTPException(status_code=404, detail=f"Provider '{provider}' not found")

    config = SSO_PROVIDERS[provider]
    state_value = state or str(uuid.uuid4())

    params = {
        "client_id": f"client_id_{provider}",
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": " ".join(config["scopes"]),
        "state": state_value,
    }

    query_string = "&".join(f"{k}={v}" for k, v in params.items())
    authorization_url = f"{config['authorization_url']}?{query_string}"

    return {
        "provider": provider,
        "authorization_url": authorization_url,
        "state": state_value,
    }


@router.post("/providers/{provider}/callback")
async def sso_callback(provider: str, data: CallbackRequest):
    if provider not in SSO_PROVIDERS:
        raise HTTPException(status_code=404, detail=f"Provider '{provider}' not found")

    user_id = str(uuid.uuid4())
    access_token = f"tok_{provider}_{uuid.uuid4().hex[:16]}"
    refresh_token = f"ref_{provider}_{uuid.uuid4().hex[:16]}"

    user_data = {
        "id": user_id,
        "email": f"user_{uuid.uuid4().hex[:6]}@{provider}.com",
        "full_name": f"SSO User ({SSO_PROVIDERS[provider]['name']})",
        "avatar_url": f"https://ui-avatars.com/api/?name=SSO+User",
        "provider": provider,
        "provider_user_id": f"{provider}_{uuid.uuid4().hex[:8]}",
    }

    TOKENS_DB[access_token] = {
        "user_id": user_id,
        "provider": provider,
        "user": user_data,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    LINKED_ACCOUNTS_DB[f"{user_id}_{provider}"] = {
        "user_id": user_id,
        "provider": provider,
        "linked_at": datetime.now(timezone.utc).isoformat(),
    }

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "user": user_data,
        "provider": provider,
        "is_new_user": True,
    }


@router.get("/userinfo")
async def get_userinfo(authorization: str = ""):
    token = authorization.replace("Bearer ", "") if authorization else ""
    if not token:
        raise HTTPException(status_code=401, detail="Missing authorization token")

    token_data = TOKENS_DB.get(token)
    if not token_data:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    return {
        "user": token_data["user"],
        "provider": token_data["provider"],
    }


@router.delete("/unlink/{provider}")
async def unlink_provider(provider: str, authorization: str = ""):
    token = authorization.replace("Bearer ", "") if authorization else ""
    if not token:
        raise HTTPException(status_code=401, detail="Missing authorization token")

    token_data = TOKENS_DB.get(token)
    if not token_data:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user_id = token_data["user_id"]
    link_key = f"{user_id}_{provider}"

    if link_key in LINKED_ACCOUNTS_DB:
        del LINKED_ACCOUNTS_DB[link_key]

    return {
        "user_id": user_id,
        "provider": provider,
        "unlinked": True,
        "message": f"Successfully unlinked {provider} from your account",
    }
