from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from langchain_core.documents import Document

from chatbot.rag.vectorStore import InMemoryVectorIndex


@dataclass(frozen=True)
class VectorDbRecord:
    dbName: str
    index: InMemoryVectorIndex
    chunks: list[Document]
    embeddingModel: str | None


class VectorDbStore(Protocol):
    def save(self, record: VectorDbRecord) -> VectorDbRecord:
        ...

    def load(self, dbName: str) -> VectorDbRecord:
        ...


class LocalVectorDbStore:
    def __init__(self) -> None:
        self.records: dict[str, VectorDbRecord] = {}

    def save(self, record: VectorDbRecord) -> VectorDbRecord:
        self.records[record.dbName] = record
        return record

    def load(self, dbName: str) -> VectorDbRecord:
        try:
            return self.records[dbName]
        except KeyError as error:
            raise KeyError(f"Vector DB '{dbName}' was not found") from error

    def clear(self) -> None:
        self.records.clear()


defaultVectorDbStore = LocalVectorDbStore()


def storeVectorDb(record: VectorDbRecord, store: VectorDbStore | None = None) -> VectorDbRecord:
    return (store or defaultVectorDbStore).save(record)


def loadVectorDb(dbName: str, store: VectorDbStore | None = None) -> VectorDbRecord:
    return (store or defaultVectorDbStore).load(dbName)
