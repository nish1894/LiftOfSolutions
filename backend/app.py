from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.routes import routers


PROJECT_ROOT = Path(__file__).resolve().parents[1]
FRONTEND_DIST = PROJECT_ROOT / "frontend" / "dist"

app = FastAPI(title="Lift Off Solutions API")

for router in routers:
    app.include_router(router)

# Only the hashed build output is mounted, at the same "/assets" path Vite
# emits by default. Mounting the whole dist folder under "/static" instead
# would force a matching `base` in vite.config.js, which drags the dev server
# off the origin root too.
#
# check_dir=False because frontend/dist only exists after `npm run build`,
# and the API must still import and serve without it.
app.mount(
    "/assets",
    StaticFiles(directory=FRONTEND_DIST / "assets", check_dir=False),
    name="assets",
)


@app.get("/")
def home() -> FileResponse:
    return FileResponse(FRONTEND_DIST / "index.html")
