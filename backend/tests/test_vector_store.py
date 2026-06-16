import pytest
from shared.vector_store.store import VectorStore, get_vector_store


def test_vector_store_add():
    store = VectorStore(dimensions=384)
    vector = [0.1] * 384
    store.add("doc1", vector, {"type": "candidate"})
    assert store.count() == 1


def test_vector_store_search():
    store = VectorStore(dimensions=384)

    store.add("doc1", [1.0] + [0.0] * 383, {"name": "Python Dev"})
    store.add("doc2", [0.0, 1.0] + [0.0] * 382, {"name": "Java Dev"})
    store.add("doc3", [0.9, 0.1] + [0.0] * 382, {"name": "Python/JS Dev"})

    query = [0.95, 0.05] + [0.0] * 382
    results = store.search(query, top_k=2)

    assert len(results) == 2
    assert results[0]["id"] == "doc1"


def test_vector_store_search_with_filters():
    store = VectorStore(dimensions=384)

    store.add("doc1", [1.0] + [0.0] * 383, {"type": "candidate"})
    store.add("doc2", [0.9] + [0.0] * 383, {"type": "job"})

    results = store.search(
        [1.0] + [0.0] * 383,
        top_k=10,
        filters={"type": "candidate"}
    )

    assert len(results) == 1
    assert results[0]["id"] == "doc1"


def test_vector_store_delete():
    store = VectorStore(dimensions=384)
    store.add("doc1", [0.1] * 384)
    assert store.count() == 1

    store.delete("doc1")
    assert store.count() == 0


def test_cosine_similarity():
    store = VectorStore(dimensions=3)

    sim = store._cosine_similarity([1, 0, 0], [1, 0, 0])
    assert abs(sim - 1.0) < 0.01

    sim = store._cosine_similarity([1, 0, 0], [0, 1, 0])
    assert abs(sim) < 0.01

    sim = store._cosine_similarity([1, 0, 0], [-1, 0, 0])
    assert abs(sim + 1.0) < 0.01


def test_get_vector_store_singleton():
    store1 = get_vector_store()
    store2 = get_vector_store()
    assert store1 is store2
