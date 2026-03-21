# Deployment Documentation

## Overview

This project was updated to follow production-ready Docker practices for both frontend and backend services.

---

## Key Improvements

### 1. Optimized Dependency Installation

  ```
  COPY . . RUN npm install
  ```

  ```
  COPY package*.json ./ RUN npm install COPY . .
  ```

* Enables Docker layer caching
* Dependencies are installed only when package.json changes
* Significantly faster rebuilds

### 2. Switched to Lightweight Base Image

* Replaced `nodemon` with `node` in backend
* Installed only production dependencies using:

  ```
  FROM node:18
  ```

  ```
  FROM node:18-alpine
  ```

### 3. Improved Build Performance

* Avoids reinstalling dependencies on every code change
* Better suited for iterative development

### 4. Maintained Development Workflow

* Still uses:

  ```
  npm start
  ```

* Supports hot reloading (with volumes in docker-compose)




