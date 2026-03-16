# Deployment

## Running Locally

```bash
docker compose up --build
```

- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:3001/api
- **PostgreSQL:** localhost:5432

The database is automatically seeded with sample customers, products, and orders on first run.

## Environment Variables

| Variable | Default | Used By |
|----------|---------|---------|
| `PORT` | `3001` | Backend |
| `POSTGRES_USER` | `admin` | Database |
| `POSTGRES_PASSWORD` | `admin123` | Database |
| `POSTGRES_DB` | `orderdb` | Database |
| `REACT_APP_API_URL` | `http://localhost:3001/api` | Frontend |

## CI Pipeline

The GitHub Actions workflow (`.github/workflows/ci.yml`) runs on pushes and PRs to `master`. It has two jobs that run in parallel:

**Lint** — Installs backend dependencies and runs ESLint against `backend/src/`.

**Health Check** — Builds and starts the full Docker Compose stack, waits for the backend to be ready, then verifies that `/api/health` and `/api/orders` return 200. Containers are torn down after the run regardless of pass/fail.

## Running Lint Manually

```bash
cd backend
npm install
npm run lint
```
