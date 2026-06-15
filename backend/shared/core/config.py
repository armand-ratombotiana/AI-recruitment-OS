import os
from functools import lru_cache
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    APP_NAME: str = "AI-ROS"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = os.getenv("DEBUG", "false").lower() == "true"
    ENVIRONMENT: str = "development"
    API_V1_PREFIX: str = "/api/v1"

    SECRET_KEY: str = os.getenv("SECRET_KEY") or ""
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    ENCRYPTION_KEY: str = os.getenv("ENCRYPTION_KEY") or ""

    DATABASE_URL: str = "postgresql+asyncpg://airos:airos_dev_password@localhost:5432/airos"
    DATABASE_POOL_SIZE: int = 20
    DATABASE_MAX_OVERFLOW: int = 10

    REDIS_URL: str = "redis://localhost:6379/0"
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/2"

    KAFKA_BOOTSTRAP_SERVERS: str = "localhost:9092"
    KAFKA_CONSUMER_GROUP: str = "ai-ros-consumers"

    OPENAI_API_KEY: str = "sk-placeholder"
    OPENAI_ORG_ID: str = ""
    OPENAI_MODEL_PRIMARY: str = "gpt-4o"
    OPENAI_MODEL_FAST: str = "gpt-4o-mini"
    OPENAI_EMBEDDING_MODEL: str = "text-embedding-3-large"
    ANTHROPIC_API_KEY: str = ""
    ANTHROPIC_MODEL_PRIMARY: str = "claude-sonnet-4-20250514"

    ELASTICSEARCH_URL: str = "http://localhost:9200"
    S3_ENDPOINT: str = ""
    S3_BUCKET: str = "airos-storage"
    S3_ACCESS_KEY: str = ""
    S3_SECRET_KEY: str = ""

    OTEL_ENABLED: bool = False
    OTEL_SERVICE_NAME: str = "ai-ros"
    OTEL_EXPORTER_OTLP_ENDPOINT: str = "http://localhost:4317"

    TENANT_HEADER: str = "X-Tenant-ID"

    # Mailing
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM_EMAIL: str = "noreply@airos.io"
    SMTP_FROM_NAME: str = "AI-ROS"
    SMTP_USE_TLS: bool = True
    SMTP_USE_SSL: bool = False
    MAIL_MOCK_MODE: bool = True

    # Auth hardening
    AUTH_MAX_FAILED_ATTEMPTS: int = 5
    AUTH_LOCKOUT_BASE_SECONDS: int = 30
    AUTH_LOCKOUT_MAX_SECONDS: int = 3600
    AUTH_LOGIN_RATE_LIMIT_PER_MIN: int = 10
    AUTH_REGISTER_RATE_LIMIT_PER_MIN: int = 5
    AUTH_FORGOT_PASSWORD_RATE_LIMIT_PER_MIN: int = 3
    EMAIL_VERIFY_TOKEN_HOURS: int = 24
    PASSWORD_RESET_TOKEN_HOURS: int = 2

    # Demo seed
    DEMO_EMAIL: str = "demo@airos.io"
    DEMO_PASSWORD: str = "demo1234"
    DEMO_ENABLED: bool = True

    # Billing / Payments (Stripe)
    STRIPE_SECRET_KEY: str = ""
    STRIPE_PUBLISHABLE_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""
    STRIPE_MODE: str = "mock"  # "mock" or "live"
    BILLING_CURRENCY: str = "usd"
    TRIAL_DAYS: int = 14
    ANNUAL_DISCOUNT_PCT: int = 17
    TAX_RATE_PCT: float = 0.0  # 0% by default; set in production

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "case_sensitive": True, "extra": "ignore"}

if not os.getenv("SECRET_KEY") or len(os.getenv("SECRET_KEY", "")) < 32:
    raise ValueError("SECRET_KEY must be set and at least 32 characters")
if not os.getenv("ENCRYPTION_KEY") or len(os.getenv("ENCRYPTION_KEY", "")) < 32:
    raise ValueError("ENCRYPTION_KEY must be set and at least 32 characters")

@lru_cache
def get_settings() -> Settings:
    return Settings()
