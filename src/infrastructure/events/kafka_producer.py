"""Kafka event producer and consumer infrastructure."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any, Callable, Coroutine

from aiokafka import AIOKafkaConsumer, AIOKafkaProducer

from src.config import get_settings

settings = get_settings()


class EventProducer:
    """Async Kafka event producer with outbox pattern support."""

    def __init__(self) -> None:
        self._producer: AIOKafkaProducer | None = None

    async def start(self) -> None:
        self._producer = AIOKafkaProducer(
            bootstrap_servers=settings.KAFKA_BOOTSTRAP_SERVERS,
            value_serializer=lambda v: json.dumps(v).encode("utf-8"),
            key_serializer=lambda k: k.encode("utf-8") if k else None,
            acks="all",
            enable_idempotence=True,
            retries=3,
        )
        await self._producer.start()

    async def stop(self) -> None:
        if self._producer:
            await self._producer.stop()

    async def publish(
        self,
        topic: str,
        key: str | None,
        event_type: str,
        payload: dict[str, Any],
        headers: dict[str, str] | None = None,
    ) -> None:
        if not self._producer:
            raise RuntimeError("Producer not started. Call start() first.")

        event = {
            "event_id": str(uuid.uuid4()),
            "event_type": event_type,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "payload": payload,
            "metadata": headers or {},
        }

        kafka_headers = [
            ("event_type", event_type.encode()),
            ("event_id", event["event_id"].encode()),
        ]

        await self._producer.send_and_wait(
            topic=topic,
            key=key,
            value=event,
            headers=kafka_headers,
        )


class EventConsumer:
    """Async Kafka event consumer with automatic retry and dead-letter handling."""

    def __init__(
        self,
        group_id: str,
        topics: list[str],
        handler: Callable[..., Coroutine[Any, Any, None]],
    ) -> None:
        self.group_id = group_id
        self.topics = topics
        self.handler = handler
        self._consumer: AIOKafkaConsumer | None = None
        self._max_retries = 3

    async def start(self) -> None:
        self._consumer = AIOKafkaConsumer(
            *self.topics,
            bootstrap_servers=settings.KAFKA_BOOTSTRAP_SERVERS,
            group_id=self.group_id,
            auto_offset_reset=settings.KAFKA_AUTO_OFFSET_RESET,
            enable_auto_commit=False,
            value_deserializer=lambda v: json.loads(v.decode("utf-8")),
        )
        await self._consumer.start()

    async def stop(self) -> None:
        if self._consumer:
            await self._consumer.stop()

    async def consume(self) -> None:
        if not self._consumer:
            raise RuntimeError("Consumer not started.")

        async for message in self._consumer:
            event = message.value
            retries = 0
            while retries < self._max_retries:
                try:
                    await self.handler(event)
                    break
                except Exception:
                    retries += 1
                    if retries >= self._max_retries:
                        # Send to dead-letter queue
                        await self._send_to_dlq(message.topic, event)

            await self._consumer.commit()

    async def _send_to_dlq(self, original_topic: str, event: dict[str, Any]) -> None:
        dlq_topic = f"{original_topic}.dlq"
        if self._consumer:
            producer = AIOKafkaProducer(
                bootstrap_servers=settings.KAFKA_BOOTSTRAP_SERVERS,
                value_serializer=lambda v: json.dumps(v).encode("utf-8"),
            )
            await producer.start()
            try:
                event["dlq_metadata"] = {
                    "original_topic": original_topic,
                    "failed_at": datetime.now(timezone.utc).isoformat(),
                }
                await producer.send_and_wait(dlq_topic, value=event)
            finally:
                await producer.stop()
