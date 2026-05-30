"""AI-Native Recruitment Operating System — Core Configuration."""

from functools import lru_cache
from typing import Any

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Application
    APP_NAME: str = "AI-ROS"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    ENVIRONMENT: str = "production"
    API_V1_PREFIX: str = "/api/v1"

    # Security
    SECRET_KEY: str = Field(..., min_length=32)
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    ENCRYPTION_KEY: str = Field(..., min_length=32)

    # Database
    DATABASE_URL: str = Field(..., description="PostgreSQL connection URL")
    DATABASE_POOL_SIZE: int = 20
    DATABASE_MAX_OVERFLOW: int = 10
    DATABASE_POOL_TIMEOUT: int = 30

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    REDIS_CACHE_TTL: int = 3600

    # Kafka
    KAFKA_BOOTSTRAP_SERVERS: str = "localhost:9092"
    KAFKA_CONSUMER_GROUP: str = "ai-ros-consumers"
    KAFKA_AUTO_OFFSET_RESET: str = "earliest"

    # Celery
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/2"

    # AI Providers
    OPENAI_API_KEY: str = Field(..., description="OpenAI API key")
    OPENAI_ORG_ID: str = ""
    OPENAI_MODEL_PRIMARY: str = "gpt-4o"
    OPENAI_MODEL_FAST: str = "gpt-4o-mini"
    OPENAI_EMBEDDING_MODEL: str = "text-embedding-3-large"

    ANTHROPIC_API_KEY: str = Field(default="", description="Anthropic API key")
    ANTHROPIC_MODEL_PRIMARY: str = "claude-sonnet-4-20250514"

    # AI Configuration
    AI_MAX_TOKENS_DEFAULT: int = 4096
    AI_TEMPERATURE_DEFAULT: float = 0.7
    AI_CACHE_ENABLED: bool = True
    AI_SEMANTIC_CACHE_TTL: int = 86400

    # Vector Database (pgvector)
    PGVECTOR_URL: str = Field(default="", description="pgvector connection URL")
    EMBEDDING_DIMENSION: int = 3072

    # Elasticsearch
    ELASTICSEARCH_URL: str = "http://localhost:9200"
    ELASTICSEARCH_INDEX_PREFIX: str = "ai-ros"

    # S3 Storage
    S3_ENDPOINT: str = ""
    S3_BUCKET: str = "ai-ros-storage"
    S3_REGION: str = "us-east-1"
    S3_ACCESS_KEY: str = ""
    S3_SECRET_KEY: str = ""

    # Code Execution Sandbox
    SANDBOX_DOCKER_IMAGE: str = "ai-ros-sandbox:latest"
    SANDBOX_TIMEOUT_SECONDS: int = 30
    SANDBOX_MEMORY_LIMIT: str = "512m"
    SANDBOX_CPU_LIMIT: str = "0.5"

    # WebSocket
    WS_HEARTBEAT_INTERVAL: int = 30
    WS_MAX_CONNECTIONS_PER_USER: int = 5

    # Rate Limiting
    RATE_LIMIT_DEFAULT: str = "100/minute"
    RATE_LIMIT_AI: str = "30/minute"
    RATE_LIMIT_LOGIN: str = "10/minute"

    # Observability
    OTEL_ENABLED: bool = True
    OTEL_SERVICE_NAME: str = "ai-ros"
    OTEL_EXPORTER_OTLP_ENDPOINT: str = "http://localhost:4317"
    PROMETHEUS_PORT: int = 9090

    # Multi-Tenant
    TENANT_HEADER: str = "X-Tenant-ID"
    DEFAULT_TENANT: str = "default"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "case_sensitive": True}

    @field_validator("DATABASE_URL")
    @classmethod
    def validate_database_url(cls, v: str) -> str:
        if not v.startswith(("postgresql://", "postgresql+asyncpg://")):
            raise ValueError("DATABASE_URL must be a PostgreSQL connection string")
        return v


@lru_cache
def get_settings() -> Settings:
    """Return cached application settings singleton."""
    return Settings()
