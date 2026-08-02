from llm import storeApiUsage
from llm.usage import apiUsageStore


def testStoreApiUsageRecordsTokensAndWarns(capsys) -> None:
    apiUsageStore.clear()

    usage = storeApiUsage(tokens=42, route="/api/chat")

    assert usage.tokens == 42
    assert usage.metadata == {"route": "/api/chat"}
    assert apiUsageStore == [usage]
    assert "WARNING: API usage posting is not implemented yet. usage: tokens=42" in (
        capsys.readouterr().out
    )
