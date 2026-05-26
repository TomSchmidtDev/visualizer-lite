# syntax=docker/dockerfile:1
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages/api/package.json ./packages/api/
COPY packages/web/package.json ./packages/web/
RUN npm ci

COPY packages/api ./packages/api
COPY packages/web ./packages/web

RUN cd packages/api && npx prisma generate
RUN cd packages/api && npm run build
RUN cd packages/web && npm run build

# ── Runtime ──────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app

COPY --from=builder /app/packages/api/dist         ./packages/api/dist
COPY --from=builder /app/packages/api/node_modules  ./packages/api/node_modules
COPY --from=builder /app/packages/api/prisma        ./packages/api/prisma
COPY --from=builder /app/packages/api/package.json  ./packages/api/package.json
COPY --from=builder /app/packages/web/dist          ./packages/web/dist
COPY --from=builder /app/node_modules               ./node_modules
COPY package.json ./

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV DATA_DIR=/data
EXPOSE 3000

CMD ["sh", "-c", \
  "export DATABASE_URL=\"file:${DATA_DIR}/visualizer.db\" && cd packages/api && npx prisma migrate deploy && node dist/app.js"]
