# MoltIQ API server — deploy to Railway, Render, Fly.io, or any Docker host
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json ./apps/server/
COPY packages/core/package.json ./packages/core/
COPY packages/db/package.json ./packages/db/
COPY packages/vector/package.json ./packages/vector/
RUN pnpm install --frozen-lockfile

# Build
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=deps /app/packages/core/node_modules ./packages/core/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=deps /app/packages/vector/node_modules ./packages/vector/node_modules
COPY . .
RUN pnpm db:generate && pnpm run build

# Production image
FROM base AS runner
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=deps /app/packages/core/node_modules ./packages/core/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=deps /app/packages/vector/node_modules ./packages/vector/node_modules
COPY --from=builder /app/packages/db/node_modules/.prisma ./packages/db/node_modules/.prisma
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/packages/db/dist ./packages/db/dist
COPY --from=builder /app/packages/vector/dist ./packages/vector/dist
COPY --from=builder /app/packages/db/prisma ./packages/db/prisma
COPY apps/server/package.json ./apps/server/
COPY packages/core/package.json ./packages/core/
COPY packages/db/package.json ./packages/db/
COPY packages/vector/package.json ./packages/vector/

# Default: SQLite in /data (mount a volume or use platform storage)
ENV DATABASE_URL=file:/data/moltiq.db
# Optional: run without Chroma (non-vector routes only)
ENV CHROMA_OPTIONAL=true
EXPOSE 37777
WORKDIR /app

# Run migrations then start the server (use PORT from platform if set)
CMD pnpm --filter moltiq-db exec prisma migrate deploy && node apps/server/dist/index.js
