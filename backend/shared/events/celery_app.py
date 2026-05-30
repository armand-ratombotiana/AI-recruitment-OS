from __future__ import annotations
from celery import Celery
from shared.core.config import get_settings

settings = get_settings()
celery_app = Celery("ai_ros", broker=settings.CELERY_BROKER_URL, backend=settings.CELERY_RESULT_BACKEND)
celery_app.conf.update(task_serializer="json", accept_content=["json"], result_serializer="json", timezone="UTC", enable_utc=True)
