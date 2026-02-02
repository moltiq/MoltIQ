# MoltIQ

Local-first long-term intelligence and memory layer for AI agents. MoltIQ provides a REST API and an MCP server so agents can store, search, recall, and export memories with project scoping and hybrid ranking.

## Features

- **REST API** – Health, search, recall, timeline, stats, export, CRUD memories, event ingestion
- **MCP server** – Tools: `memory.search`, `memory.recall`, `memory.save`, `memory.timeline`, `memory.stats`, `memory.export`
- **SQLite + Prisma** – Structured storage for projects, sessions, events, memories
- **Chroma** – Default vector store (configurable host/port)
- **Hybrid ranking** – Semantic + keyword + recency + tags + pinned/favorite boost
- **Context budgeter** – Pack best memories into a token/character budget
- **Redaction** – Never store API keys, tokens, private keys, wallet keys; configurable denylist
- **Pruning** – Optional `PRUNE_DAYS`; never prunes pinned or favorite memories
- **Export** – JSON, CSV, Markdown

## Requirements

- Node.js 18+
- pnpm 9+
- [Chroma](https://www.trychroma.com/) running (e.g. `docker run -p 8000:8000 chromadb/chroma`) or use stub embeddings for testing

## Install

```bash
pnpm install
```

## Database

Set `DATABASE_URL` (default: `file:./dev.db` for the db package). From repo root:

```bash
# Generate Prisma client and run migrations (from packages/db context)
pnpm db:generate
pnpm db:migrate
```

For the server, use an absolute path or set `DATABASE_URL` in `.env` (e.g. `DATABASE_URL="file:./data/moltiq.db"`). Create the DB directory if needed:

```bash
mkdir -p apps/server/data
```

Then run migrations from the db package:

```bash
cd packages/db && pnpm exec prisma migrate deploy
# or
pnpm --filter moltiq-db exec prisma migrate deploy
```

## Config

- **File**: `~/.moltiq/settings.json`
- **Env**: `MOLTIQ_PORT`, `DATABASE_URL`, `CHROMA_HOST`, `CHROMA_PORT`, `PRUNE_DAYS`, `OPENAI_API_KEY` (optional, for embeddings)

Example `~/.moltiq/settings.json`:

```json
{
  "port": 37777,
  "databaseUrl": "file:/path/to/moltiq.db",
  "chromaHost": "localhost",
  "chromaPort": 8000,
  "pruneDays": 90
}
```

## Run

**HTTP server (default port 37777):**

```bash
pnpm dev
```

**MCP server (stdio)** – requires the HTTP server to be running for tool calls:

```bash
cd packages/mcp && pnpm build && node dist/run.js
```

Or add to Cursor/Claude MCP config:

```json
{
  "mcpServers": {
    "moltiq": {
      "command": "node",
      "args": ["/absolute/path/to/MoltIQ/packages/mcp/dist/run.js"],
      "env": {
        "MOLTIQ_URL": "http://localhost:37777"
      }
    }
  }
}
```

## Example curl commands

**Health:**

```bash
curl http://localhost:37777/health
```

**Search:**

```bash
curl "http://localhost:37777/api/search?q=architecture&project=my-project&limit=10"
```

**Recall (packed into budget):**

```bash
curl "http://localhost:37777/api/recall?q=decisions&project=my-project&budgetTokens=2000"
```

**Timeline:**

```bash
curl "http://localhost:37777/api/timeline?project=my-project&days=7"
```

**Stats:**

```bash
curl "http://localhost:37777/api/stats?project=my-project"
```

**Export:**

```bash
curl "http://localhost:37777/api/export?format=json&project=my-project"
curl "http://localhost:37777/api/export?format=csv&project=my-project"
curl "http://localhost:37777/api/export?format=md&project=my-project"
```

**Create memory:**

```bash
curl -X POST http://localhost:37777/api/memory \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "<project-id>",
    "type": "FACT",
    "title": "API base URL",
    "content": "We use https://api.example.com for production.",
    "tags": ["api", "config"]
  }'
```

**Update memory:**

```bash
curl -X PATCH http://localhost:37777/api/memory/:id \
  -H "Content-Type: application/json" \
  -d '{"title": "Updated title", "isPinned": true}'
```

**Delete memory:**

```bash
curl -X DELETE http://localhost:37777/api/memory/:id
```

**Ingest event (e.g. SessionStart, PostToolUse, Stop):**

```bash
curl -X POST http://localhost:37777/api/events \
  -H "Content-Type: application/json" \
  -d '{
    "project": "my-project",
    "type": "PostToolUse",
    "payloadJson": "User decided to use Fastify for the API."
  }'
```

## Tests

```bash
pnpm test:core
# or from packages/core
pnpm --filter moltiq-core run test
```

Covers redaction, ranking, context budgeter, and project scoping.

## Project layout

- `apps/server` – Fastify HTTP API + ingestion worker
- `packages/core` – Retrieval engine, ranking, redaction, budgeter, extraction
- `packages/mcp` – MCP server + tool bindings (calls HTTP API)
- `packages/db` – Prisma schema + client
- `packages/vector` – Vector adapter interface + Chroma + embed (stub / OpenAI)

## License

MIT
