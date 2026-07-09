from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from chatbot.rag import DocumentProfile, RagDecision, decide_rag_strategy, rag_node
from chatbot.tools import run_tool
from chatbot.utilities import storeApiUsage


app = FastAPI(title="Chatbot API")
app.mount("/static", StaticFiles(directory="chatbot/static"), name="static")


class ChatRequest(BaseModel):
    message: str


class ChatResponse(BaseModel):
    reply: str


class RagStrategyRequest(BaseModel):
    documents: list[DocumentProfile]


class RagNodeRequest(BaseModel):
    query: str
    documents: list[dict]
    embedding_model: str | None = None
    top_k: int = 4


@app.get("/")
def home() -> FileResponse:
    return FileResponse("chatbot/static/index.html")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    reply = await run_tool(request.message)
    storeApiUsage(tokens=len(request.message.split()), route="/api/chat")
    return ChatResponse(reply=reply)


@app.post("/api/rag/strategy", response_model=RagDecision)
def rag_strategy(request: RagStrategyRequest) -> RagDecision:
    return decide_rag_strategy(request.documents)


@app.post("/api/rag/query")
def rag_query(request: RagNodeRequest) -> dict:
    return rag_node(request.model_dump())
