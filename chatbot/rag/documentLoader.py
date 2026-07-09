from __future__ import annotations

from pathlib import Path
from typing import Any

from langchain_core.documents import Document
from pydantic import BaseModel, Field


class UploadedDocument(BaseModel):
    name: str
    content: str = Field(min_length=1)
    content_type: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


def load_documents(documents: list[UploadedDocument | dict[str, Any]]) -> list[Document]:
    loaded: list[Document] = []
    for item in documents:
        uploaded = (
            item if isinstance(item, UploadedDocument) else UploadedDocument.model_validate(item)
        )
        loaded.append(
            Document(
                page_content=uploaded.content,
                metadata={
                    "source": uploaded.name,
                    "content_type": uploaded.content_type,
                    **uploaded.metadata,
                },
            )
        )
    return loaded


def load_text_file(path: str | Path, *, encoding: str = "utf-8") -> Document:
    file_path = Path(path)
    return Document(
        page_content=file_path.read_text(encoding=encoding),
        metadata={"source": file_path.name, "path": str(file_path)},
    )
