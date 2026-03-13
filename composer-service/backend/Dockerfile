FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --only=production

FROM node:20-alpine AS runtime
WORKDIR /app

RUN addgroup -g 1001 -S compositor && \
    adduser -S compositor -u 1001

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src

RUN mkdir -p /app/data && chown compositor:compositor /app/data

USER compositor

EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/api/health/live || exit 1

CMD ["node", "src/index.js"]
