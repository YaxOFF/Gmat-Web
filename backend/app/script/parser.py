"""Script GMAT → modelo JSON (formato en shared/mission.schema.json).

Nunca descarta nada: lo que no entiende va a `raw` tal cual y los comentarios se
conservan en `comments` del recurso/comando siguiente (o en `raw`)."""
import re

BLOCKS = {"Target": "EndTarget", "Optimize": "EndOptimize", "If": "EndIf", "While": "EndWhile",
          "For": "EndFor", "BeginScript": "EndScript"}
CLOSERS = set(BLOCKS.values())
OPEN, CLOSE = "([{", ")]}"
IDENT = re.compile(r"[A-Za-z_]\w*")
NUMBER = re.compile(r"[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?")
ARRAY_NAME = re.compile(r"([A-Za-z_]\w*)\[\s*(\d+)\s*,\s*(\d+)\s*\]")
ASSIGN = re.compile(r"(?:GMAT\s+)?([A-Za-z_]\w*)\.([\w.]+)\s*=\s*(.*)", re.S)
SEQ_ASSIGN = re.compile(r"[A-Za-z_][\w.]*(\([^=]*\))?\s*=(?!=)")
# Comandos que se pueden deshabilitar: `% Cmd ...;` en la secuencia es un comando con `disabled`
# (no bloques, Else ni cierres: comentarlos cambiaría la estructura).
COMMENTABLE = ("Achieve", "BeginFileThrust", "BeginFiniteBurn", "ClearPlot", "EndFileThrust", "EndFiniteBurn",
               "FindEvents", "GMAT", "Maneuver", "MarkPoint", "Minimize", "NonlinearConstraint", "PenDown",
               "PenUp", "Propagate", "Report", "RunEstimator", "RunSimulator", "RunSmoother", "Set", "Stop",
               "Toggle", "UpdateDynamicData", "Vary", "Write")
DISABLED = re.compile(r"%\s*((?:" + "|".join(COMMENTABLE) + r")\b.*);")
BURN = re.compile(r"([A-Za-z_]\w*)\s*\(([^()]*)\)")
SOLVER_CALL_RE = re.compile(r"([A-Za-z_]\w*)\s*\((.*)\)", re.S)
# Comandos `Solver(relación[, {opciones}])`: claves de `args` y patrón de la relación.
SOLVER_CALL = {"Vary": (("lhs", "rhs", "opts"), r"(.+?)\s*=\s*(.+)"),
               "Achieve": (("lhs", "rhs", "opts"), r"(.+?)\s*=\s*(.+)"),
               "Minimize": (("lhs",), r"([^=<>]+)"),
               "NonlinearConstraint": (("lhs", "op", "rhs"), r"(.+?)\s*(<=|>=|=)\s*(.+)")}
COND = re.compile(r"(.+?)\s*(==|~=|<=|>=|<|>)\s*(.+)", re.S)
PROPAGATE = re.compile(r"(?:(Synchronized)\s+)?(?:(BackProp)\s+)?((?:[A-Za-z_]\w*\s*\([^()]*\)\s*)+)(?:\{(.*)\})?")


def _is_quote(s: str, i: int) -> bool:
    """`'` abre/cierra string salvo que sea transpuesta (pegada a identificador, `)` o `]`)."""
    return i == 0 or not (s[i - 1].isalnum() or s[i - 1] in "_)].'")


def _split(s: str, seps: str) -> list[str]:
    """Parte `s` por `seps` fuera de strings y de (), [], {}."""
    out, cur, depth, quote = [], [], 0, False
    for i, ch in enumerate(s):
        if ch == "'" and (quote or _is_quote(s, i)):
            quote = not quote
        elif not quote:
            if ch in OPEN:
                depth += 1
            elif ch in CLOSE:
                depth -= 1
            elif depth == 0 and ch in seps:
                out.append("".join(cur))
                cur = []
                continue
        cur.append(ch)
    out.append("".join(cur))
    return out


def _comment_at(line: str) -> int:
    quote = False
    for i, ch in enumerate(line):
        if ch == "'" and (quote or _is_quote(line, i)):
            quote = not quote
        elif ch == "%" and not quote:
            return i
    return len(line)


def statements(text: str):
    """Genera ('comment', texto) y ('stmt', código, [comentarios en línea])."""
    code, inline = "", []
    for line in text.splitlines():
        i = _comment_at(line)
        part, comment = line[:i].strip(), line[i:].strip()
        if comment:
            inline.append(comment)
        if part.endswith("..."):  # continuación
            code += part[:-3].rstrip() + " "
            continue
        code += part
        stmts = [s.strip() for s in _split(code, ";") if s.strip()]
        if not stmts:
            for c in inline:
                yield ("comment", c)
        for n, s in enumerate(stmts):
            yield ("stmt", s, inline if n == len(stmts) - 1 else [])
        code, inline = "", []
    if code.strip():  # continuación en la última línea
        yield ("stmt", code.strip(), inline)
    else:
        yield from (("comment", c) for c in inline)


def value(s: str, names: set[str]):
    """Valor de campo: número, bool, string, lista o {"ref": ...}. None si no se entiende."""
    s = s.strip()
    if s in ("true", "false"):
        return s == "true"
    if NUMBER.fullmatch(s):
        return float(s) if any(c in s for c in ".eE") else int(s)
    if len(s) >= 2 and s[0] == s[-1] == "'" and "'" not in s[1:-1]:
        return s[1:-1]
    if s[:1] in "{[" and s[-1:] == {"{": "}", "[": "]"}[s[:1] or "{"]:
        rows = _split(s[1:-1], ";") if s[0] == "[" else [s[1:-1]]
        parsed = [[value(t, names) for t in _split(r, ", \t") if t.strip()] for r in rows]
        if any(v is None for r in parsed for v in r):
            return None
        return parsed if len(parsed) > 1 else parsed[0]
    if s and not re.search(r"[\s'{}\[\];]", s):
        # identificador suelto que no es recurso = enum (string); lo demás se escribe tal cual
        return s if IDENT.fullmatch(s) and s not in names else {"ref": s}
    return None


def _names(s: str) -> list[str] | None:
    out = [t.strip() for t in s.split(",")]
    return out if all(IDENT.fullmatch(t) for t in out) else None


def _args(cmd: str, text: str) -> dict:
    """Vista estructurada de `text` para los formularios ({} si no se reconoce). El serializer
    escribe `text`: los formularios reescriben `text` y `args` juntos."""
    if cmd == "Propagate" and (m := PROPAGATE.fullmatch(text)):
        props = [{"prop": p, "sats": _names(sats)} for p, sats in BURN.findall(m[3])]
        stops = []
        for item in _split(m[4], ",") if m[4] and m[4].strip() else []:
            k, _, v = item.partition("=")
            stops.append({"param": k.strip(), "value": v.strip()})
        if all(p["sats"] for p in props) and all(st["param"] for st in stops):
            return {"mode": m[1] or "", "backwards": bool(m[2]), "props": props, "stops": stops}
    elif cmd in ("Maneuver", "BeginFiniteBurn", "EndFiniteBurn") and (m := BURN.fullmatch(text)):
        if sats := _names(m[2]):
            return {"burn": m[1], "sats": sats}
    elif cmd in ("Report", "Toggle"):
        toks = [t for t in _split(text, " \t,") if t.strip()]
        if cmd == "Report" and toks and IDENT.fullmatch(toks[0]):
            return {"file": toks[0], "params": toks[1:]}
        if cmd == "Toggle" and len(toks) > 1 and toks[-1] in ("On", "Off") and all(map(IDENT.fullmatch, toks[:-1])):
            return {"subs": toks[:-1], "state": toks[-1]}
    elif cmd == "GMAT" and (m := re.fullmatch(r"(.+?)\s*=(?!=)\s*(.*)", text, re.S)):
        return {"lhs": m[1], "rhs": m[2]}
    elif cmd in ("Target", "Optimize") and (m := re.fullmatch(r"([A-Za-z_]\w*)\s*(\{.*\})?", text, re.S)):
        if (opts := _opts(m[2])) is not None:
            return {"solver": m[1], "opts": opts}
    elif cmd in SOLVER_CALL and (m := SOLVER_CALL_RE.fullmatch(text)):
        parts = _split(m[2], ",")
        opts = _opts(parts[1]) if len(parts) == 2 else {} if len(parts) == 1 else None
        keys, pattern = SOLVER_CALL[cmd]
        rel = re.fullmatch(pattern, parts[0].strip(), re.S)
        if rel and opts is not None and ("opts" in keys or not opts):
            return {"solver": m[1], **dict(zip(keys, rel.groups())), **({"opts": opts} if "opts" in keys else {})}
    elif cmd in ("If", "While"):
        parts = re.split(r"\s*([&|])\s*", text.strip())
        conds = [re.fullmatch(COND, p) for p in parts[::2]]
        if all(conds):
            return {"conds": [{"join": parts[2 * i - 1] if i else "", "lhs": c[1], "op": c[2], "rhs": c[3]}
                              for i, c in enumerate(conds)]}
    elif cmd == "For" and (m := re.fullmatch(r"([A-Za-z_][\w.]*)\s*=\s*([^:]+?)\s*:\s*([^:]+?)(?:\s*:\s*([^:]+?))?\s*", text)):
        start, step, end = (m[2], m[3], m[4]) if m[4] else (m[2], "", m[3])
        return {"var": m[1], "start": start, "step": step, "end": end}
    return {}


def _opts(s: str | None) -> dict | None:
    """`{K = v, ...}` → {"K": "v"} (valores como texto); None si no encaja."""
    if not s:
        return {}
    s = s.strip()
    if not (s.startswith("{") and s.endswith("}")):
        return None
    out = {}
    for item in (t for t in _split(s[1:-1], ",") if t.strip()):
        k, eq, v = item.partition("=")
        if not eq or not IDENT.fullmatch(k.strip()) or not v.strip():
            return None
        out[k.strip()] = v.strip()
    return out


def _cmd(stmt: str, comments: list[str]) -> dict:
    if stmt.startswith("GMAT ") or SEQ_ASSIGN.match(stmt):
        cmd, rest = "GMAT", stmt[5:] if stmt.startswith("GMAT ") else stmt
    else:
        m = IDENT.match(stmt)
        cmd, rest = (m[0], stmt[m.end():]) if m else ("", stmt)
    rest, label = rest.strip(), None
    if rest.startswith("'") and "'" in rest[1:]:
        j = rest.index("'", 1)
        label, rest = rest[1:j], rest[j + 1:].strip()
    out = {"cmd": cmd, "text": rest, "args": _args(cmd, rest), "comments": comments}
    if label is not None:
        out["label"] = label
    return out


def parse(text: str) -> dict:
    items = list(statements(text))
    stmts = [it[1] for it in items if it[0] == "stmt"]
    end = stmts.index("BeginMissionSequence") if "BeginMissionSequence" in stmts else len(stmts)
    created: dict[str, str] = {}
    for s in stmts[:end]:  # 1.ª pasada: nombres creados (puede haber asignaciones antes del Create)
        if m := re.match(r"Create\s+\w+\s+(.+)", s, re.S):
            for t in _split(m[1], ", \t"):
                if (n := ARRAY_NAME.fullmatch(t.strip()) or IDENT.fullmatch(t.strip())):
                    created.setdefault(n[1] if n.re is ARRAY_NAME else n[0], "")
    names = set(created)

    resources: dict[str, dict] = {}
    raw: list[str] = []
    root: list[dict] = []
    stack: list[dict] = []  # bloques abiertos
    pending: list[str] = []
    in_seq = False

    def to_raw(stmt: str, inline: list[str]):
        raw.extend(pending + [stmt + ";"] + inline)
        pending.clear()

    for it in items:
        if it[0] == "comment":
            if in_seq and (m := DISABLED.fullmatch(it[1])):
                c = _cmd(m[1].strip(), pending)
                c["disabled"] = True
                (stack[-1]["children"] if stack else root).append(c)
                pending = []
            else:
                pending.append(it[1])
            continue
        _, s, inline = it
        if not in_seq and s == "BeginMissionSequence":
            in_seq = True
            raw.extend(pending)  # comentarios al final de los recursos: se quedan antes de BMS
            pending = list(inline)
            continue
        if in_seq:
            if s.split()[0] in CLOSERS and stack and BLOCKS[stack[-1]["cmd"]] == s.split()[0]:
                block = stack.pop()
                block["endComments"] = pending + inline
                if s != BLOCKS[block["cmd"]]:
                    block["endText"] = s[len(BLOCKS[block["cmd"]]):].strip()
                pending = []
                continue
            c = _cmd(s, pending + inline)
            pending = []
            (stack[-1]["children"] if stack else root).append(c)
            if c["cmd"] in BLOCKS:
                c["children"] = []
                stack.append(c)
            continue
        if m := re.match(r"Create\s+(\w+)\s+(.+)", s, re.S):
            new: dict | None = {}
            for t in (t.strip() for t in _split(m[2], ", \t") if t.strip()):
                a = ARRAY_NAME.fullmatch(t)
                n = a[1] if a else t if IDENT.fullmatch(t) else None
                if n is None or resources.get(n, {}).get("type") or n in new:
                    new = None
                    break
                new[n] = {"NumRows": int(a[2]), "NumCols": int(a[3])} if a else {}
            if not new:
                to_raw(s, inline)
                continue
            for n, dims in new.items():
                r = resources.setdefault(n, {"type": None, "name": n, "fields": {}, "comments": []})
                r["type"], r["fields"] = m[1], {**dims, **r["fields"]}
            resources[next(iter(new))]["comments"][:0] = pending + inline
            pending = []
            continue
        m = ASSIGN.fullmatch(s)
        v = value(m[3], names) if m and m[1] in names else None
        # campo repetido: algunos acumulan (AddTrackingConfig), así que el resto va a raw en orden
        if v is None or m[2] in resources.get(m[1], {}).get("fields", {}):
            to_raw(s, inline)
            continue
        # asignación antes del Create: se guarda hasta verlo
        r = resources.setdefault(m[1], {"type": None, "name": m[1], "fields": {}, "comments": []})
        r["comments"] += pending + inline
        pending = []
        r["fields"][m[2]] = v
    raw.extend(pending)
    for r in resources.values():
        if r["type"] is None:  # el Create no se entendió: sus asignaciones vuelven a raw
            from app.script.serializer import fmt
            raw.extend(r["comments"] + [f"GMAT {r['name']}.{k} = {fmt(v, names)};" for k, v in r["fields"].items()])
    return {"resources": [r for r in resources.values() if r["type"]], "sequence": root, "raw": raw}
