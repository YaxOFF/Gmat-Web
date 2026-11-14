import math
import re
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app import config, samples, script
from app.engine import runner, schema, worker
from app.engine.sanitize import ScriptRejected, sanitize


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


@app.post("/api/script/validate")
async def validate_script(req: RunRequest):
    """Carga el script en un proceso aislado (sin correrlo) y devuelve errores con línea."""
    config.RUNS_DIR.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="val-", dir=config.RUNS_DIR, ignore_cleanup_errors=True) as d:
        try:
            safe = sanitize(req.script, Path(d))
        except ScriptRejected as e:
            return {"ok": False, "errors": [{"level": "error", "text": str(e), "line": e.line}]}
        path, log = Path(d, runner.SCRIPT), Path(d, runner.LOG)
        path.write_text(safe, encoding="utf-8")
        ok = await schema._isolated(worker.validate_script, str(path), str(log))
        lines = log.read_text("utf-8", errors="replace").splitlines() if log.exists() else []
    errors = [ev for ev in map(runner.classify, lines) if ev["level"] in ("error", "warning")]
    if ok is None:
        errors.append({"level": "error", "text": "El motor se cayó al cargar el script"})
    return {"ok": bool(ok) and not any(e["level"] == "error" for e in errors), "errors": errors}


STATE_TYPES = set(schema.ENUM_CANDIDATES[("Spacecraft", "DisplayStateType")])


class ConvertRequest(BaseModel):
    fromType: str
    toType: str
    elements: dict[str, float]


@app.post("/api/convert/state")
async def convert_state(req: ConvertRequest):
    if not {req.fromType, req.toType} <= STATE_TYPES:
        raise HTTPException(422, "Representación de estado desconocida")
    # van al script como `Sat.Campo = valor`: solo identificadores y números finitos
    if not req.elements or not all(re.fullmatch(r"[A-Za-z]\w*", k) and math.isfinite(v)
                                   for k, v in req.elements.items()):
        raise HTTPException(422, "Elemento de estado inválido")
    out = await worker.submit(worker.convert_state, req.fromType, req.toType, req.elements)
    if out is None:
        raise HTTPException(422, "El motor no aceptó el estado")
    return {"type": req.toType, "elements": out}


DATE_FORMATS = {f"{scale}{kind}" for scale in ("A1", "TAI", "UTC", "TT", "TDB")
                for kind in ("ModJulian", "Gregorian")}


class EpochRequest(BaseModel):
    fromFormat: str
    toFormat: str
    epoch: str


@app.post("/api/convert/epoch")
async def convert_epoch(req: EpochRequest):
    if not {req.fromFormat, req.toFormat} <= DATE_FORMATS:
        raise HTTPException(422, "Formato de época desconocido")
    # va al script entre comillas: solo dígitos, letras, espacios, ':' '.' '-'
    if not re.fullmatch(r"[\w :.\-]{1,40}", req.epoch):
        raise HTTPException(422, "Época inválida")
    out = await worker.submit(worker.convert_epoch, req.fromFormat, req.toFormat, req.epoch)
    if out is None:
        raise HTTPException(422, "El motor no aceptó la época")
    return {"format": req.toFormat, "epoch": out}


@app.get("/api/schema")
async def list_schema_types():
    return await schema.types()


@app.get("/api/parameters")
async def list_parameters():
    out = await schema.parameters()
    if out is None:
        raise HTTPException(503, "El motor no dio la lista de parámetros")
    return out


@app.get("/api/schema/{type_name}")
async def get_schema(type_name: str):
    fields = await schema.fields(type_name)
    if fields is None:
        raise HTTPException(404, f"Tipo no creable: {type_name}")
    return {"type": type_name, "fields": fields}


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
