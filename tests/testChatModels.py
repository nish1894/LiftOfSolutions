from pathlib import Path
import sys

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from chatbot.utilities import init_chatmodel, resolve_chatmodel
from tests.testHelpers import SoftCheck


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
