from __future__ import annotations

import json
from enum import StrEnum
from functools import lru_cache
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field


RULES_PATH = Path(__file__).with_name("ragStrategyRules.json")


class RagStrategy(StrEnum):
    DIRECT_DOCUMENT = "direct_document"
    VECTORLESS = "vectorless"
    VECTOR_DB = "vector_db"
    ENTERPRISE = "enterprise"


class DocumentProfile(BaseModel):
    name: str
    content_type: str | None = None
    char_count: int = Field(ge=0)


class RagDecision(BaseModel):
    strategy: RagStrategy
    implemented: bool
    reason: str
    document_count: int
    total_chars: int
    next_step: str


@lru_cache(maxsize=1)
def _load_rules() -> dict[str, Any]:
    with RULES_PATH.open("r", encoding="utf-8") as file:
        return json.load(file)


def decide_rag_strategy(
    documents: list[DocumentProfile],
    *,
    use_vector_db_for_medium_docs: bool = False,
) -> RagDecision:
    """Choose the first RAG approach for a customer-support document set."""
    rules = _load_rules()
    document_count = len(documents)
    total_chars = sum(document.char_count for document in documents)

    if document_count == 0:
        return RagDecision(
            strategy=RagStrategy.DIRECT_DOCUMENT,
            implemented=True,
            reason="No documents were provided yet, so no retrieval layer is needed.",
            document_count=0,
            total_chars=0,
            next_step="Ask the client to upload at least one support document.",
        )

    direct_rules = rules[RagStrategy.DIRECT_DOCUMENT]
    if (
        document_count <= direct_rules["max_documents"]
        and total_chars <= direct_rules["max_total_chars"]
    ):
        return RagDecision(
            strategy=RagStrategy.DIRECT_DOCUMENT,
            implemented=True,
            reason="A single small document can be passed directly to the chat model.",
            document_count=document_count,
            total_chars=total_chars,
            next_step="Extract text and attach it as direct context for the model.",
        )

    vectorless_rules = rules[RagStrategy.VECTORLESS]
    if document_count <= vectorless_rules["max_documents"]:
        return RagDecision(
            strategy=RagStrategy.VECTORLESS,
            implemented=True,
            reason="A few documents can use keyword retrieval without embeddings.",
            document_count=document_count,
            total_chars=total_chars,
            next_step="Chunk documents, score chunks by query terms, then attach the top matching chunks as context.",
        )

    medium_rules = rules["medium_documents"]
    if document_count <= medium_rules["max_documents"]:
        if use_vector_db_for_medium_docs:
            return RagDecision(
                strategy=RagStrategy.VECTOR_DB,
                implemented=True,
                reason="A medium document set was configured to use semantic vector retrieval.",
                document_count=document_count,
                total_chars=total_chars,
                next_step="Chunk documents, embed chunks, store vectors, then retrieve top matches per question.",
            )
        return RagDecision(
            strategy=RagStrategy.VECTORLESS,
            implemented=True,
            reason="A medium document set can stay vectorless when queries are expected to match document wording.",
            document_count=document_count,
            total_chars=total_chars,
            next_step="Use vectorless retrieval, or enable vector DB for fuzzy/natural-language queries.",
        )

    vector_rules = rules[RagStrategy.VECTOR_DB]
    if (
        document_count <= vector_rules["max_documents"]
        and total_chars <= vector_rules["max_total_chars"]
    ):
        return RagDecision(
            strategy=RagStrategy.VECTOR_DB,
            implemented=True,
            reason="Multiple or larger documents need chunking and semantic retrieval.",
            document_count=document_count,
            total_chars=total_chars,
            next_step="Chunk documents, embed chunks, store vectors, then retrieve top matches per question.",
        )

    return RagDecision(
        strategy=RagStrategy.ENTERPRISE,
        implemented=False,
        reason="The document set is large enough to need an enterprise RAG pipeline.",
        document_count=document_count,
        total_chars=total_chars,
        next_step="Not implemented yet. Decide between a managed solution or a custom pipeline with permissions, metadata filters, re-ranking, evals, and monitoring.",
    )


def select_rag_strategy_node(state: dict[str, Any]) -> dict[str, Any]:
    """LangGraph-style node that appends a RAG decision to graph state."""
    raw_documents = state.get("documents", [])
    use_vector_db_for_medium_docs = bool(
        state.get("useVectorDbForMediumDocs")
        or state.get("use_vector_db_for_medium_docs")
    )
    documents = [
        document
        if isinstance(document, DocumentProfile)
        else DocumentProfile.model_validate(document)
        for document in raw_documents
    ]
    decision = decide_rag_strategy(
        documents,
        use_vector_db_for_medium_docs=use_vector_db_for_medium_docs,
    )
    return {**state, "rag_decision": decision.model_dump(mode="json")}
