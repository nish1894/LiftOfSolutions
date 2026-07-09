## Chatbot

Minimal FastAPI chatbot starter managed by `uv`.

### Run locally

```powershell
C:\Users\hites\AppData\Roaming\Python\Python314\Scripts\uv.exe run uvicorn app.main:app --reload
```

Then open:

```text
http://127.0.0.1:8000
```

### API

Health check:

```text
GET /health
```

Chat:

```text
POST /api/chat
{ "message": "hello" }
```

### Chat Models

Create LangChain chat models with one utility:

```python
from app.utilities import init_chatmodel

model = init_chatmodel("openai:gpt-4.1-mini")
model = init_chatmodel("gemini:gemini-2.5-flash")
model = init_chatmodel("deepseek:deepseek-chat")
```

Short aliases live in `app/utilities/chat_model_registry.json`:

```python
model = init_chatmodel("openai:fast")
model = init_chatmodel("gemini:pro")
model = init_chatmodel("deepseek:reasoner")
```

The preferred format is `provider:model-name`. Dash format also works for known
provider aliases, for example `ds-deepseek-chat`.
