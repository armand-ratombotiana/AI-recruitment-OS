"""Tests for embedding generation in the matching engine."""

from __future__ import annotations

import pytest

from shared.matching.engine import _get_embedding, _generate_semantic_pseudo_embedding


pytestmark = [pytest.mark.unit]


class TestPseudoEmbedding:
    def test_dimensions(self):
        embedding = _generate_semantic_pseudo_embedding("test text", dimensions=384)
        assert len(embedding) == 384

    def test_custom_dimensions(self):
        embedding = _generate_semantic_pseudo_embedding("test text", dimensions=128)
        assert len(embedding) == 128

    def test_normalized(self):
        embedding = _generate_semantic_pseudo_embedding("test text", dimensions=384)
        magnitude = sum(x * x for x in embedding) ** 0.5
        assert abs(magnitude - 1.0) < 0.01

    def test_deterministic(self):
        emb1 = _generate_semantic_pseudo_embedding("python developer", dimensions=384)
        emb2 = _generate_semantic_pseudo_embedding("python developer", dimensions=384)
        assert emb1 == emb2

    def test_different_for_different_text(self):
        emb1 = _generate_semantic_pseudo_embedding("python developer", dimensions=384)
        emb2 = _generate_semantic_pseudo_embedding("java developer", dimensions=384)
        assert emb1 != emb2

    def test_similar_for_similar_text(self):
        emb1 = _generate_semantic_pseudo_embedding("python developer", dimensions=384)
        emb2 = _generate_semantic_pseudo_embedding("python programmer", dimensions=384)
        dot_product = sum(a * b for a, b in zip(emb1, emb2))
        assert dot_product > 0.3

    def test_empty_text(self):
        embedding = _generate_semantic_pseudo_embedding("", dimensions=384)
        assert len(embedding) == 384
        assert all(x == 0.0 for x in embedding)

    def test_all_values_are_floats(self):
        embedding = _generate_semantic_pseudo_embedding("test", dimensions=64)
        assert all(isinstance(x, float) for x in embedding)


class TestGetEmbedding:
    def test_returns_list(self):
        embedding = _get_embedding("test text")
        assert isinstance(embedding, list)

    def test_returns_correct_dimensions(self):
        embedding = _get_embedding("test text")
        assert len(embedding) == 384

    def test_returns_floats(self):
        embedding = _get_embedding("test text")
        assert all(isinstance(x, (int, float)) for x in embedding)

    def test_deterministic_fallback(self):
        emb1 = _get_embedding("python developer")
        emb2 = _get_embedding("python developer")
        assert emb1 == emb2

    def test_different_inputs_different_embeddings(self):
        emb1 = _get_embedding("python developer")
        emb2 = _get_embedding("java developer")
        assert emb1 != emb2


class TestLLMRouterEmbed:
    @pytest.mark.asyncio
    async def test_mock_embedding_returns_vector(self):
        from shared.ai.llm_router import LLMRouter
        router = LLMRouter(allow_mock=True)
        embedding = router._mock_embedding("test text")
        assert isinstance(embedding, list)
        assert len(embedding) == 384

    @pytest.mark.asyncio
    async def test_mock_embedding_normalized(self):
        from shared.ai.llm_router import LLMRouter
        router = LLMRouter(allow_mock=True)
        embedding = router._mock_embedding("test text")
        magnitude = sum(x * x for x in embedding) ** 0.5
        assert abs(magnitude - 1.0) < 0.01

    @pytest.mark.asyncio
    async def test_mock_embedding_deterministic(self):
        from shared.ai.llm_router import LLMRouter
        router = LLMRouter(allow_mock=True)
        emb1 = router._mock_embedding("python developer")
        emb2 = router._mock_embedding("python developer")
        assert emb1 == emb2

    @pytest.mark.asyncio
    async def test_embed_falls_back_to_mock(self):
        from shared.ai.llm_router import LLMRouter
        router = LLMRouter(openai_api_key="sk-placeholder", allow_mock=True)
        embedding = await router.embed("test text")
        assert isinstance(embedding, list)
        assert len(embedding) == 384

    @pytest.mark.asyncio
    async def test_embed_different_texts(self):
        from shared.ai.llm_router import LLMRouter
        router = LLMRouter(openai_api_key="sk-placeholder", allow_mock=True)
        emb1 = await router.embed("python developer")
        emb2 = await router.embed("java developer")
        assert emb1 != emb2
