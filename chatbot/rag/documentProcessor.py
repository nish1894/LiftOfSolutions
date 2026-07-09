from __future__ import annotations

from langchain_core.documents import Document


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
