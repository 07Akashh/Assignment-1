FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files first for better layer caching
# (deps only reinstall when package.json changes, not on every code change)
COPY package*.json ./
RUN npm install --omit=dev

# Copy source code
COPY src ./src

# Run as non-root user for security
USER node

EXPOSE 3001

CMD ["node", "src/index.js"]
