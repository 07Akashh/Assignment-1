# Deployment Documentation

## Overview

This project was updated to follow production-ready Docker practices for both frontend and backend services.

---

## Key Improvements

### 1. Multi-stage build for frontend

* Used Node.js to build the React app
* Served static files using Nginx
* Reduced image size and improved performance

### 2. Removed development dependencies

* Replaced `nodemon` with `node` in backend
* Installed only production dependencies using:

  ```
  npm install --only=production
  ```

### 3. Removed volume mounts

* Code is now copied into the container at build time
* Ensures consistency across environments

### 4. Environment variables

* Moved sensitive data (DB credentials) to `.env` file
* Avoids hardcoding secrets in source code

### 5. Improved security

* Removed database port exposure to the host
* Services communicate via internal Docker network

### 6. Optimized frontend serving

* React app is built using `npm run build`
* Served via Nginx for better performance and scalability

---

## How to Run

1. Create a `.env` file:

```
POSTGRES_USER=admin
POSTGRES_PASSWORD=admin123
POSTGRES_DB=orderdb
```

2. Build and start services:

```
docker compose up --build
```

3. Access application:

* Frontend: http://localhost
* Backend: http://localhost:3001

---

## Notes

* Development setup (with hot reload) is separate from production setup
* This configuration is optimized for deployment environments
