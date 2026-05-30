from typing import Any

class AIROSException(Exception):
    status_code: int = 500
    error_code: str = "INTERNAL_ERROR"
    def __init__(self, message: str = "An internal error occurred", details: dict[str, Any] | None = None):
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

class ValidationError(AIROSException):
    status_code = 422
    error_code = "VALIDATION_ERROR"

class RateLimitError(AIROSException):
    status_code = 429
    error_code = "RATE_LIMIT_EXCEEDED"
