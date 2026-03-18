# Deployment Improvements

This document explains the improvements made to the Docker setup to make it more production-ready.

## 1. Multi-Stage Builds

- **What**: Both backend and frontend Dockerfiles now use multi-stage builds.
- **Why**: 
  - It reduces the final image size by excluding build-time dependencies (like `npm` and source files not needed at runtime).
  - It improves security by only including the necessary artifacts in the final production image.

## 2. Production Web Server for Frontend

- **What**: The frontend is now built into static files (`npm run build`) and served using **Nginx** instead of the development server.
- **Why**: 
  - Nginx is significantly faster and more reliable for serving static assets.
  - It handles client-side routing correctly with the `try_files` directive, preventing 404 errors on page refresh.

## 3. Security Best Practices

- **What**: 
  - Switched to `slim` and `alpine` base images.
  - Added `USER node` in the backend Dockerfile to run the application as a non-privileged user.
  - Added `apt-get update && upgrade` to ensure system libraries are up to date.
- **Why**: 
  - Smaller images have a reduced attack surface.
  - Running as a non-root user prevents potential container breakout vulnerabilities from gaining root access to the host.

## 4. Docker Compose Enhancements

- **What**: 
  - Added **Health Checks** to the database service.
  - Used `depends_on` with `condition: service_healthy` for the backend.
  - Externalized configuration via **Environment Variables**.
- **Why**: 
  - Health checks ensure the backend only starts once the database is actually ready to accept connections, preventing "connection refused" errors on initial startup.
  - Environment variables allow for different configurations (DB credentials, API URLs) across different environments (dev, staging, prod) without changing the code or Dockerfile.

## 5. Better Reliability

- **What**: Added `restart: always` to backend and frontend services.
- **Why**: Ensures that if a container crashes due to an unhandled error or system reboot, Docker will automatically attempt to restart it.
