from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any, TypedDict

from dotenv import load_dotenv
from langchain.chat_models import init_chat_model
from langchain_core.language_models.chat_models import BaseChatModel


REGISTRY_PATH = Path(__file__).with_name("chatModelRegistry.json")


class ResolvedChatModel(TypedDict):
    provider: str
    model: str
    kwargs: dict[str, Any]


@lru_cache(maxsize=1)
def _load_registry() -> dict[str, Any]:
    with REGISTRY_PATH.open("r", encoding="utf-8") as file:
        return json.load(file)


def _provider_aliases(registry: dict[str, Any]) -> dict[str, str]:
    aliases: dict[str, str] = {}
    for provider_key, config in registry["providers"].items():
        provider = config["provider"]
        aliases[provider_key.lower()] = provider
        aliases[provider.lower()] = provider
        for alias in config.get("aliases", []):
            aliases[alias.lower()] = provider
    return aliases


def _split_model_id(model_id: str, aliases: dict[str, str]) -> tuple[str | None, str]:
    for separator in (":", "/"):
        if separator in model_id:
            prefix, model = model_id.split(separator, 1)
            return aliases.get(prefix.lower(), prefix), model

    prefix, dash, model = model_id.partition("-")
    if dash and prefix.lower() in aliases:
        return aliases[prefix.lower()], model

    return None, model_id


def resolve_chatmodel(model_id: str | None = None, **kwargs: Any) -> ResolvedChatModel:
    """Resolve a short model id into a LangChain provider/model pair.

    Supported inputs:
    - "openai:gpt-4.1-mini"
    - "gemini:gemini-2.5-flash"
    - "deepseek:deepseek-chat"
    - JSON aliases like "openai:fast" or "deepseek:reasoner"
    - Dash aliases for known providers like "ds-deepseek-chat"
    """
    registry = _load_registry()
    aliases = _provider_aliases(registry)
    requested = (model_id or "").strip()

    if not requested:
        default_key = registry["default_provider"]
        provider_config = registry["providers"][default_key]
        return {
            "provider": provider_config["provider"],
            "model": provider_config["default_model"],
            "kwargs": dict(kwargs),
        }

    model_alias = registry.get("models", {}).get(requested.lower())
    if model_alias:
        model_kwargs = {**model_alias.get("kwargs", {}), **kwargs}
        return {
            "provider": model_alias["provider"],
            "model": model_alias["model"],
            "kwargs": model_kwargs,
        }

    provider, model = _split_model_id(requested, aliases)
    if provider:
        return {"provider": provider, "model": model, "kwargs": dict(kwargs)}

    default_provider = registry["providers"][registry["default_provider"]]["provider"]
    return {"provider": default_provider, "model": requested, "kwargs": dict(kwargs)}


def init_chatmodel(model_id: str | None = None, **kwargs: Any) -> BaseChatModel:
    """Return a LangChain chat model from a compact model id.

    API keys are loaded from `.env` automatically. Pass any LangChain model
    option through `kwargs`, for example `temperature=0.2` or `max_tokens=800`.
    """
    load_dotenv()
    resolved = resolve_chatmodel(model_id, **kwargs)
    return init_chat_model(
        resolved["model"],
        model_provider=resolved["provider"],
        **resolved["kwargs"],
    )
