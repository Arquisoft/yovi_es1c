# Dockerfile
FROM node:18-alpine

WORKDIR /app

# Instalar herramientas de build para sqlite3
RUN apk add --no-cache python3 make g++

# Crear carpeta de datos con permisos
RUN mkdir -p /app/data && chmod 777 /app/data

# Copiar package.json y package-lock.json primero para cache
COPY package*.json ./

# Instalar dependencias (compila sqlite3 para Linux)
RUN npm install

# No copiar node_modules local, solo el código fuente
COPY src ./src
COPY tsconfig.json ./

# Compilar TypeScript
RUN npm run build

# Copiar archivos SQL a dist (necesario para runtime)
COPY src/database/schema.sql ./dist/database/

EXPOSE 3002

CMD ["npm", "start"]
