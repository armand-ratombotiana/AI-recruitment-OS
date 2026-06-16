"""In-memory vector store for semantic search."""
from typing import List, Dict, Tuple
from dataclasses import dataclass, field


@dataclass
class VectorDocument:
    id: str
    vector: List[float]
    metadata: Dict = field(default_factory=dict)


class VectorStore:
    """In-memory vector store with cosine similarity search."""

    def __init__(self, dimensions: int = 384):
        self.dimensions = dimensions
        self.documents: Dict[str, VectorDocument] = {}

    def add(self, doc_id: str, vector: List[float], metadata: Dict = None):
        if len(vector) != self.dimensions:
            raise ValueError(f"Vector must have {self.dimensions} dimensions")

        self.documents[doc_id] = VectorDocument(
            id=doc_id,
            vector=vector,
            metadata=metadata or {}
        )

    def add_batch(self, documents: List[Tuple[str, List[float], Dict]]):
        for doc_id, vector, metadata in documents:
            self.add(doc_id, vector, metadata)

    def delete(self, doc_id: str):
        if doc_id in self.documents:
            del self.documents[doc_id]

    def search(
        self,
        query_vector: List[float],
        top_k: int = 10,
        filters: Dict = None
    ) -> List[Dict]:
        if len(query_vector) != self.dimensions:
            raise ValueError(f"Query vector must have {self.dimensions} dimensions")

        results = []

        for doc_id, doc in self.documents.items():
            if filters:
                match = all(
                    doc.metadata.get(key) == value
                    for key, value in filters.items()
                )
                if not match:
                    continue

            similarity = self._cosine_similarity(query_vector, doc.vector)

            results.append({
                "id": doc_id,
                "score": similarity,
                "metadata": doc.metadata
            })

        results.sort(key=lambda x: x["score"], reverse=True)

        return results[:top_k]

    def _cosine_similarity(self, vec1: List[float], vec2: List[float]) -> float:
        dot_product = sum(a * b for a, b in zip(vec1, vec2))
        magnitude1 = sum(a * a for a in vec1) ** 0.5
        magnitude2 = sum(b * b for b in vec2) ** 0.5

        if magnitude1 == 0 or magnitude2 == 0:
            return 0.0

        return dot_product / (magnitude1 * magnitude2)

    def count(self) -> int:
        return len(self.documents)

    def clear(self):
        self.documents.clear()


_vector_store = None


def get_vector_store() -> VectorStore:
    global _vector_store
    if _vector_store is None:
        _vector_store = VectorStore(dimensions=384)
    return _vector_store
