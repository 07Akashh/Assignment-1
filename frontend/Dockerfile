# Stage 1: Build the React app
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files first for layer caching
COPY package*.json ./
RUN npm install

COPY public ./public
COPY src ./src

RUN npm run build

# Stage 2: Serve the built app with nginx (lightweight ~20MB vs ~1GB Node image)
FROM nginx:alpine AS production

# Copy the built React app into nginx's html directory
COPY --from=builder /app/build /usr/share/nginx/html

# Optional: custom nginx config to handle React Router paths (client-side routing)
RUN echo 'server { \
  listen 3000; \
  root /usr/share/nginx/html; \
  index index.html; \
  location / { try_files $uri $uri/ /index.html; } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
