from __future__ import annotations

import math
from dataclasses import dataclass

from langchain_core.documents import Document
from langchain_core.embeddings import Embeddings


@dataclass(frozen=True)
class ScoredDocument:
    document: Document
    score: float


class InMemoryVectorIndex:
    def __init__(self, documents: list[Document], vectors: list[list[float]]) -> None:
        if len(documents) != len(vectors):
            raise ValueError("documents and vectors must have the same length")
        self.documents = documents
        self.vectors = vectors

    @classmethod
    def from_documents(
        cls,
        documents: list[Document],
        embeddings: Embeddings,
    ) -> "InMemoryVectorIndex":
        vectors = embeddings.embed_documents([document.page_content for document in documents])
        return cls(documents=documents, vectors=vectors)

    def search(
        self,
        query: str,
        embeddings: Embeddings,
        *,
        top_k: int = 4,
    ) -> list[ScoredDocument]:
        query_vector = embeddings.embed_query(query)
        scored = [
            ScoredDocument(document=document, score=_cosine_similarity(query_vector, vector))
            for document, vector in zip(self.documents, self.vectors, strict=True)
        ]
        return sorted(scored, key=lambda item: item.score, reverse=True)[:top_k]


def _cosine_similarity(left: list[float], right: list[float]) -> float:
    numerator = sum(a * b for a, b in zip(left, right, strict=False))
    left_norm = math.sqrt(sum(value * value for value in left))
    right_norm = math.sqrt(sum(value * value for value in right))
    if left_norm == 0 or right_norm == 0:
        return 0.0
    return numerator / (left_norm * right_norm)
