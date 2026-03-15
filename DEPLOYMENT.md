# Deployment Notes

This doc sums up what was done for deployment and CI (Task 4, Option A).

## What’s in place

**ESLint (backend)**  
- Linting runs on the backend with `npm run lint` (from the `backend` folder).  
- Config is in `backend/eslint.config.js` (ESLint 10 flat config).  
- We use the recommended rule set and only allow unused vars that start with `_` (e.g. `_err` in catch blocks).  
- Goal: keep style and obvious issues in check before merge.

**GitHub Actions CI**  
- Workflow file: `.github/workflows/ci.yml`.  
- Runs on push to `solution/kartavya`, `main`, and `master`, and on pull requests targeting `main` or `master`.  
- Steps: checkout → Node 18 → `npm ci` and `npm run lint` in backend → `docker compose up -d --build` → wait 15s → `curl -f http://localhost:3001/api/health` → `docker compose down`.  
- So every run checks that the backend lints and that the app comes up and answers the health endpoint.

## How to run it locally

- **Lint:** From repo root, `cd backend && npm run lint`.  
- **App:** From repo root, `docker compose up --build`. Then open http://localhost:3000 (frontend) and http://localhost:3001/api (backend).

## Optional next steps

- Move DB credentials and secrets to env vars (or a secrets manager) and pass them into the backend in production.  
- Add a staging/production docker-compose override or separate compose file if you need different config per environment.
