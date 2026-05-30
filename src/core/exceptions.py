"""Core exceptions for the AI-ROS platform."""

from __future__ import annotations

from typing import Any


class AIROSException(Exception):
    """Base exception for all AI-ROS errors."""

    status_code: int = 500
    error_code: str = "INTERNAL_ERROR"

    def __init__(
        self,
        message: str = "An internal error occurred",
        details: dict[str, Any] | None = None,
    ) -> None:
        self.message = message
        self.details = details or {}
        super().__init__(self.message)


class AuthenticationError(AIROSException):
    status_code = 401
    error_code = "AUTHENTICATION_ERROR"


class AuthorizationError(AIROSException):
    status_code = 403
    error_code = "AUTHORIZATION_ERROR"


class NotFoundError(AIROSException):
    status_code = 404
    error_code = "NOT_FOUND"


class ConflictError(AIROSException):
    status_code = 409
    error_code = "CONFLICT"


class ValidationError(AIROSException):
    status_code = 422
    error_code = "VALIDATION_ERROR"


class RateLimitError(AIROSException):
    status_code = 429
    error_code = "RATE_LIMIT_EXCEEDED"


class TenantError(AIROSException):
    status_code = 400
    error_code = "TENANT_ERROR"


class AIProviderError(AIROSException):
    status_code = 502
    error_code = "AI_PROVIDER_ERROR"


class SandboxError(AIROSException):
    status_code = 500
    error_code = "SANDBOX_ERROR"


class WorkflowError(AIROSException):
    status_code = 500
    error_code = "WORKFLOW_ERROR"
