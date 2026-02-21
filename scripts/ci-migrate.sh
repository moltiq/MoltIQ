#!/usr/bin/env bash
# Run Prisma migrations (for CI or local). Requires DATABASE_URL.
set -e
cd "$(dirname "$0")/.."
export DATABASE_URL="${DATABASE_URL:-file:./packages/db/dev.db}"
pnpm db:generate
pnpm --filter moltiq-db exec prisma migrate deploy
