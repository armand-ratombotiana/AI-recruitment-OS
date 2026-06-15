"""Shared FastAPI dependencies for authentication, tenancy, and RBAC.

These build on the lower-level helpers in ``shared.core.security`` (which
decode raw JWTs) and add the high-level dependency factories used by the
service routers:

* :func:`require_role` — RBAC check with role hierarchy support
* :func:`require_tenant_id` — extract the tenant id from the bearer token
* :func:`require_admin` — convenience wrapper for the admin roles
* :func:`require_authenticated_user` — pass-through that still raises 401

All dependencies raise ``HTTPException`` with the appropriate status code:

* 401 — missing / invalid / expired token (no authenticated principal)
* 403 — authenticated but lacks the required role
"""
from __future__ import annotations

from typing import Any, Iterable

from fastapi import Header, HTTPException, status

from shared.core.security import require_user as _require_user


_ROLE_RANK: dict[str, int] = {
    "viewer": 10,
    "member": 20,
    "admin": 30,
    "super_admin": 40,
}

_ROLE_ALIASES: dict[str, str] = {
    "super_admin": "super_admin",
    "tenant_admin": "admin",
    "admin": "admin",
    "recruiter": "member",
    "hiring_manager": "member",
    "interviewer": "member",
    "candidate": "viewer",
    "member": "member",
    "viewer": "viewer",
    "user": "viewer",
    "guest": "viewer",
}


def _normalize_role(value: Any) -> str | None:
    if value is None:
        return None
    raw = str(value).strip().lower()
    if not raw:
        return None
    return _ROLE_ALIASES.get(raw, raw)


def _role_rank(value: Any) -> int:
    norm = _normalize_role(value)
    if norm is None:
        return 0
    return _ROLE_RANK.get(norm, 0)


def _user_role(user: dict[str, Any]) -> str | None:
    return _normalize_role(user.get("role"))


def _coerce_roles(roles: Iterable[Any] | Any) -> list[str]:
    if roles is None or isinstance(roles, (str, bytes)):
        iterable = [roles] if roles is not None else []
    else:
        iterable = list(roles)
    normalized: list[str] = []
    for r in iterable:
        n = _normalize_role(r)
        if n:
            normalized.append(n)
    return normalized


def _build_role_dependency(allowed_roles: tuple[str, ...]) -> Any:
    normalized_allowed = _coerce_roles(allowed_roles)
    if not normalized_allowed:
        raise ValueError("require_role() needs at least one role")

    min_rank = min((_ROLE_RANK.get(r, 0) for r in normalized_allowed), default=0)
    accepts_explicit = set(normalized_allowed)

    def _dependency(authorization: str | None = Header(None)) -> dict[str, Any]:
        user = _require_user(authorization=authorization)
        role = _user_role(user)
        if role is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Authenticated user has no role assigned",
            )
        rank = _ROLE_RANK.get(role, 0)
        if role in accepts_explicit or rank >= min_rank:
            return user
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Insufficient role: requires one of "
                + ", ".join(sorted(accepts_explicit))
                + f" (got '{user.get('role')}')"
            ),
        )

    return _dependency


def require_authenticated_user(
    authorization: str | None = Header(None),
) -> dict[str, Any]:
    """Pass-through dependency that enforces a valid bearer access token.

    Returns the decoded user payload as a dict with keys ``id``, ``email``,
    ``role``, ``tenant_id``.  Raises 401 when the token is missing or invalid.
    """
    return _require_user(authorization=authorization)


def require_tenant_id(
    authorization: str | None = Header(None),
) -> str:
    """Extract the tenant id from the current access token.

    Raises 403 if the token has no ``tenant_id`` claim.
    Raises 401 if there is no valid token.
    """
    user = _require_user(authorization=authorization)
    tenant_id = user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Token missing tenant_id claim",
        )
    return tenant_id


def require_role(*allowed_roles: str):
    """Build a dependency that enforces an RBAC role check.

    Accepts a list of named roles (e.g. ``require_role("admin", "super_admin")``)
    or named hierarchy levels (``"viewer"``, ``"member"``, ``"admin"``,
    ``"super_admin"``).  When a hierarchy level is supplied, any user whose
    role outranks it is also accepted.  The current hierarchy is::

        super_admin > admin > member > viewer

    Examples::

        @router.post("/", dependencies=[Depends(require_role("admin"))])
        async def create_tenant(...): ...

        @router.delete("/{id}", dependencies=[Depends(require_role("admin", "super_admin"))])
        async def delete_user(...): ...

    Returns the authenticated user dict so endpoints can also use it directly
    (e.g. ``user = Depends(require_role("admin"))``).
    """
    return _build_role_dependency(tuple(allowed_roles))


require_admin = _build_role_dependency(("admin", "super_admin"))
require_member = _build_role_dependency(("member", "admin", "super_admin"))
