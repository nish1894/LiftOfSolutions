from __future__ import annotations

import zipfile
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from langchain_core.documents import Document
from pydantic import BaseModel, Field

from chatbot.rag.documentLoader import UploadedDocument, load_documents, load_text_file


class DocumentSource(BaseModel):
    documents: list[UploadedDocument | dict[str, Any]] = Field(default_factory=list)
    paths: list[str] = Field(default_factory=list)
    zipPath: str | None = None
    rarPath: str | None = None
    archivePath: str | None = None


def fetchDocuments(source: DocumentSource | dict[str, Any]) -> list[Document]:
    request = source if isinstance(source, DocumentSource) else DocumentSource.model_validate(source)
    documents: list[Document] = []

    if request.documents:
        documents.extend(load_documents(request.documents))

    for path in request.paths:
        documents.append(load_text_file(path))

    if request.zipPath:
        documents.extend(loadZipDocuments(request.zipPath))

    if request.rarPath:
        documents.extend(loadRarDocuments(request.rarPath))

    if request.archivePath:
        documents.extend(loadArchiveDocuments(request.archivePath))

    return documents


def loadArchiveDocuments(path: str | Path, *, encoding: str = "utf-8") -> list[Document]:
    archive_path = Path(path)
    if archive_path.suffix.lower() == ".zip":
        return loadZipDocuments(archive_path, encoding=encoding)
    if archive_path.suffix.lower() == ".rar":
        return loadRarDocuments(archive_path, encoding=encoding)
    raise ValueError("Unsupported archive type. Use a .zip or .rar file.")


def loadZipDocuments(path: str | Path, *, encoding: str = "utf-8") -> list[Document]:
    zip_path = Path(path)
    documents: list[Document] = []
    with zipfile.ZipFile(zip_path) as archive:
        for member in archive.infolist():
            if member.is_dir():
                continue
            content = archive.read(member).decode(encoding)
            documents.append(
                Document(
                    page_content=content,
                    metadata={
                        "source": member.filename,
                        "zip_path": str(zip_path),
                    },
                )
            )
    return documents


def loadRarDocuments(path: str | Path, *, encoding: str = "utf-8") -> list[Document]:
    rar_path = Path(path)
    with tempfile.TemporaryDirectory() as temp_dir:
        result = subprocess.run(
            ["tar", "-xf", str(rar_path), "-C", temp_dir],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            raise RuntimeError(
                "Could not extract RAR archive. Install a RAR-capable tar/bsdtar "
                f"or provide extracted document paths. stderr={result.stderr.strip()}"
            )
        return [
            Document(
                page_content=file_path.read_text(encoding=encoding),
                metadata={
                    "source": str(file_path.relative_to(temp_dir)).replace("\\", "/"),
                    "archive_path": str(rar_path),
                },
            )
            for file_path in Path(temp_dir).rglob("*")
            if file_path.is_file()
        ]
