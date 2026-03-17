# --- deps stage: install production dependencies only ---
FROM node:18-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev

# --- runtime stage ---
FROM node:18-alpine AS runtime
WORKDIR /app

# Set production mode so Express behaves correctly even if the caller forgets
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3001

# Docker marks the container unhealthy if the API or DB becomes unreachable,
# enabling orchestrators (Compose, Swarm, Kubernetes) to restart it automatically
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/health || exit 1

CMD ["node", "src/index.js"]
