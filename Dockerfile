# syntax=docker/dockerfile:1

# --- Stage 1: build the Vite SPA -------------------------------------------
FROM oven/bun:1.3.14 AS web
WORKDIR /web
COPY web/package.json web/bun.lock ./
RUN bun install --frozen-lockfile
COPY web/ ./
RUN bun run build   # tsc -b && vite build -> /web/dist

# --- Stage 2: install backend production dependencies ----------------------
FROM oven/bun:1.3.14 AS deps
WORKDIR /app
COPY package.json bun.lock ./
# Runtime needs only prod deps; --ignore-scripts skips the dev-only
# effect-language-service "prepare" patch.
RUN bun install --frozen-lockfile --production --ignore-scripts

# --- Stage 3: runtime ------------------------------------------------------
FROM oven/bun:1.3.14 AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json bun.lock ./
COPY src ./src
# Backend serves the built SPA from /app/web/dist (see src/static/http.ts).
COPY --from=web /web/dist ./web/dist

EXPOSE 3000
CMD ["bun", "src/main.ts"]
