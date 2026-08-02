from __future__ import annotations

from collections.abc import Callable

from langchain_core.documents import Document

from llm.chatModel import chatModel


DocumentEnhancer = Callable[[list[Document]], list[Document]]


def enhanceDocumentsWithLlm(
    documents: list[Document],
    *,
    modelCode: str,
    maxChars: int = 6000,
) -> list[Document]:
    model = chatModel(modelCode, temperature=0, max_tokens=1200)
    enhanced: list[Document] = []
    for document in documents:
        source = document.metadata.get("source", "document")
        original_text = document.page_content.strip()
        prompt = (
            "You expand customer support knowledge base documents for RAG.\n"
            "Keep original facts. Do not invent policy values, prices, legal promises, "
            "or dates that are not supported.\n"
            "Add likely user cases, edge cases, synonyms, decision rules, and clarifying "
            "questions that would help retrieval.\n"
            f"Source: {source}\n\n"
            f"Document:\n{original_text[:maxChars]}"
        )
        response = model.invoke(prompt)
        enhanced_text = _messageContent(response)
        enhanced.append(
            Document(
                page_content=(
                    f"{original_text}\n\n"
                    "LLM-expanded retrieval notes:\n"
                    f"{enhanced_text}"
                ).strip(),
                metadata={
                    **document.metadata,
                    "llm_enhanced": True,
                    "enhancement_model": modelCode,
                },
            )
        )
    return enhanced


def processDocumentsForRag(
    documents: list[Document],
    *,
    enhancer: DocumentEnhancer | None = None,
    chunk_size: int = 1000,
    chunk_overlap: int = 150,
) -> list[Document]:
    processed = enhancer(documents) if enhancer else documents
    return chunk_documents(
        processed,
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
    )


def chunk_documents(
    documents: list[Document],
    *,
    chunk_size: int = 1000,
    chunk_overlap: int = 150,
) -> list[Document]:
    if chunk_size <= 0:
        raise ValueError("chunk_size must be greater than 0")
    if chunk_overlap < 0:
        raise ValueError("chunk_overlap cannot be negative")
    if chunk_overlap >= chunk_size:
        raise ValueError("chunk_overlap must be smaller than chunk_size")

    chunks: list[Document] = []
    for document_index, document in enumerate(documents):
        text = document.page_content.strip()
        if not text:
            continue

        start = 0
        chunk_index = 0
        step = chunk_size - chunk_overlap
        while start < len(text):
            end = min(start + chunk_size, len(text))
            chunk_text = text[start:end].strip()
            if chunk_text:
                chunks.append(
                    Document(
                        page_content=chunk_text,
                        metadata={
                            **document.metadata,
                            "document_index": document_index,
                            "chunk_index": chunk_index,
                        },
                    )
                )
            chunk_index += 1
            start += step

    return chunks


def _messageContent(response: object) -> str:
    content = getattr(response, "content", response)
    if isinstance(content, str):
        return content.strip()
    return str(content).strip()
