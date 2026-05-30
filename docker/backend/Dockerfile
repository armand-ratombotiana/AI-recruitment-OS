# =============================================================================
# AI-ROS Backend — Production Multi-stage Dockerfile
# =============================================================================

FROM python:3.12-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev && rm -rf /var/lib/apt/lists/*

COPY requirements/requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

FROM python:3.12-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 tesseract-ocr curl && rm -rf /var/lib/apt/lists/*

RUN groupadd -r airos && useradd -r -g airos -d /app airos

WORKDIR /app
COPY --from=builder /install /usr/local
COPY . .

RUN chown -R airos:airos /app
USER airos

ENV PYTHONPATH=/app PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "apps.api_gateway.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
