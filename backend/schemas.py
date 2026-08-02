"""Request and response models for the HTTP API.

Routes import their models from here only. Some of them are owned by the LLM
layer (an ingestion request is the same shape on the wire as in code) and are
re-exported rather than duplicated.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from llm import (
    DocumentProfile,
    RagDecision,
    RagIngestionRequest,
    RagIngestionResult,
    RagQueryResult,
)


class ChatRequest(BaseModel):
    message: str


class ChatResponse(BaseModel):
    reply: str


class RagStrategyRequest(BaseModel):
    documents: list[DocumentProfile]
    useVectorDbForMediumDocs: bool = False


class RagNodeRequest(BaseModel):
    query: str
    documents: list[dict] = Field(default_factory=list)
    dbName: str | None = None
    embedding_model: str | None = None
    top_k: int = 4
    useVectorDbForMediumDocs: bool = False


class InternalRagQueryRequest(BaseModel):
    dbName: str
    question: str
    topK: int = 3


__all__ = [
    "ChatRequest",
    "ChatResponse",
    "DocumentProfile",
    "InternalRagQueryRequest",
    "RagDecision",
    "RagIngestionRequest",
    "RagIngestionResult",
    "RagNodeRequest",
    "RagQueryResult",
    "RagStrategyRequest",
]
