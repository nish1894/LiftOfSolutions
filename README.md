## Chatbot

Minimal FastAPI chatbot starter managed by `uv`.

### Run locally

```powershell
C:\Users\hites\AppData\Roaming\Python\Python314\Scripts\uv.exe run uvicorn chatbot.main:app --reload
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

The chat endpoint records temporary API usage with `tokens` and prints a
console warning because posting usage is not implemented yet.

```python
from chatbot.utilities import storeApiUsage

storeApiUsage(tokens=42, route="/api/chat")
```

### Chat Models

Create LangChain chat models with one utility:

```python
from chatbot.utilities import init_chatmodel

model = init_chatmodel("openai:gpt-4.1-mini")
model = init_chatmodel("gemini:gemini-2.5-flash")
model = init_chatmodel("deepseek:deepseek-chat")
```

Short aliases live in `chatbot/utilities/chatModelRegistry.json`:

```python
model = init_chatmodel("openai:fast")
model = init_chatmodel("gemini:pro")
model = init_chatmodel("deepseek:reasoner")
```

The preferred format is `provider:model-name`. Dash format also works for known
provider aliases, for example `ds-deepseek-chat`.

### RAG Strategy Selection

The first RAG step chooses how customer-support documents should be used:

```python
from chatbot.rag import DocumentProfile, decide_rag_strategy

decision = decide_rag_strategy([
    DocumentProfile(name="refund-policy.pdf", char_count=5000),
])
```

Available strategies:

```text
direct_document  One small document, attach directly as model context.
vector_db        Multiple documents or larger content, chunk and retrieve.
enterprise       Very large document sets. Planned, not implemented yet.
```

There is also a LangGraph-style node:

```python
from chatbot.rag import select_rag_strategy_node

state = select_rag_strategy_node({
    "documents": [{"name": "faq.md", "char_count": 3000}],
})
```

And a test endpoint:

```text
POST /api/rag/strategy
{
  "documents": [
    { "name": "faq.md", "char_count": 3000 }
  ]
}
```

Full local RAG node:

```python
from chatbot.rag import rag_node

state = rag_node({
    "query": "What is the refund policy?",
    "documents": [
        {
            "name": "refunds.txt",
            "content": "Customers can request refunds within 30 days."
        }
    ]
})

print(state["rag_context"])
print(state["rag_sources"])
```

Pipeline pieces:

```text
documentLoader.py      Turns uploaded text payloads into LangChain Documents.
documentProcessor.py   Chunks documents for retrieval.
embeddings.py          Creates local hash embeddings or OpenAI embeddings.
vectorStore.py         In-memory vector index for the first version.
query.py               Queries a vector index and returns context/sources.
node.py                LangGraph-style RAG node that chooses strategy and runs it.
```

The default embedding model is local deterministic `hash`, useful for tests and
development. For real semantic retrieval, use:

```python
state = rag_node({
    "query": "What is the refund policy?",
    "embedding_model": "openai:text-embedding-3-small",
    "documents": [...]
})
```

API:

```text
POST /api/rag/query
{
  "query": "What is the refund policy?",
  "documents": [
    {
      "name": "refunds.txt",
      "content": "Customers can request refunds within 30 days."
    }
  ]
}
```
