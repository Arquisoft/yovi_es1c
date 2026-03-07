FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache python3 make g++

RUN mkdir -p /app/data && chmod 777 /app/data

COPY package*.json ./

RUN npm ci

COPY tsconfig.json ./
COPY vitest.config.ts ./
COPY src ./src
COPY scripts ./scripts

EXPOSE 3001

CMD ["sh", "-c", "npm run db:init && npm start"]
