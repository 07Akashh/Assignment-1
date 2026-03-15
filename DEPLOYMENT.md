# Deployment Improvements

## What changed

### 1. Switched to Alpine-based images
- Changed `node:18` to `node:18-alpine` and `postgres:15` to `postgres:15-alpine`
- Reduces image size from ~900MB to ~120MB per container

### 2. Docker layer caching
- Copy `package*.json` first, run `npm install`, then copy source code
- Now code changes don't trigger a full dependency reinstall

### 3. Production dependencies only (backend)
- Added `--production` flag to `npm install` in backend Dockerfile
- Skips devDependencies (nodemon etc.) in the production image

### 4. Database credentials via environment variables
- `backend/src/config/db.js` now reads from `process.env` instead of hardcoded values
- Credentials are passed through `docker-compose.yml` environment section
- Makes it easy to swap credentials per environment without code changes

### 5. Database healthcheck
- Added `pg_isready` healthcheck on the db service
- Backend now uses `depends_on: condition: service_healthy` instead of just `depends_on`
- Prevents the backend from starting before Postgres is actually ready to accept connections

### 6. Restart policy
- Added `restart: on-failure` to backend service
- If the backend crashes, Docker will restart it automatically
