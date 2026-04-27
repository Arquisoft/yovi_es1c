FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY src ./src
COPY tsconfig.json ./

RUN npm run build

COPY src/database/schema.sql ./dist/src/database/

EXPOSE 3002

CMD ["npm", "start"]