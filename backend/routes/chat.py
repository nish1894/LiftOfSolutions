from __future__ import annotations

from fastapi import APIRouter

from backend.schemas import ChatRequest, ChatResponse
from llm import run_tool, storeApiUsage


router = APIRouter(prefix="/api", tags=["chat"])


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    reply = await run_tool(request.message)
    storeApiUsage(tokens=len(request.message.split()), route="/api/chat")
    return ChatResponse(reply=reply)
