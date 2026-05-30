from __future__ import annotations
from dataclasses import dataclass
from typing import Any

from shared.ai.llm_router import LLMRouter


@dataclass
class RAGConfig:
    chunk_size: int = 1000
    chunk_overlap: int = 200
    top_k: int = 20
    rerank_top: int = 10
    max_context_tokens: int = 4000
    embedding_model: str = "text-embedding-3-large"


class RAGPipeline:
    def __init__(self, config: RAGConfig | None = None):
        self.config = config or RAGConfig()
        self.llm = LLMRouter()

    async def ingest(self, document: str, metadata: dict[str, Any], tenant_id: str) -> list[str]:
        chunks = self._chunk_document(document)
        chunk_ids = []
        for i, _chunk in enumerate(chunks):
            chunk_id = f"chunk_{tenant_id}_{i}"
            chunk_ids.append(chunk_id)
        return chunk_ids

    async def retrieve(self, query: str, tenant_id: str, filters: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        return []

    async def generate(self, query: str, context: list[dict[str, Any]], system_prompt: str | None = None) -> str:
        context_text = "\n\n".join([c.get("content", "") for c in context])
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": f"Context:\n{context_text}\n\nQuestion: {query}"})
        response = await self.llm.complete(messages)
        return response.content

    async def query(self, query: str, tenant_id: str, system_prompt: str | None = None) -> dict[str, Any]:
        context = await self.retrieve(query, tenant_id)
        answer = await self.generate(query, context, system_prompt)
        return {"answer": answer, "sources": context, "query": query}

    def _chunk_document(self, document: str) -> list[str]:
        chunks = []
        start = 0
        while start < len(document):
            end = start + self.config.chunk_size
            chunks.append(document[start:end])
            start = end - self.config.chunk_overlap
        return chunks

    async def _generate_embedding(self, text: str) -> list[float]:
        return [0.0] * 3072
