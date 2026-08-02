from backend.routes import chat, health, rag

routers = (
    health.router,
    chat.router,
    rag.router,
    rag.internalRouter,
)

__all__ = ["chat", "health", "rag", "routers"]
