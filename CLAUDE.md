# GMAT Web

Web port of NASA GMAT R2026a: FastAPI backend on top of `gmatpy` (real engine) + React/Vite/TS/Cesium frontend.

## Project context (before exploring code)

Read `docs/SYSTEM.md`: the pieces (frontend, backend, GMAT engine) and what each kind of change touches.

To locate something, in this order:
1. `Grep` the keyword inside `docs/`. Concepts in `MAP.md`, symbols in `SYMBOLS.tsv` (do not read it whole).
2. `docs/TASKS.md` if you are going to implement: files, order, model file and verification command.
3. `docs/GOTCHAS.md` before touching the engine, the parser or the script ↔ model sync.
4. Only if that fails: grep the repo and add the missing entry to `docs/MAP.md`.

With the file located, `Grep` the symbol and `Read` with `offset`. When a change is done, run `sh docs/docs.sh stale` and update what it lists.

## At the start of each session

On the `game/msl-edl` branch, `PLAN-EDL.md` rules (rover landing on Mars, phases E0-E7): read its **Progress**, follow its **Per-session protocol** and do not touch `main`. On the other branches:

There are two plans. The active one is `PLAN-JUEGO.md` ("Trip to the Moon" game, phases J0-J6); `PLAN.md` (web port) resumes at its Phase 9 when the game reaches J4 or the user asks for it.

1. Read `PLAN-JUEGO.md` → **Progress** and take the first unchecked phase.
2. Follow its **Per-session protocol**: a single phase, verify it, update Progress and Log, commit + push.
3. Read only the files the phase touches. The **Decisions made** in `PLAN-JUEGO.md` rule and, where they don't cover something, those in `PLAN.md`.

## Hard restrictions

- GMAT (`gmatpy`) computes the physics. Never reimplement propagation, maneuvers or conversions in the frontend.
- The FastAPI process never imports `gmatpy`: everything goes through worker processes (the engine is a global singleton).
- GMAT path only through `GMAT_HOME` (local: `C:\Users\Yaxon\Downloads\gmat-win-R2026a`). Reference C++ code: `C:\Users\Yaxon\Downloads\GMAT-src`.
- Every script goes through `sanitize` before running: no Python/MATLAB/system calls, output paths rewritten to the run's temporary folder.
- Opening/saving `.script` must stay compatible with desktop GMAT; the parser never drops lines (they go to `raw`).
- No NASA logos or marks; attribution to GMAT (Apache 2.0) in `NOTICE`.
- UI text in `frontend/src/i18n/es.ts`.
