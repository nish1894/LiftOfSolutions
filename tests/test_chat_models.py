from app.utilities import init_chatmodel, resolve_chatmodel


def test_resolves_default_model() -> None:
    resolved = resolve_chatmodel()

    assert resolved["provider"] == "openai"
    assert resolved["model"] == "gpt-4.1-mini"
    assert resolved["kwargs"] == {}


def test_resolves_registry_aliases() -> None:
    assert resolve_chatmodel("openai:fast")["model"] == "gpt-4.1-mini"
    assert resolve_chatmodel("gemini:pro") == {
        "provider": "google_genai",
        "model": "gemini-2.5-pro",
        "kwargs": {},
    }
    assert resolve_chatmodel("deepseek:reasoner") == {
        "provider": "deepseek",
        "model": "deepseek-reasoner",
        "kwargs": {},
    }


def test_resolves_provider_prefixed_model_ids() -> None:
    assert resolve_chatmodel("openai:gpt-4.1")["provider"] == "openai"
    assert resolve_chatmodel("gemini:gemini-2.5-flash") == {
        "provider": "google_genai",
        "model": "gemini-2.5-flash",
        "kwargs": {},
    }
    assert resolve_chatmodel("google/gemini-2.5-pro")["provider"] == "google_genai"
    assert resolve_chatmodel("ds-deepseek-chat") == {
        "provider": "deepseek",
        "model": "deepseek-chat",
        "kwargs": {},
    }


def test_plain_model_id_uses_default_provider() -> None:
    resolved = resolve_chatmodel("gpt-4.1-mini")

    assert resolved == {
        "provider": "openai",
        "model": "gpt-4.1-mini",
        "kwargs": {},
    }


def test_kwargs_are_preserved_and_override_registry_kwargs() -> None:
    resolved = resolve_chatmodel("openai:fast", temperature=0.2, max_tokens=500)

    assert resolved["kwargs"] == {"temperature": 0.2, "max_tokens": 500}


def test_init_chatmodel_constructs_openai_model() -> None:
    model = init_chatmodel("openai:gpt-4.1-mini", api_key="test-key")

    assert type(model).__name__ == "ChatOpenAI"


def test_init_chatmodel_constructs_gemini_model() -> None:
    model = init_chatmodel("gemini:gemini-2.5-flash", api_key="test-key")

    assert type(model).__name__ == "ChatGoogleGenerativeAI"


def test_init_chatmodel_constructs_deepseek_model() -> None:
    model = init_chatmodel("deepseek:deepseek-chat", api_key="test-key")

    assert type(model).__name__ == "ChatDeepSeek"
