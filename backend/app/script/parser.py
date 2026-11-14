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
    out = {"cmd": cmd, "text": rest, "args": {}, "comments": comments}
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
