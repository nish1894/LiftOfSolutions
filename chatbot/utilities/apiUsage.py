from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any


@dataclass(frozen=True)
class ApiUsage:
    tokens: int
    metadata: dict[str, Any] = field(default_factory=dict)
    createdAt: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


apiUsageStore: list[ApiUsage] = []


def storeApiUsage(tokens: int, **metadata: Any) -> ApiUsage:
    if tokens < 0:
        raise ValueError("tokens cannot be negative")

    usage = ApiUsage(tokens=tokens, metadata=dict(metadata))
    apiUsageStore.append(usage)
    postApiUsage(usage)
    return usage


def postApiUsage(usage: ApiUsage) -> None:
    print(
        "WARNING: API usage posting is not implemented yet. "
        f"usage: tokens={usage.tokens}"
    )
