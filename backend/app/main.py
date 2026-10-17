from contextlib import asynccontextmanager

from fastapi import FastAPI

from backend.app.config import get_data_root


@asynccontextmanager
async def lifespan(_app: FastAPI):
    get_data_root().mkdir(parents=True, exist_ok=True)
    yield


app = FastAPI(title="PO Intelligence Hub API", version="2.0.0", lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
