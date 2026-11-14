"""Esquemas de campos de los recursos, leídos del motor.

Las funciones `engine_*` corren dentro de un worker (usan `worker.gmat`); las `async` corren en el
proceso FastAPI, cachean en disco por versión de GMAT y nunca importan gmatpy.
"""
import asyncio
import json
import multiprocessing as mp
import os
import re
import tempfile
from concurrent.futures import ProcessPoolExecutor
from concurrent.futures.process import BrokenProcessPool
from pathlib import Path

from app import config
from app.engine import worker

# Categorías de recursos que el usuario crea con `Create`; los tipos concretos los da el motor.
CATEGORIES = ("SPACECRAFT", "FORMATION", "HARDWARE", "BURN", "ODE_MODEL", "PROP_SETUP",
              "CALCULATED_POINT", "COORDINATE_SYSTEM", "SOLVER", "SUBSCRIBER", "EVENT_LOCATOR",
              "FIELD_OF_VIEW")
# shortcut: el factory de PARAMETER mezcla ~400 parámetros calculados (SMA, X…) que no se crean
# con Create; solo los de usuario. Ampliar si el motor expone un filtro.
USER_PARAMETERS = ("Variable", "String", "Array")
# Nombre que usan los scripts (GMAT escritorio escribe `Create Propagator`).
ALIASES = {"PropSetup": "Propagator"}
# Enums que el motor valida pero no lista (Spacecraft.cpp `representations`); se filtran con el motor.
ENUM_CANDIDATES = {("Spacecraft", "DisplayStateType"): [
    "Cartesian", "Keplerian", "ModifiedKeplerian", "SphericalAZFPA", "SphericalRADEC", "Equinoctial",
    "ModifiedEquinoctial", "AlternateEquinoctial", "Delaunay", "Planetodetic", "IncomingAsymptote",
    "OutgoingAsymptote", "BrouwerMeanShort", "BrouwerMeanLong"]}
NUMERIC = {"Real", "Integer", "UnsignedInt"}


# ---------- dentro del worker ----------

def engine_types() -> list[dict]:
    """Tipos creables con su categoría y Gmat::ObjectType (para agrupar y filtrar referencias)."""
    g = worker.gmat
    mod = g.Moderator.Instance()
    out: list[dict] = []
    seen: set[str] = set()
    for cat in CATEGORIES:
        for t in mod.GetListOfViewableItems(getattr(g, cat)):
            t = ALIASES.get(t, t)
            if t not in seen:
                seen.add(t)
                out.append({"type": t, "category": cat, "objectType": int(getattr(g, cat))})
    factory = set(mod.GetListOfFactoryItems(g.PARAMETER))
    return out + [{"type": t, "category": "PARAMETER", "objectType": int(g.PARAMETER)}
                  for t in USER_PARAMETERS if t in factory]


def engine_parameters() -> list[dict]:
    """Parámetros calculados (SMA, Altitude, ElapsedDays…) para `Obj[.Dep].Nombre`. `dep` dice qué
    va en medio: CoordinateSystem (X → Sat.EarthMJ2000Eq.X), Origin (Altitude → Sat.Earth.Altitude)
    o nada; `depDefault` es el que pone el motor. El dueño (nave, tanque…) no lo expone el motor."""
    g = worker.gmat
    out = []
    for t in g.Moderator.Instance().GetListOfFactoryItems(g.PARAMETER):
        if t in USER_PARAMETERS:
            continue
        try:  # algunos (ModEquinoctial, BrouwerMeanShort…) no se pueden crear sueltos
            p = g.Construct(t, f"Param{len(out)}")
            dep, unit = p.GetField("DepObject"), p.GetField("Unit")
        except Exception:
            continue
        kind = "" if not dep else "Origin" if dep == "Earth" else "CoordinateSystem"
        out.append({"name": t, "dep": kind, "depDefault": dep, "unit": unit})
    return out


def _value(text: str, ptype: str):
    if ptype in NUMERIC:
        try:
            return float(text) if ptype == "Real" else int(float(text))
        except ValueError:
            return text
    if ptype == "Boolean":
        return text.strip().lower() == "true"
    return text


def _field(obj, i: int, name: str) -> dict:
    ptype = obj.GetParameterTypeString(i)
    f = {"name": name, "type": ptype, "readOnly": bool(obj.IsParameterReadOnly(i)), "default": None}
    if not f["readOnly"]:  # los calculados (p. ej. TotalPowerAvailable sin nave) tiran abajo el motor
        try:
            f["default"] = _value(obj.GetField(name), ptype)
        except Exception:
            pass
    for key, get in (("enum", obj.GetPropertyEnumStrings), ("unit", obj.GetParameterUnit)):
        try:
            v = get(i)
        except Exception:
            continue
        if v:
            f[key] = list(v) if key == "enum" else v
    if ptype in ("Object", "ObjectArray"):
        try:
            f["refType"] = obj.GetPropertyObjectType(i)  # Gmat::ObjectType numérico
        except Exception:
            pass
    return f


def engine_fields(type_name: str) -> list[dict] | None:
    """Crea `type_name` como lo haría un script y lee sus parámetros. None si no se puede crear."""
    try:
        return _engine_fields(type_name)
    except Exception as e:  # las excepciones SWIG no se pueden devolver al proceso padre
        raise RuntimeError(f"{type_name}: {e}") from None


def _engine_fields(type_name: str) -> list[dict] | None:
    g = worker.gmat
    os.chdir(Path(config.GMAT_HOME, "bin"))
    fd, path = tempfile.mkstemp(suffix=".script")
    with os.fdopen(fd, "w") as fh:
        fh.write(f"Create {type_name} SchemaObj{'[1,1]' if type_name == 'Array' else ''};\n")
    try:
        g.LoadScript(path)  # puede dar False y aun así crear el objeto (EphemerisFile sin Spacecraft)
    finally:
        os.unlink(path)
    obj = g.GetObject("SchemaObj")  # con el tipo concreto (GetStateElementLabels en Spacecraft)
    if obj is None:
        return None
    fields, seen = [], set()
    for i in range(obj.GetParameterCount()):
        try:  # Variable declara más parámetros de los que define
            name = obj.GetParameterText(i)
            if name not in seen:
                fields.append(_field(obj, i, name))
                seen.add(name)
        except Exception:
            continue
    for f in fields:
        cands = ENUM_CANDIDATES.get((obj.GetTypeName(), f["name"]))
        if cands and "enum" not in f:
            orig = obj.GetField(f["name"])
            f["enum"] = [c for c in cands if _accepts(obj, f["name"], c)]
            obj.SetField(f["name"], orig)
    if obj.GetTypeName() == "Spacecraft":  # elementos de estado (SMA, ECC…) no están en la lista de parámetros
        for rep in next(f["enum"] for f in fields if f["name"] == "DisplayStateType"):
            for label in obj.GetStateElementLabels(rep):
                if label in seen:
                    continue
                seen.add(label)
                fields.append({"name": label, "type": "Real", "readOnly": False,
                               "default": _value(obj.GetField(label), "Real"), "stateType": rep})
    return fields


def _accepts(obj, name: str, value: str) -> bool:
    try:
        return obj.SetField(name, value) is not False
    except Exception:
        return False


# ---------- proceso FastAPI ----------

_cache: dict | None = None
_version: str | None = None  # no cambia sin reiniciar el proceso
_lock = asyncio.Lock()


def _cache_file(version: str) -> Path:
    # v2: `types` pasó de lista de nombres a lista de objetos
    return Path(config.CACHE_DIR, "schema", re.sub(r"[^\w.-]+", "_", version) + ".v2.json")


async def _load() -> dict:
    global _cache, _version
    if _version is None:
        _version = (await worker.submit(worker.gmat_version))["version"]
    if _cache is None:
        file = _cache_file(_version)
        data = json.loads(file.read_text("utf-8")) if file.exists() else {}
        _cache = {"file": str(file), "types": data.get("types"), "fields": data.get("fields", {}),
                  "parameters": data.get("parameters")}
    return _cache


async def _isolated(fn, *args):
    """Corre en un proceso propio: algunos tipos tiran abajo el motor al leerlos (p. ej.
    NuclearPowerSystem sin sistema solar) y eso rompería el pool compartido. None si se cae."""
    pool = ProcessPoolExecutor(1, mp_context=mp.get_context("spawn"), initializer=worker._init,
                               initargs=(config.GMAT_HOME, str(config.CACHE_DIR)))
    try:
        fut = asyncio.get_running_loop().run_in_executor(pool, fn, *args)
        return await asyncio.wait_for(fut, config.TASK_TIMEOUT_S)
    except BrokenProcessPool:
        return None
    finally:
        for p in list(getattr(pool, "_processes", {}).values()):  # sin API pública para matar el worker
            p.terminate()
        pool.shutdown(wait=False, cancel_futures=True)


def _save(c: dict) -> None:
    file = Path(c["file"])
    file.parent.mkdir(parents=True, exist_ok=True)
    tmp = file.with_name(f"{file.name}.{os.getpid()}")
    tmp.write_text(json.dumps({k: c[k] for k in ("types", "fields", "parameters")}), "utf-8")
    os.replace(tmp, file)


async def types() -> list[dict]:
    async with _lock:
        c = await _load()
        if c["types"] is None:
            c["types"] = await worker.submit(engine_types)
            _save(c)
        return c["types"]


async def fields(type_name: str) -> list[dict] | None:
    """Campos del tipo; None si no es un tipo creable."""
    if type_name not in {t["type"] for t in await types()}:
        return None
    async with _lock:
        c = await _load()
        if type_name not in c["fields"]:
            c["fields"][type_name] = await _isolated(engine_fields, type_name)
            _save(c)
        return c["fields"][type_name]


async def parameters() -> list[dict] | None:
    """Parámetros calculados del motor; proceso aislado (Construct deja objetos en la configuración)."""
    async with _lock:
        c = await _load()
        if c["parameters"] is None:
            c["parameters"] = await _isolated(engine_parameters)
            if c["parameters"] is not None:
                _save(c)
        return c["parameters"]


def reset() -> None:
    """Olvida la caché en memoria; la próxima consulta la relee del disco."""
    global _cache, _lock
    _cache, _lock = None, asyncio.Lock()
