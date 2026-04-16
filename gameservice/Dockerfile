# Dockerfile
FROM node:18-alpine

WORKDIR /app

# Copiar package.json y package-lock.json primero para cache
COPY package*.json ./

# Instalar dependencias
RUN npm install

# No copiar node_modules local, solo el código fuente
COPY src ./src
COPY tsconfig.json ./

# Compilar TypeScript
RUN npm run build

# Copiar archivos SQL a dist (necesario para runtime)
COPY src/database/schema.sql ./dist/src/database/

EXPOSE 3002

CMD ["npm", "start"]