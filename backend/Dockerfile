# Build stage
FROM node:18-slim AS builder

WORKDIR /app

# Context is ./backend (aligned with docker-compose)
COPY backend/package*.json ./
RUN npm install

COPY backend/ .
# Copy existing DB folder from root
COPY db/ ./db/


# Production stage
FROM node:18-slim

WORKDIR /app

# Install security updates
RUN apt-get update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/*

# Copy from builder stage
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/db ./db

# Use non-root user
USER node

EXPOSE 3001

CMD ["node", "src/index.js"]
