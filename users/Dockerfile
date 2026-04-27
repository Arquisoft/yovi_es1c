# Stage 1: Build
FROM node:22-alpine AS build

WORKDIR /app

RUN apk add --no-cache g++ make python3

COPY package*.json ./
RUN npm ci

COPY src ./src
COPY tsconfig.json ./

RUN npm run build
COPY src/database/users.sql ./dist/src/database/users.sql

# Stage 2: Runtime
FROM node:22-alpine AS runtime

WORKDIR /app

COPY --from=build /app/dist ./dist
COPY --from=build /app/package*.json ./

RUN npm ci --omit=dev --silent

EXPOSE 3000
CMD ["npm", "start"]