from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.engine import worker


@asynccontextmanager
async def lifespan(_: FastAPI):
    worker.start()
    try:
        yield
    finally:
        worker.stop()


app = FastAPI(title="GMAT Web", lifespan=lifespan)


@app.get("/api/health")
async def health():
    try:
        info = await worker.submit(worker.gmat_version)
    except Exception as e:  # el motor no carga o no responde: la API sigue viva
        return {"status": "error", "detail": f"{type(e).__name__}: {e}"}
    return {"status": "ok", **info}
