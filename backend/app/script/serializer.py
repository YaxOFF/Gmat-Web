"""Modelo JSON → script GMAT con formato estable (estilo de GMAT escritorio)."""
from app.script.parser import BLOCKS, IDENT

INDENT = "   "


def fmt(v, names: set[str]) -> str:
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return repr(v)
    if isinstance(v, dict):
        return v["ref"]
    if isinstance(v, list):
        if v and all(isinstance(r, list) for r in v):  # matriz [a b; c d]
            return "[" + "; ".join(" ".join(fmt(x, names) for x in r) for r in v) + "]"
        if v and all(isinstance(x, (int, float)) and not isinstance(x, bool) for x in v):
            return "[" + " ".join(fmt(x, names) for x in v) + "]"
        return "{" + ", ".join(fmt(x, names) for x in v) + "}"
    # string: sin comillas solo si es un identificador que no se confunde con recurso/bool
    bare = IDENT.fullmatch(v) and v not in names and v not in ("true", "false")
    return v if bare else f"'{v}'"


def _seq(cmds: list[dict], depth: int, out: list[str]) -> None:
    pad = INDENT * depth
    for c in cmds:
        out.extend(pad + x for x in c.get("comments", []))
        head = " ".join(x for x in (c["cmd"], f"'{c['label']}'" if "label" in c else "") if x)
        text = c.get("text", "")
        sep = "" if not head or not text or text.startswith("(") else " "
        out.append(f"{pad}{head}{sep}{text};")
        if c["cmd"] in BLOCKS and "children" in c:
            _seq(c["children"], depth + 1, out)
            out.extend(pad + INDENT + x for x in c.get("endComments", []))
            end = " ".join(x for x in (BLOCKS[c["cmd"]], c.get("endText", "")) if x)
            out.append(f"{pad}{end};")


def serialize(model: dict) -> str:
    names = {r["name"] for r in model.get("resources", [])}
    out: list[str] = []
    for r in model.get("resources", []):
        out.extend(r.get("comments", []))
        fields = dict(r.get("fields", {}))
        name = r["name"]
        if r["type"] == "Array" and "NumRows" in fields and "NumCols" in fields:
            name += f"[{fields.pop('NumRows')},{fields.pop('NumCols')}]"
        out.append(f"Create {r['type']} {name};")
        out.extend(f"GMAT {r['name']}.{k} = {fmt(v, names)};" for k, v in fields.items())
        out.append("")
    out.extend(model.get("raw", []))
    out += ["", "BeginMissionSequence;"]
    _seq(model.get("sequence", []), 0, out)
    return "\n".join(out) + "\n"
