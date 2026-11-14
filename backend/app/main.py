from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app import config, samples, script
from app.engine import runner, worker
from app.engine.sanitize import ScriptRejected


@asynccontextmanager
async def lifespan(_: FastAPI):
    worker.start()
    try:
        yield
    finally:
        runner.stop_all()
        worker.stop()


app = FastAPI(title="GMAT Web", lifespan=lifespan)


@app.get("/api/health")
async def health():
    try:
        info = await worker.submit(worker.gmat_version)
    except Exception as e:  # el motor no carga o no responde: la API sigue viva
        return {"status": "error", "detail": f"{type(e).__name__}: {e}"}
    return {"status": "ok", **info}


@app.get("/api/samples")
def list_samples():
    return samples.list_samples()


@app.get("/api/samples/{sample_id:path}")
def get_sample(sample_id: str):
    text = samples.read(sample_id)
    if text is None:
        raise HTTPException(404, "Ejemplo no encontrado")
    return {"id": sample_id, "text": text}


class RunRequest(BaseModel):
    script: str


@app.post("/api/runs")
async def create_run(req: RunRequest):
    if runner.active() >= config.MAX_RUNS:
        raise HTTPException(429, f"Máximo {config.MAX_RUNS} corridas simultáneas")
    try:
        run = runner.create(req.script)
    except ScriptRejected as e:
        return JSONResponse({"detail": str(e), "line": e.line}, status_code=400)
    return {"runId": run.id}


@app.post("/api/script/parse")
def parse_script(req: RunRequest):
    if len(req.script.encode("utf-8")) > config.MAX_SCRIPT_BYTES:
        raise HTTPException(413, f"Script demasiado grande (máx. {config.MAX_SCRIPT_BYTES} bytes)")
    return script.parse(req.script)


@app.post("/api/script/serialize")
def serialize_script(model: dict):
    try:
        return {"script": script.serialize(model)}
    except (KeyError, TypeError, AttributeError) as e:
        raise HTTPException(422, f"Modelo inválido: {type(e).__name__}: {e}")


@app.delete("/api/runs/{run_id}")
def cancel_run(run_id: str):
    run = runner.runs.get(run_id)
    if run is None:
        raise HTTPException(404, "Corrida no encontrada")
    runner.cancel(run)
    return {"ok": True}


@app.websocket("/api/ws/runs/{run_id}")
async def run_events(ws: WebSocket, run_id: str):
    await ws.accept()
    run = runner.runs.get(run_id)
    if run is None:
        await ws.send_json({"type": "error", "message": "Corrida no encontrada"})
        await ws.close()
        return
    sent = 0
    try:
        while True:  # reenvía desde el inicio y luego en vivo hasta done/error
            async with run.cond:
                await run.cond.wait_for(lambda: len(run.events) > sent)
                batch = run.events[sent:]
            for ev in batch:
                await ws.send_json(ev)
            sent += len(batch)
            if run.finished and sent == len(run.events):
                break
        await ws.close()
    except WebSocketDisconnect:
        pass
