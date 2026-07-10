from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from chatbot.rag.documentProcessor import (
    DocumentEnhancer,
    enhanceDocumentsWithLlm,
    processDocumentsForRag,
)
from chatbot.rag.documentSource import DocumentSource, fetchDocuments
from chatbot.rag.embeddings import init_embedding_model
from chatbot.rag.vectorDbStore import (
    VectorDbRecord,
    VectorDbStore,
    storeVectorDb,
)
from chatbot.rag.vectorStore import InMemoryVectorIndex


class RagIngestionRequest(BaseModel):
    dbName: str = Field(min_length=1)
    source: DocumentSource
    enhanceDocuments: bool = False
    enhancementModel: str | None = None
    embeddingModel: str | None = None
    chunkSize: int = 1000
    chunkOverlap: int = 150


class RagIngestionResult(BaseModel):
    dbName: str
    documentCount: int
    chunkCount: int
    enhanced: bool
    embeddingModel: str | None
    stored: bool


def ingestVectorDb(
    request: RagIngestionRequest | dict[str, Any],
    *,
    store: VectorDbStore | None = None,
    enhancer: DocumentEnhancer | None = None,
) -> RagIngestionResult:
    ingestion_request = (
        request
        if isinstance(request, RagIngestionRequest)
        else RagIngestionRequest.model_validate(request)
    )
    documents = fetchDocuments(ingestion_request.source)
    document_enhancer = enhancer
    if document_enhancer is None and (
        ingestion_request.enhanceDocuments or ingestion_request.enhancementModel
    ):
        enhancement_model = ingestion_request.enhancementModel or "OAI-CHEAP"
        document_enhancer = lambda docs: enhanceDocumentsWithLlm(
            docs,
            modelCode=enhancement_model,
        )
    chunks = processDocumentsForRag(
        documents,
        enhancer=document_enhancer,
        chunk_size=ingestion_request.chunkSize,
        chunk_overlap=ingestion_request.chunkOverlap,
    )
    embeddings = init_embedding_model(ingestion_request.embeddingModel)
    index = InMemoryVectorIndex.from_documents(chunks, embeddings)
    storeVectorDb(
        VectorDbRecord(
            dbName=ingestion_request.dbName,
            index=index,
            chunks=chunks,
            embeddingModel=ingestion_request.embeddingModel,
        ),
        store=store,
    )
    return RagIngestionResult(
        dbName=ingestion_request.dbName,
        documentCount=len(documents),
        chunkCount=len(chunks),
        enhanced=document_enhancer is not None,
        embeddingModel=ingestion_request.embeddingModel,
        stored=True,
    )


def ragIngestNode(state: dict[str, Any]) -> dict[str, Any]:
    result = ingestVectorDb(state)
    return {**state, "rag_ingestion": result.model_dump(mode="json")}
