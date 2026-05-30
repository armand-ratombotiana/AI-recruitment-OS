"""OpenTelemetry tracing and metrics for AI-ROS."""

from __future__ import annotations

from typing import Any

from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from opentelemetry.sdk.resources import Resource

from src.config import get_settings

settings = get_settings()


def init_tracing(service_name: str | None = None) -> None:
    resource = Resource.create({
        "service.name": service_name or settings.OTEL_SERVICE_NAME,
        "service.version": settings.APP_VERSION,
        "deployment.environment": settings.ENVIRONMENT,
    })

    provider = TracerProvider(resource=resource)
    exporter = OTLPSpanExporter(endpoint=settings.OTEL_EXPORTER_OTLP_ENDPOINT)
    provider.add_span_processor(BatchSpanProcessor(exporter))
    trace.set_tracer_provider(provider)


def get_tracer(name: str) -> trace.Tracer:
    return trace.get_tracer(name)


class AISpanAttributes:
    """Custom span attributes for AI observability."""

    @staticmethod
    def agent_span(
        agent_type: str,
        task_type: str,
        tenant_id: str,
    ) -> dict[str, str]:
        return {
            "airos.agent.type": agent_type,
            "airos.agent.task": task_type,
            "airos.tenant.id": tenant_id,
        }

    @staticmethod
    def llm_span(
        model: str,
        prompt_tokens: int,
        completion_tokens: int,
        temperature: float,
    ) -> dict[str, Any]:
        return {
            "airos.llm.model": model,
            "airos.llm.prompt_tokens": prompt_tokens,
            "airos.llm.completion_tokens": completion_tokens,
            "airos.llm.total_tokens": prompt_tokens + completion_tokens,
            "airos.llm.temperature": temperature,
        }

    @staticmethod
    def evaluation_span(
        candidate_id: str,
        evaluation_type: str,
        score: float,
    ) -> dict[str, Any]:
        return {
            "airos.evaluation.candidate_id": candidate_id,
            "airos.evaluation.type": evaluation_type,
            "airos.evaluation.score": score,
        }
