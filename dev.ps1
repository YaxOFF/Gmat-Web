# Levanta backend (:8000) y frontend (Vite, proxy /api -> :8000). Requiere GMAT_HOME.
$ErrorActionPreference = 'Stop'
if (-not $env:GMAT_HOME) { throw 'Definir GMAT_HOME (carpeta de GMAT R2026a)' }
$root = $PSScriptRoot
$py = Join-Path $root 'backend\.venv\Scripts\python.exe'

if (-not (Test-Path $py)) {
  Push-Location "$root\backend"; uv venv .venv; uv pip install --python $py -e '.[dev]'; Pop-Location
}
if (-not (Test-Path "$root\frontend\node_modules")) {
  Push-Location "$root\frontend"; npm install; Pop-Location
}

$api = Start-Process -PassThru -NoNewWindow -WorkingDirectory "$root\backend" $py '-m uvicorn app.main:app --port 8000'
try {
  Push-Location "$root\frontend"; npm run dev
} finally {
  Pop-Location
  Stop-Process -Id $api.Id -ErrorAction SilentlyContinue
}
