from __future__ import annotations

from typing import Any

from llm.rag.documentLoader import UploadedDocument, load_documents
from llm.rag.documentProcessor import chunk_documents
from llm.rag.embeddings import init_embedding_model
from llm.rag.query import RagQueryResult, RagSource, queryVectorDb
from llm.rag.selector import DocumentProfile, RagDecision, RagStrategy, decide_rag_strategy
from llm.rag.vectorlessSearch import query_vectorless_chunks
from llm.rag.vectorStore import InMemoryVectorIndex


def rag_node(state: dict[str, Any]) -> dict[str, Any]:
    """LangGraph-style RAG node.

    Expected state:
    - documents: list of {name, content, content_type?, metadata?}
    - dbName: optional stored vector DB name
    - query or message: user question
    - embedding_model: optional, defaults to local hash embeddings
    """
    query = state.get("query") or state.get("message") or ""
    db_name = state.get("dbName") or state.get("db_name")
    if db_name and not state.get("documents"):
        result = queryVectorDb(
            str(db_name),
            query,
            topK=int(state.get("top_k", 4)),
        )
        return {
            **state,
            "rag_context": result.context,
            "rag_sources": [source.model_dump(mode="json") for source in result.sources],
        }

    raw_documents = state.get("documents", [])
    uploaded_documents = [
        document
        if isinstance(document, UploadedDocument)
        else UploadedDocument.model_validate(document)
        for document in raw_documents
    ]
    profiles = [
        DocumentProfile(
            name=document.name,
            content_type=document.content_type,
            char_count=len(document.content),
        )
        for document in uploaded_documents
    ]
    decision = decide_rag_strategy(
        profiles,
        use_vector_db_for_medium_docs=bool(
            state.get("useVectorDbForMediumDocs")
            or state.get("use_vector_db_for_medium_docs")
        ),
    )

    if decision.strategy == RagStrategy.ENTERPRISE:
        return _with_rag_result(
            state,
            decision=decision,
            result=RagQueryResult(context="", sources=[]),
        )

    documents = load_documents(uploaded_documents)
    if decision.strategy == RagStrategy.DIRECT_DOCUMENT:
        sources = [
            RagSource(
                source=document.metadata.get("source"),
                chunk_index=None,
                score=1.0,
                content=document.page_content,
            )
            for document in documents
        ]
        return _with_rag_result(
            state,
            decision=decision,
            result=RagQueryResult(
                context="\n\n".join(document.page_content for document in documents),
                sources=sources,
            ),
        )

    chunks = chunk_documents(
        documents,
        chunk_size=int(state.get("chunk_size", 1000)),
        chunk_overlap=int(state.get("chunk_overlap", 150)),
    )
    if decision.strategy == RagStrategy.VECTORLESS:
        result = query_vectorless_chunks(
            chunks,
            query,
            top_k=int(state.get("top_k", 4)),
        )
        return _with_rag_result(state, decision=decision, result=result)

    embeddings = init_embedding_model(state.get("embedding_model"))
    index = InMemoryVectorIndex.from_documents(chunks, embeddings)
    matches = index.search(query, embeddings, top_k=int(state.get("top_k", 4)))
    result = RagQueryResult(
        context="\n\n".join(match.document.page_content for match in matches),
        sources=[
            RagSource(
                source=match.document.metadata.get("source"),
                chunk_index=match.document.metadata.get("chunk_index"),
                score=match.score,
                content=match.document.page_content,
            )
            for match in matches
        ],
    )
    return _with_rag_result(state, decision=decision, result=result)


def _with_rag_result(
    state: dict[str, Any],
    *,
    decision: RagDecision,
    result: RagQueryResult,
) -> dict[str, Any]:
    return {
        **state,
        "rag_decision": decision.model_dump(mode="json"),
        "rag_context": result.context,
        "rag_sources": [source.model_dump(mode="json") for source in result.sources],
    }
