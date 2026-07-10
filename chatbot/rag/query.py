from __future__ import annotations

from pydantic import BaseModel

from chatbot.rag.embeddings import init_embedding_model
from chatbot.rag.vectorDbStore import VectorDbStore, loadVectorDb
from chatbot.rag.vectorStore import InMemoryVectorIndex


class RagSource(BaseModel):
    source: str | None = None
    chunk_index: int | None = None
    score: float
    content: str


class RagQueryResult(BaseModel):
    context: str
    sources: list[RagSource]


def query_vector_index(
    index: InMemoryVectorIndex,
    query: str,
    *,
    embedding_model: str | None = None,
    top_k: int = 4,
) -> RagQueryResult:
    embeddings = init_embedding_model(embedding_model)
    matches = index.search(query, embeddings, top_k=top_k)
    sources = [
        RagSource(
            source=match.document.metadata.get("source"),
            chunk_index=match.document.metadata.get("chunk_index"),
            score=match.score,
            content=match.document.page_content,
        )
        for match in matches
    ]
    return RagQueryResult(
        context="\n\n".join(source.content for source in sources),
        sources=sources,
    )


def queryVectorDb(
    dbName: str,
    question: str,
    *,
    topK: int = 3,
    store: VectorDbStore | None = None,
) -> RagQueryResult:
    record = loadVectorDb(dbName, store=store)
    embeddings = init_embedding_model(record.embeddingModel)
    matches = record.index.search(question, embeddings, top_k=topK)
    sources = [
        RagSource(
            source=match.document.metadata.get("source"),
            chunk_index=match.document.metadata.get("chunk_index"),
            score=match.score,
            content=match.document.page_content,
        )
        for match in matches
    ]
    return RagQueryResult(
        context="\n\n".join(source.content for source in sources),
        sources=sources,
    )
