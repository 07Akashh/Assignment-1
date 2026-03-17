# --- build stage ---
FROM node:18-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

# --- runtime stage ---
FROM nginx:alpine AS runtime

COPY --from=build /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

RUN addgroup -S appgroup && adduser -S appuser -G appgroup \
  && chown -R appuser:appgroup /usr/share/nginx/html /var/cache/nginx /var/log/nginx \
  && touch /run/nginx.pid \
  && chown appuser:appgroup /run/nginx.pid
USER appuser

EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
