from pathlib import Path
import os
import sys

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import pytest
from dotenv import load_dotenv

from chatbot.utilities import chatModel
from tests.testHelpers import SoftCheck

load_dotenv(PROJECT_ROOT / ".env")

START_TOKEN = "CHATBOT_START"
END_TOKEN = "CHATBOT_END"

MODEL_CONSTRUCTOR_CASES = [
    ("default code returns OpenAI chat model", None, "ChatOpenAI"),
    ("OAI code returns OpenAI chat model", "OAI-WEAK", "ChatOpenAI"),
    ("DS code returns DeepSeek chat model", "DS-WEAK", "ChatDeepSeek"),
    ("GEM code returns Gemini chat model", "GEM-WEAK", "ChatGoogleGenerativeAI"),
]

LIVE_MODEL_CASES = [
    ("openai cheapest return message", "OAI-CHEAP", "OPENAI_API_KEY"),
    ("gemini cheapest return message", "GEM-CHEAP", "GOOGLE_API_KEY"),
    ("deepseek cheapest return message", "DS-CHEAP", "DEEPSEEK_API_KEY"),
]


def messageContent(response: object) -> str:
    content = getattr(response, "content", response)
    if isinstance(content, str):
        return content.strip()
    return str(content).strip()


def isQuotaError(error: Exception) -> bool:
    text = str(error).lower()
    return (
        "resource_exhausted" in text
        or "quota" in text
        or "rate limit" in text
        or "too many requests" in text
    )


def answerLine(content: str) -> str:
    for line in content.splitlines():
        normalized = line.strip().lower()
        if normalized.startswith("answer:"):
            return normalized.removeprefix("answer:").strip()
    return ""


@pytest.mark.parametrize(
    ("checkName", "code", "expectedType"),
    MODEL_CONSTRUCTOR_CASES,
    ids=[case[0] for case in MODEL_CONSTRUCTOR_CASES],
)
def testChatModelCodeReturnsLangchainChatModel(
    checkName: str,
    code: str | None,
    expectedType: str,
) -> None:
    checks = SoftCheck()
    model = chatModel(code, api_key="test-key")

    checks.equal(checkName, type(model).__name__, expectedType)
    checks.finish()


def testChatModelRejectsUnknownCode() -> None:
    with pytest.raises(ValueError, match="Unknown chat model code"):
        chatModel("BAD-CODE", api_key="test-key")


@pytest.mark.parametrize(
    ("checkName", "code", "envKey"),
    LIVE_MODEL_CASES,
    ids=[case[0] for case in LIVE_MODEL_CASES],
)
def testChatModelApiReturnsExpectedMessage(
    checkName: str,
    code: str,
    envKey: str,
) -> None:
    if not os.getenv(envKey):
        pytest.skip(f"{envKey} is not set; skipping live model API check")

    checks = SoftCheck()
    model = chatModel(code, temperature=0, max_tokens=80)
    try:
        response = model.invoke(
            "Answer the question: what is 2 + 2?\n"
            "Return exactly three lines using this template:\n"
            f"{START_TOKEN}\n"
            "answer: <short answer>\n"
            f"{END_TOKEN}\n"
            "Do not misspell the start or end token."
        )
    except Exception as error:
        if isQuotaError(error):
            pytest.skip(f"{code} live API quota/rate limit hit: {error}")
        raise

    content = messageContent(response)
    answer = answerLine(content)

    print(f"\nMODEL RESPONSE {code}:\n{content}")
    checks.true(checkName + " starts with token", content.startswith(START_TOKEN))
    checks.true(
        checkName + " contains answer",
        "4" in answer,
    )
    checks.true(checkName + " ends with token", content.endswith(END_TOKEN))
    checks.finish()


if __name__ == "__main__":
    import subprocess

    raise SystemExit(
        subprocess.call([sys.executable, "-m", "pytest", str(Path(__file__).resolve())])
    )
