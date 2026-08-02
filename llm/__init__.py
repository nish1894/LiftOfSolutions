"""LLM layer.

Everything that talks to a language model, or prepares data for one, lives
here. The backend imports from this package only, never from `llm.rag.*` or
other submodules directly, so retrieval and model internals stay free to
change without touching the API layer.
"""

from llm.chatModel import chatModel, initChatModel, normalizeChatModelCode
from llm.rag import (
    DocumentProfile,
    DocumentSource,
    RagDecision,
    RagIngestionRequest,
    RagIngestionResult,
    RagQueryResult,
    RagSource,
    RagStrategy,
    UploadedDocument,
    decide_rag_strategy,
    ingestVectorDb,
    queryVectorDb,
    rag_node,
    select_rag_strategy_node,
)
from llm.tools import run_tool
from llm.usage import ApiUsage, postApiUsage, storeApiUsage

__all__ = [
    "ApiUsage",
    "DocumentProfile",
    "DocumentSource",
    "RagDecision",
    "RagIngestionRequest",
    "RagIngestionResult",
    "RagQueryResult",
    "RagSource",
    "RagStrategy",
    "UploadedDocument",
    "chatModel",
    "decide_rag_strategy",
    "ingestVectorDb",
    "initChatModel",
    "normalizeChatModelCode",
    "postApiUsage",
    "queryVectorDb",
    "rag_node",
    "run_tool",
    "select_rag_strategy_node",
    "storeApiUsage",
]
