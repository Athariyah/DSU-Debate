FROM node:22-alpine AS build
WORKDIR /app

COPY backend/package*.json ./
RUN npm ci
COPY backend/tsconfig.json ./
COPY backend/src ./src
COPY sql ./sql
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/sql ./sql
EXPOSE 4000
CMD ["node", "dist/server.js"]
