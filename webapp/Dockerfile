# Build stage
FROM node:22-alpine AS builder
WORKDIR /app

# Install deps
COPY package.json package-lock.json ./
RUN npm ci --silent

# Copy sources
COPY . .

# Build args (valores por defecto)
ARG VITE_API_URL=/api/users
ARG VITE_GAMEY_API_URL=/api/gamey

# IMPORTANTE: usar ENV, no export
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_GAMEY_API_URL=$VITE_GAMEY_API_URL

# Build app
RUN npm run build

# Production image
FROM nginx:stable-alpine

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]