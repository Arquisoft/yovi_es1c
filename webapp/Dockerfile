# Build stage
FROM node:22-alpine AS builder
WORKDIR /app

# Install deps
COPY package.json package-lock.json ./
RUN npm ci --silent

# Copy sources
COPY . .

# Accept build-time API url (defaults to localhost:3000)
ARG VITE_API_URL="/api/users"
ARG VITE_GAMEY_API_URL="/api/gamey"

RUN export VITE_API_URL=${VITE_API_URL} && export VITE_GAMEY_API_URL=${VITE_GAMEY_API_URL} && npm run build

# Production image
FROM nginx:stable-alpine

# Copiar archivos compilados
COPY --from=builder /app/dist /usr/share/nginx/html
# Copiar archivo de configuracion nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
