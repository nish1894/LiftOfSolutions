from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


GREEN = "\033[32m"
RED = "\033[31m"
RESET = "\033[0m"


@dataclass
class SoftCheck:
    failures: list[str] = field(default_factory=list)

    def equal(self, name: str, actual: Any, expected: Any) -> None:
        if actual == expected:
            print(f"\n{GREEN}PASS{RESET} {name}")
            return

        message = f"{name}: expected {expected!r}, got {actual!r}"
        self.failures.append(message)
        print(f"\n{RED}FAIL{RESET} {message}")

    def true(self, name: str, value: bool) -> None:
        if value:
            print(f"\n{GREEN}PASS{RESET} {name}")
            return

        message = f"{name}: expected truthy value"
        self.failures.append(message)
        print(f"\n{RED}FAIL{RESET} {message}")

    def finish(self) -> None:
        if self.failures:
            import pytest

            pytest.fail("\n".join(self.failures), pytrace=False)
