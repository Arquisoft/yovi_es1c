FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY tsconfig.json ./
COPY vitest.config.ts ./
COPY src ./src
COPY scripts ./scripts

EXPOSE 3001

CMD ["sh", "-c", "npm run db:init && npm start"]