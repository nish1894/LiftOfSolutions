from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.routes import routers


PROJECT_ROOT = Path(__file__).resolve().parents[1]
FRONTEND_DIST = PROJECT_ROOT / "frontend" / "dist"

app = FastAPI(title="Chatbot API")

for router in routers:
    app.include_router(router)

# check_dir=False because frontend/dist only exists after `npm run build`,
# and the API must still import and serve without it.
app.mount(
    "/static",
    StaticFiles(directory=FRONTEND_DIST, check_dir=False),
    name="static",
)


@app.get("/")
def home() -> FileResponse:
    return FileResponse(FRONTEND_DIST / "index.html")
