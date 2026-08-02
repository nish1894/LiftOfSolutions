from __future__ import annotations

import hashlib
import math
import re
from typing import Literal

from langchain_core.embeddings import Embeddings


TOKEN_PATTERN = re.compile(r"[a-zA-Z0-9_]+")


class HashEmbeddings(Embeddings):
    """Small deterministic embedding model for local tests and dev."""

    def __init__(self, dimensions: int = 256) -> None:
        self.dimensions = dimensions

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [self._embed(text) for text in texts]

    def embed_query(self, text: str) -> list[float]:
        return self._embed(text)

    def _embed(self, text: str) -> list[float]:
        vector = [0.0] * self.dimensions
        for token in TOKEN_PATTERN.findall(text.lower()):
            digest = hashlib.md5(token.encode("utf-8")).digest()
            index = int.from_bytes(digest[:4], "big") % self.dimensions
            sign = 1.0 if digest[4] % 2 == 0 else -1.0
            vector[index] += sign

        norm = math.sqrt(sum(value * value for value in vector))
        if norm == 0:
            return vector
        return [value / norm for value in vector]


def init_embedding_model(
    model_id: str | None = None,
    **kwargs: object,
) -> Embeddings:
    """Create an embedding model.

    Defaults to a local deterministic hash embedding. Use
    `openai:text-embedding-3-small` when you want real semantic embeddings.
    """
    requested = (model_id or "hash").strip().lower()
    if requested in {"hash", "local", "test"}:
        dimensions = int(kwargs.pop("dimensions", 256))
        return HashEmbeddings(dimensions=dimensions)

    provider, _, model = requested.partition(":")
    if provider in {"openai", "oai"} and model:
        from dotenv import load_dotenv
        from langchain_openai import OpenAIEmbeddings

        load_dotenv()
        return OpenAIEmbeddings(model=model, **kwargs)

    raise ValueError(
        "Unsupported embedding model. Use 'hash' or 'openai:text-embedding-3-small'."
    )
