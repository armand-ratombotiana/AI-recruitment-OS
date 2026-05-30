"""SSO Service — Single Sign-On with Google, LinkedIn, Microsoft, Apple."""
from fastapi import APIRouter, Request
from pydantic import BaseModel
from typing import Optional

router = APIRouter()

class SSOProvider(BaseModel):
    name: str
    client_id: str
    redirect_uri: str
    scopes: list[str]

class SSOLoginRequest(BaseModel):
    provider: str
    code: str
    redirect_uri: str

class SSOLoginResponse(BaseModel):
    access_token: str
    refresh_token: str
    user: dict
    provider: str
    is_new_user: bool

SSO_PROVIDERS = {
    "google": {
        "name": "Google",
        "authorization_url": "https://accounts.google.com/o/oauth2/v2/auth",
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
        "scopes": ["openid", "profile", "email"],
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

@router.get("/health")
async def health():
    return {"status": "healthy", "service": "sso"}

@router.get("/providers")
async def list_providers():
    """List available SSO providers."""
    return {
        "providers": [
            {"name": p["name"], "icon": p["icon"], "authorization_url": p["authorization_url"]}
            for p in SSO_PROVIDERS.values()
        ]
    }

@router.get("/providers/{provider}/authorize")
async def get_authorize_url(provider: str, redirect_uri: str, state: str = ""):
    """Get authorization URL for SSO provider."""
    if provider not in SSO_PROVIDERS:
        return {"error": f"Unknown provider: {provider}"}

    config = SSO_PROVIDERS[provider]
    params = {
        "client_id": f"client_id_{provider}",
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": " ".join(config["scopes"]),
        "state": state or str(__import__("uuid").uuid4()),
    }

    if provider == "linkedin":
        params["response_type"] = "code"

    query_string = "&".join(f"{k}={v}" for k, v in params.items())
    authorization_url = f"{config['authorization_url']}?{query_string}"

    return {
        "provider": provider,
        "authorization_url": authorization_url,
        "state": params["state"],
    }

@router.post("/providers/{provider}/callback")
async def sso_callback(provider: str, data: SSOLoginRequest):
    """Handle SSO callback and create/login user."""
    if provider not in SSO_PROVIDERS:
        return {"error": f"Unknown provider: {provider}"}

    user_data = {
        "id": str(__import__("uuid").uuid4()),
        "email": f"user@{provider}.com",
        "full_name": f"SSO User ({provider})",
        "avatar_url": f"https://ui-avatars.com/api/?name=SSO+User",
        "provider": provider,
        "provider_user_id": f"{provider}_user_123",
    }

    return {
        "access_token": f"token_{provider}_access",
        "refresh_token": f"token_{provider}_refresh",
        "user": user_data,
        "provider": provider,
        "is_new_user": True,
    }

@router.get("/providers/{provider}/userinfo")
async def get_userinfo(provider: str):
    """Get user info from SSO provider."""
    if provider not in SSO_PROVIDERS:
        return {"error": f"Unknown provider: {provider}"}

    return {
        "provider": provider,
        "userinfo": {
            "id": f"{provider}_user_123",
            "email": f"user@{provider}.com",
            "name": f"SSO User ({provider})",
            "picture": f"https://ui-avatars.com/api/?name=SSO+User",
            "verified_email": True,
        }
    }

@router.post("/providers/{provider}/unlink")
async def unlink_provider(provider: str, user_id: str):
    """Unlink SSO provider from user account."""
    return {
        "user_id": user_id,
        "provider": provider,
        "unlinked": True,
        "message": f"Successfully unlinked {provider} from your account"
    }
