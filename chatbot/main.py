from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from chatbot.rag import (
    DocumentProfile,
    RagDecision,
    RagIngestionRequest,
    RagIngestionResult,
    RagQueryResult,
    decide_rag_strategy,
    ingestVectorDb,
    queryVectorDb,
    rag_node,
)
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
    useVectorDbForMediumDocs: bool = False


class RagNodeRequest(BaseModel):
    query: str
    documents: list[dict] = Field(default_factory=list)
    dbName: str | None = None
    embedding_model: str | None = None
    top_k: int = 4
    useVectorDbForMediumDocs: bool = False


class InternalRagQueryRequest(BaseModel):
    dbName: str
    question: str
    topK: int = 3


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
    return decide_rag_strategy(
        request.documents,
        use_vector_db_for_medium_docs=request.useVectorDbForMediumDocs,
    )


@app.post("/api/rag/query")
def rag_query(request: RagNodeRequest) -> dict:
    return rag_node(request.model_dump())


@app.post("/api/rag/ingest", response_model=RagIngestionResult)
def rag_ingest(request: RagIngestionRequest) -> RagIngestionResult:
    return ingestVectorDb(request)


@app.post(
    "/api/internal/rag/query",
    response_model=RagQueryResult,
    include_in_schema=False,
)
def internal_rag_query(request: InternalRagQueryRequest) -> RagQueryResult:
    return queryVectorDb(request.dbName, request.question, topK=request.topK)
