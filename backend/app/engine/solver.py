"""Eventos `solver` sacados del texto de progreso que GMAT escribe en su log (ShowProgress).
Python puro: no importa gmatpy ni calcula nada; solo lee lo que imprime el motor.

Formatos (GMAT-src `DifferentialCorrector::GetProgressString`, `Yukonad::GetProgressString`):
  *** Performing Differential Correction (using "DC")
  DC Iteration 3; Nominal Pass                       (Yukon: `Iteration 1; Function Evaluation 2; ...`)
     Variables:  TOI.Element1 = 0.9, GOI.Element1 = 0.83
        DefaultSC.ECC  Desired: 0  Achieved: 0.008  Variance: -0.008
     Cost Function Value: 8 / Delta G = -4            (Yukon)
  *** The Targeter converged! / *** Targeting did not converge in 3 iterations
"""
import re

from app.script.parser import parse

HEADER = re.compile(r'^\*\*\* Performing (.+?) \(using "(\w+)"\)')
ITER = re.compile(r"^(\w+) Iteration (\d+); (?:Function Evaluation (\d+); )?Nominal Pass")
VARS = re.compile(r"^\s+Variables:\s+(.*=.*)$")
PAIR = re.compile(r"\s*(.+?) = (\S+?)(?:,|$)")
GOAL = re.compile(r"^\s+(\S+)\s+Desired: (\S+)\s+Achieved: (\S+)\s+Variance: (\S+)")
COST = re.compile(r"^\s+Cost Function Value: (\S+)")
DELTA = re.compile(r"^\s+Delta (.+?) = (\S+)")
STATE = re.compile(r"^\s+\w+ State: (.+)")
DONE = re.compile(r"^\*\*\* (?:The Targeter converged|The Optimizer Converged)")
FAIL = re.compile(r"^\*\*\* (Targeting|Optimization) (?:did not converge|terminated) in (\d+)|^\*\*\* An error occurred during optimization")
INITIAL = re.compile(r"^\*\*\* Targeting Completed Initial Guess Run")
COMPLETED = re.compile(r"^\*\*\* (?:Targeting|Optimization) Completed in (\d+)")
DEFAULT_TOL = 0.1  # Achieve sin Tolerance (default de GMAT)


def _num(s: str):
    try:
        return float(s)
    except ValueError:
        return s


def tolerances(script: str) -> dict[tuple[str, str], object]:
    """(solver, lhs) → Tolerance de cada Achieve del script (texto si es una expresión)."""
    out: dict = {}

    def walk(cmds):
        for c in cmds:
            a = c.get("args") or {}
            if c.get("cmd") == "Achieve" and not c.get("disabled") and a.get("lhs"):
                out[(a["solver"], a["lhs"].strip())] = _num((a.get("opts") or {}).get("Tolerance", str(DEFAULT_TOL)))
            walk(c.get("children") or [])
    walk(parse(script)["sequence"])
    return out


class SolverLog:
    """Se alimenta línea por línea; `feed` devuelve los eventos listos.
    Una fila de iteración se emite al empezar la siguiente o al terminar el solver."""

    def __init__(self, script: str):
        self.tol = tolerances(script)
        self.count = 0
        self.active: dict[str, dict] = {}  # solver → {run, kind, row}
        self.cur: str | None = None  # último solver que imprimió cabecera o iteración
        self.section = "eq"

    def _flush(self, name: str) -> list[dict]:
        st = self.active.get(name)
        row = st and st.pop("row", None)
        return [row] if row else []

    def _end(self, kind: str, status: str, iterations: int | None, text: str) -> list[dict]:
        # shortcut: el cierre no nombra al solver; se asigna al último activo del mismo tipo (Target/Optimize).
        name = next((n for n in reversed(list(self.active)) if self.active[n]["kind"] == kind), None)
        if name is None:
            return []
        out = self._flush(name)
        st = self.active.pop(name)
        out.append({"type": "solver", "event": "end", "run": st["run"], "solver": name, "kind": kind,
                    "status": status, "converged": status == "converged",
                    "iterations": iterations if iterations is not None else st.get("completed"), "message": text.strip("* ")})
        return out

    def feed(self, line: str) -> list[dict]:
        if m := HEADER.match(line):
            name = m[2]
            out = self._flush(name)
            self.count += 1
            kind = "Target" if "Differential Correction" in m[1] else "Optimize"
            self.active[name] = {"run": self.count, "kind": kind}
            self.cur = name
            return out + [{"type": "solver", "event": "start", "run": self.count, "solver": name,
                           "kind": kind, "algorithm": m[1]}]
        if (m := ITER.match(line)) and m[1] in self.active:
            out = self._flush(m[1])
            self.cur = m[1]
            st = self.active[m[1]]
            st["row"] = {"type": "solver", "event": "iteration", "run": st["run"], "solver": m[1],
                         "iteration": int(m[2]), **({"evaluation": int(m[3])} if m[3] else {}),
                         "variables": [], "goals": [], "constraints": []}
            return out
        if m := COMPLETED.match(line):
            st = next((s for s in reversed(self.active.values())), None)
            if st:
                st["completed"] = int(m[1])
            return []
        if DONE.match(line):
            return self._end("Target" if "Targeter" in line else "Optimize", "converged", None, line)
        if m := FAIL.match(line):
            kind = "Target" if m[1] == "Targeting" else "Optimize"
            return self._end(kind, "failed", int(m[2]) if m[2] else None, line)
        if INITIAL.match(line):
            return self._end("Target", "initial", None, line)
        row = self.cur and self.active.get(self.cur, {}).get("row")
        if not row:
            return []
        if (m := VARS.match(line)) and not row["variables"]:
            row["variables"] = [{"name": n.strip(), "value": _num(v)} for n, v in PAIR.findall(m[1])]
        elif m := GOAL.match(line):
            tol = self.tol.get((self.cur, m[1]), DEFAULT_TOL)
            var = _num(m[4])
            g = {"name": m[1], "desired": _num(m[2]), "achieved": _num(m[3]), "variance": var, "tolerance": tol}
            if isinstance(tol, float) and isinstance(var, float):
                g["met"] = abs(var) <= tol  # mismo criterio que imprime GMAT: |Desired - Achieved| <= Tolerance
            row["goals"].append(g)
        elif m := COST.match(line):
            row["cost"] = _num(m[1])
        elif "Inequality Constraint Variances" in line:
            self.section = "ineq"
        elif "Equality Constraint Variances" in line:
            self.section = "eq"
        elif m := DELTA.match(line):
            row["constraints"].append({"name": m[1], "kind": self.section, "value": _num(m[2])})
        elif m := STATE.match(line):
            row["state"] = m[1].strip()
        return []
