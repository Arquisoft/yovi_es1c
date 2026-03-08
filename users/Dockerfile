# Stage 1: Build
FROM node:18-alpine AS build

WORKDIR /app

# Instalar dependencias de build y herramientas necesarias
RUN apk add --no-cache g++ make python3

# Copiar package.json y package-lock.json primero para cache
COPY package*.json ./

# Instalar dependencias
RUN npm install

# Copiar código fuente
COPY src ./src
COPY tsconfig.json ./

# Compilar TypeScript
RUN npm run build

# Copiar SQL a dist
COPY src/database/users.sql ./dist/database/

# Stage 2: Runtime
FROM node:18-alpine AS runtime

WORKDIR /app

# Crear carpeta de datos con permisos
RUN mkdir -p /app/data && chmod 777 /app/data

# Copiar build y package.json
COPY --from=build /app/dist ./dist
COPY --from=build /app/package*.json ./
COPY src/database/users.sql ./dist/src/database/

# Instalar solo dependencias de producción
RUN npm ci --only=production --silent

EXPOSE 3000

CMD ["npm", "start"]