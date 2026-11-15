# syntax=docker/dockerfile:1
# API FastAPI + motor GMAT R2026a (build de Ubuntu, gmatpy para Python 3.12).

# --- GMAT: descarga con sha256 fijo ---------------------------------------------------------
FROM debian:bookworm-slim AS gmat
# GMAT_URL se puede cambiar por un mirror concreto de SourceForge si el automático va lento;
# el sha256 garantiza que el archivo es el mismo.
ARG GMAT_URL=https://downloads.sourceforge.net/project/gmat/GMAT/GMAT-R2026a/gmat-ubuntu-x64-R2026a.tar.gz
ARG GMAT_SHA256=fe124b4a606b2e3b704a6fbb1c37b87598d5df0d18cb661c304b5f60074a7754
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
RUN curl -fSL --retry 5 --retry-delay 5 -o /tmp/gmat.tgz "$GMAT_URL" \
 && echo "$GMAT_SHA256  /tmp/gmat.tgz" | sha256sum -c - \
 && mkdir -p /opt/gmat \
 && tar xzf /tmp/gmat.tgz -C /opt/gmat --strip-components=2 \
 && rm /tmp/gmat.tgz

# --- Runtime -------------------------------------------------------------------------------
# gmatpy y los plugins del núcleo no piden librerías extra en Debian slim. Las que faltan
# (GL/X11 de OpenFrames, SNOPT de CSALT) son de plugins de escritorio que la web no usa.
FROM python:3.12-slim-bookworm
COPY --from=gmat /opt/gmat /opt/gmat
RUN useradd --system --uid 10001 --user-group --home-dir /nonexistent --shell /usr/sbin/nologin app \
 && mkdir -p /opt/gmat/output /var/lib/gmat-web/cache /var/lib/gmat-web/runs \
 && chown app:app /opt/gmat/output /var/lib/gmat-web/cache /var/lib/gmat-web/runs

WORKDIR /srv/api
COPY pyproject.toml ./
COPY app ./app
RUN pip install --no-cache-dir . && rm -rf build *.egg-info

ENV GMAT_HOME=/opt/gmat \
    GMAT_WEB_CACHE=/var/lib/gmat-web/cache \
    GMAT_WEB_RUNS=/var/lib/gmat-web/runs \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

USER app
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=20s --start-period=60s --retries=3 \
  CMD python -c "import json,sys,urllib.request as u; sys.exit(json.load(u.urlopen('http://127.0.0.1:8000/api/health',timeout=15))['status']!='ok')"
# Un solo proceso uvicorn: las corridas viven en memoria de este proceso (runner.runs).
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips=*"]
