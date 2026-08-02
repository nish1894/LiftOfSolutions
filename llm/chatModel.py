from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from langchain.chat_models import init_chat_model
from langchain_core.language_models.chat_models import BaseChatModel


REGISTRY_PATH = Path(__file__).with_name("chatModelRegistry.json")


@lru_cache(maxsize=1)
def loadChatModelRegistry() -> dict[str, Any]:
    with REGISTRY_PATH.open("r", encoding="utf-8") as file:
        return json.load(file)


def chatModel(code: str | None = None, **kwargs: Any) -> BaseChatModel:
    """Return a LangChain chat model for an external code like `OAI-WEAK`.

    The code format is `AAA-XXX`: `AAA` is the company/provider code and `XXX`
    is the model code. The registry maps those public codes to LangChain's
    provider and model names.
    """
    load_dotenv()
    registry = loadChatModelRegistry()
    model_code = normalizeChatModelCode(code or registry["defaultCode"])
    model_entry = registry["models"].get(model_code)
    if model_entry is None:
        supported_codes = ", ".join(sorted(registry["models"]))
        raise ValueError(
            f"Unknown chat model code '{model_code}'. Supported codes: {supported_codes}"
        )

    provider_code = model_entry["providerCode"]
    provider_entry = registry["providers"][provider_code]
    model_kwargs = {**model_entry.get("kwargs", {}), **kwargs}
    return init_chat_model(
        model_entry["modelName"],
        model_provider=provider_entry["langchainProvider"],
        **model_kwargs,
    )


def normalizeChatModelCode(code: str) -> str:
    normalized = code.strip().upper().replace("_", "-").replace(":", "-")
    if "-" not in normalized:
        raise ValueError("Chat model code must use the AAA-XXX format.")
    return normalized


initChatModel = chatModel
