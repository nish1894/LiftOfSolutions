from pathlib import Path
import os
import sys

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import pytest
from dotenv import load_dotenv

from chatbot.utilities import init_chatmodel, resolve_chatmodel, storeApiUsage
from chatbot.utilities.apiUsage import apiUsageStore
from tests.testHelpers import SoftCheck

load_dotenv(PROJECT_ROOT / ".env")

LIVE_MODEL_CASES = [
    ("openai weak return message", "openai:weak", "OPENAI_API_KEY"),
    ("gemini weak return message", "gemini:weak", "GOOGLE_API_KEY"),
    ("deepseek weak return message", "deepseek:weak", "DEEPSEEK_API_KEY"),
]
EXPECTED_REPLY = "CHATBOT_MODEL_OK"


def _messageContent(response: object) -> str:
    content = getattr(response, "content", response)
    if isinstance(content, str):
        return content.strip()
    return str(content).strip()


def testResolvesDefaultModel() -> None:
    checks = SoftCheck()
    resolved = resolve_chatmodel()

    checks.equal("default provider", resolved["provider"], "openai")
    checks.equal("default model", resolved["model"], "gpt-4.1-mini")
    checks.equal("default kwargs", resolved["kwargs"], {})
    checks.finish()


def testResolvesRegistryAliases() -> None:
    checks = SoftCheck()

    checks.equal(
        "openai fast alias",
        resolve_chatmodel("openai:fast")["model"],
        "gpt-4.1-mini",
    )
    checks.equal(
        "gemini pro alias",
        resolve_chatmodel("gemini:pro"),
        {"provider": "google_genai", "model": "gemini-2.5-pro", "kwargs": {}},
    )
    checks.equal(
        "deepseek reasoner alias",
        resolve_chatmodel("deepseek:reasoner"),
        {"provider": "deepseek", "model": "deepseek-reasoner", "kwargs": {}},
    )
    checks.finish()


def testResolvesCheapestWeakCompanyModels() -> None:
    checks = SoftCheck()

    checks.equal(
        "openai cheapest weak alias",
        resolve_chatmodel("openai:weak"),
        {"provider": "openai", "model": "gpt-5.4-nano", "kwargs": {}},
    )
    checks.equal(
        "openai cheapest cheap alias",
        resolve_chatmodel("openai:cheap"),
        {"provider": "openai", "model": "gpt-5.4-nano", "kwargs": {}},
    )
    checks.equal(
        "gemini cheapest weak alias",
        resolve_chatmodel("gemini:weak"),
        {"provider": "google_genai", "model": "gemini-2.5-flash-lite", "kwargs": {}},
    )
    checks.equal(
        "gemini cheapest cheap alias",
        resolve_chatmodel("gemini:cheap"),
        {"provider": "google_genai", "model": "gemini-2.5-flash-lite", "kwargs": {}},
    )
    checks.equal(
        "deepseek cheapest weak alias",
        resolve_chatmodel("deepseek:weak"),
        {"provider": "deepseek", "model": "deepseek-chat", "kwargs": {}},
    )
    checks.equal(
        "deepseek cheapest cheap alias",
        resolve_chatmodel("deepseek:cheap"),
        {"provider": "deepseek", "model": "deepseek-chat", "kwargs": {}},
    )
    checks.finish()


def testResolvesProviderPrefixedModelIds() -> None:
    checks = SoftCheck()

    checks.equal(
        "openai provider prefix",
        resolve_chatmodel("openai:gpt-4.1")["provider"],
        "openai",
    )
    checks.equal(
        "gemini provider prefix",
        resolve_chatmodel("gemini:gemini-2.5-flash"),
        {"provider": "google_genai", "model": "gemini-2.5-flash", "kwargs": {}},
    )
    checks.equal(
        "google slash prefix",
        resolve_chatmodel("google/gemini-2.5-pro")["provider"],
        "google_genai",
    )
    checks.equal(
        "deepseek dash prefix",
        resolve_chatmodel("ds-deepseek-chat"),
        {"provider": "deepseek", "model": "deepseek-chat", "kwargs": {}},
    )
    checks.finish()


def testApiUsageLogPrintsWarningAndStoresTokens(capsys) -> None:
    checks = SoftCheck()
    apiUsageStore.clear()

    usage = storeApiUsage(tokens=17, provider="openai", model="gpt-5.4-nano")
    output = capsys.readouterr().out

    checks.equal("usage tokens stored", usage.tokens, 17)
    checks.equal(
        "usage metadata stored",
        usage.metadata,
        {"provider": "openai", "model": "gpt-5.4-nano"},
    )
    checks.equal("usage store contains usage", apiUsageStore, [usage])
    checks.true(
        "usage warning logged",
        "WARNING: API usage posting is not implemented yet. usage: tokens=17" in output,
    )
    checks.finish()


@pytest.mark.parametrize(
    ("checkName", "modelId", "envKey"),
    LIVE_MODEL_CASES,
    ids=[case[0] for case in LIVE_MODEL_CASES],
)
def testWeakCompanyModelReturnsExpectedMessage(
    checkName: str,
    modelId: str,
    envKey: str,
) -> None:
    if not os.getenv(envKey):
        pytest.skip(f"{envKey} is not set; skipping live model return-message check")

    checks = SoftCheck()
    model = init_chatmodel(modelId, temperature=0, max_tokens=12)
    response = model.invoke(
        f"Return exactly this text and nothing else: {EXPECTED_REPLY}"
    )
    content = _messageContent(response)

    print(f"\nMODEL RESPONSE {modelId}: {content!r}")
    checks.equal(checkName, content, EXPECTED_REPLY)
    checks.finish()


def testPlainModelIdUsesDefaultProvider() -> None:
    checks = SoftCheck()
    resolved = resolve_chatmodel("gpt-4.1-mini")

    checks.equal(
        "plain model uses default provider",
        resolved,
        {"provider": "openai", "model": "gpt-4.1-mini", "kwargs": {}},
    )
    checks.finish()


def testKwargsArePreservedAndOverrideRegistryKwargs() -> None:
    checks = SoftCheck()
    resolved = resolve_chatmodel("openai:fast", temperature=0.2, max_tokens=500)

    checks.equal(
        "kwargs preserved",
        resolved["kwargs"],
        {"temperature": 0.2, "max_tokens": 500},
    )
    checks.finish()


def testInitChatmodelConstructsOpenaiModel() -> None:
    checks = SoftCheck()
    model = init_chatmodel("openai:gpt-4.1-mini", api_key="test-key")

    checks.equal("openai model type", type(model).__name__, "ChatOpenAI")
    checks.finish()


def testInitChatmodelConstructsGeminiModel() -> None:
    checks = SoftCheck()
    model = init_chatmodel("gemini:gemini-2.5-flash", api_key="test-key")

    checks.equal(
        "gemini model type",
        type(model).__name__,
        "ChatGoogleGenerativeAI",
    )
    checks.finish()


def testInitChatmodelConstructsDeepseekModel() -> None:
    checks = SoftCheck()
    model = init_chatmodel("deepseek:deepseek-chat", api_key="test-key")

    checks.equal("deepseek model type", type(model).__name__, "ChatDeepSeek")
    checks.finish()


if __name__ == "__main__":
    import subprocess

    raise SystemExit(
        subprocess.call([sys.executable, "-m", "pytest", str(Path(__file__).resolve())])
    )
