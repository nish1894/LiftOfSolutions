from __future__ import annotations

from fastapi import APIRouter

from backend.schemas import (
    InternalRagQueryRequest,
    RagDecision,
    RagIngestionRequest,
    RagIngestionResult,
    RagNodeRequest,
    RagQueryResult,
    RagStrategyRequest,
)
from llm import decide_rag_strategy, ingestVectorDb, queryVectorDb, rag_node


router = APIRouter(prefix="/api/rag", tags=["rag"])

# Stored-DB lookups are an internal detail for now, so they stay out of the
# generated OpenAPI docs.
internalRouter = APIRouter(
    prefix="/api/internal/rag",
    tags=["internal"],
    include_in_schema=False,
)


@router.post("/strategy", response_model=RagDecision)
def rag_strategy(request: RagStrategyRequest) -> RagDecision:
    return decide_rag_strategy(
        request.documents,
        use_vector_db_for_medium_docs=request.useVectorDbForMediumDocs,
    )


@router.post("/query")
def rag_query(request: RagNodeRequest) -> dict:
    return rag_node(request.model_dump())


@router.post("/ingest", response_model=RagIngestionResult)
def rag_ingest(request: RagIngestionRequest) -> RagIngestionResult:
    return ingestVectorDb(request)


@internalRouter.post("/query", response_model=RagQueryResult)
def internal_rag_query(request: InternalRagQueryRequest) -> RagQueryResult:
    return queryVectorDb(request.dbName, request.question, topK=request.topK)
