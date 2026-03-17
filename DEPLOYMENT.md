# Deployment Guide

---

## Prerequisites

- Docker ≥ 24 and Docker Compose v2 (`docker compose`, not `docker-compose`)
- A `.env` file at the project root

---

## Quick Start

```bash
cp .env.example .env
# Fill in real values — especially DB_PASSWORD and ALLOWED_ORIGINS
docker compose up -d --build
```

- Frontend: http://localhost:3000
- API: http://localhost:3001/api
- Health: http://localhost:3001/api/health

---

## Environment Variables

See `.env.example` for all variables with descriptions. The ones that must change for any real deployment:

- `DB_PASSWORD` — use a strong password, not the placeholder
- `ALLOWED_ORIGINS` — set to your actual frontend domain
- `REACT_APP_API_URL` — set to your actual API domain **before building the frontend** (it is baked into the JS bundle at build time, not read at runtime)

---

## What Changed and Why

**`backend/Dockerfile`**

- Added `ENV NODE_ENV=production` — ensures Express runs in production mode even if the orchestrator forgets to set it.
- Added `HEALTHCHECK` — Docker/Compose uses this to determine container readiness and restart unhealthy containers. Hits `/api/health` which also verifies DB connectivity.

**`frontend/Dockerfile`**

- Added `ARG REACT_APP_API_URL` and `ARG REACT_APP_PAGE_LIMIT` — React bakes env vars into the bundle at build time. Without build args the bundle always targets `localhost:3001`, which breaks in any deployed environment. These are passed in via `docker-compose.yml` build args.

**`docker-compose.yml`**

- `postgres:15` → `postgres:15-alpine` — ~70 MB smaller image, no functional difference.
- DB port bound to `127.0.0.1:5432` — Postgres is not reachable from the host network, only from containers on `app-net` and local tooling on the same machine.
- `env_file: .env` on all services — avoids enumerating every variable in `environment:`. Variables in `environment:` still override `.env` where needed (`DB_HOST: db`, `NODE_ENV: production`).
- Explicit `networks: app-net` — named bridge network so services resolve each other by name and the frontend cannot reach the database directly.
- `logging` with `json-file` and size limits — prevents log files from filling the host disk in long-running deployments.
- `deploy.resources.limits` — caps memory and CPU per service so a runaway process cannot take down the host.
- `init.sql` mounted `:ro` — the seed script is read-only; no reason for Postgres to write to it.
- `build.args` for frontend — passes `REACT_APP_*` values through to the build stage.

---

## CI Pipeline

Runs on every pull request and push to `master`.

**`lint-backend`** — ESLint over `backend/src` with `eslint:recommended` + Node env.

**`lint-frontend`** — ESLint over `frontend/src` extending `react-app`, zero warnings allowed.

**`integration`** — starts only `db` and `backend` (no frontend needed for API tests), polls `/api/health` until `{"db":"ok"}`, then runs smoke tests against orders, products, and customers endpoints and verifies that a bad POST returns 400.

---

## Production Checklist

- Replace all placeholder values in `.env` with real secrets — never commit `.env`
- Store secrets in a secrets manager, not in the repo
- Set `REACT_APP_API_URL` to the real API domain before building
- Put a TLS-terminating reverse proxy (nginx, Caddy, Traefik) in front of the API
- Remove the DB port mapping if the host does not need direct database access
- Set up log shipping to collect the `json-file` logs from each container
