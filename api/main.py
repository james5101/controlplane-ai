import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routers import services, auth, orgs
from api.db.connection import get_pool, close_pool


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield  # pool is created lazily on first request
    await close_pool()


app = FastAPI(title="ControlPlane AI", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.environ.get("FRONTEND_URL", "http://localhost:3000")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(orgs.router, prefix="/orgs", tags=["orgs"])
app.include_router(services.router, prefix="/services", tags=["services"])


@app.get("/health")
def health():
    return {"status": "ok"}
