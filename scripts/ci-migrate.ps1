# Run Prisma migrations (for CI or local). Requires DATABASE_URL.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

$env:DATABASE_URL = if ($env:DATABASE_URL) { $env:DATABASE_URL } else { "file:./packages/db/dev.db" }
pnpm db:generate
pnpm --filter moltiq-db exec prisma migrate deploy
