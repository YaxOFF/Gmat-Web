#!/usr/bin/env sh
# Levanta backend (:8000) y frontend (Vite, proxy /api -> :8000). Requiere GMAT_HOME.
set -e
: "${GMAT_HOME:?Definir GMAT_HOME (carpeta de GMAT R2026a)}"
root=$(cd "$(dirname "$0")" && pwd)
py="$root/backend/.venv/bin/python"
[ -x "$py" ] || py="$root/backend/.venv/Scripts/python.exe"

if [ ! -x "$py" ]; then
  (cd "$root/backend" && uv venv .venv && uv pip install --python .venv -e '.[dev]')
  py="$root/backend/.venv/bin/python"; [ -x "$py" ] || py="$root/backend/.venv/Scripts/python.exe"
fi
[ -d "$root/frontend/node_modules" ] || (cd "$root/frontend" && npm install)

(cd "$root/backend" && exec "$py" -m uvicorn app.main:app --port 8000) &
api=$!
trap 'kill $api 2>/dev/null' EXIT INT TERM
cd "$root/frontend" && npm run dev
