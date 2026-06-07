"""Shared authentication, tenancy, and RBAC helpers."""

from shared.auth.dependencies import (
    require_admin,
    require_authenticated_user,
    require_member,
    require_role,
    require_tenant_id,
)
from shared.auth.api_key import require_api_key_or_user

# ``require_user`` is the conventional short name; expose the JWT-validating
# dependency under that alias so callers can ``Depends(require_user)``.
require_user = require_authenticated_user

__all__ = [
    "require_admin",
    "require_api_key_or_user",
    "require_authenticated_user",
    "require_member",
    "require_role",
    "require_tenant_id",
    "require_user",
]
