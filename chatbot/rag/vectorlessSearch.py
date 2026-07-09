from __future__ import annotations

import re
from collections import Counter

from langchain_core.documents import Document

from chatbot.rag.query import RagQueryResult, RagSource


TOKEN_PATTERN = re.compile(r"[a-zA-Z0-9]+")


def query_vectorless_chunks(
    chunks: list[Document],
    query: str,
    *,
    top_k: int = 4,
) -> RagQueryResult:
    query_terms = Counter(_tokens(query))
    scored = [
        (document, _score_document(document, query_terms))
        for document in chunks
    ]
    matches = sorted(scored, key=lambda item: item[1], reverse=True)[:top_k]
    sources = [
        RagSource(
            source=document.metadata.get("source"),
            chunk_index=document.metadata.get("chunk_index"),
            score=score,
            content=document.page_content,
        )
        for document, score in matches
        if score > 0
    ]

    if not sources and chunks:
        fallback = chunks[:top_k]
        sources = [
            RagSource(
                source=document.metadata.get("source"),
                chunk_index=document.metadata.get("chunk_index"),
                score=0.0,
                content=document.page_content,
            )
            for document in fallback
        ]

    return RagQueryResult(
        context="\n\n".join(source.content for source in sources),
        sources=sources,
    )


def _score_document(document: Document, query_terms: Counter[str]) -> float:
    if not query_terms:
        return 0.0

    document_terms = Counter(_tokens(document.page_content))
    overlap = sum(
        min(document_terms[term], count)
        for term, count in query_terms.items()
    )
    if overlap == 0:
        return 0.0
    return overlap / sum(query_terms.values())


def _tokens(text: str) -> list[str]:
    return TOKEN_PATTERN.findall(text.lower())
