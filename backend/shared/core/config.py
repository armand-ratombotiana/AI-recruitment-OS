from functools import lru_cache
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    APP_NAME: str = "AI-ROS"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True
    ENVIRONMENT: str = "development"
    API_V1_PREFIX: str = "/api/v1"

    SECRET_KEY: str = "dev-secret-key-change-in-production-min-32-chars!!"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    ENCRYPTION_KEY: str = "dev-encryption-key-change-in-production-32!!"

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

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "case_sensitive": True, "extra": "ignore"}

@lru_cache
def get_settings() -> Settings:
    return Settings()
