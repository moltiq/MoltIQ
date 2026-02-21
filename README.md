# MoltIQ

Local-first long-term intelligence and memory layer for AI agents. MoltIQ provides a REST API and an MCP server so agents can store, search, recall, and export memories with project scoping and hybrid ranking.

**Status: MVP.** For gaps and a phased roadmap to production-ready and beyond, see [ROADMAP.md](./ROADMAP.md).

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
- **Env**: See `.env.example` and below.

Key options:

| Option | Env | Default | Description |
|--------|-----|---------|-------------|
| port | MOLTIQ_PORT | 37777 | HTTP port |
| databaseUrl | DATABASE_URL | file:./data/moltiq.db | Prisma DB URL |
| chromaHost / chromaPort | CHROMA_HOST, CHROMA_PORT | localhost:8000 | Chroma server |
| chromaOptional | CHROMA_OPTIONAL | false | If true, API works without Chroma (non-vector routes only) |
| pruneDays | PRUNE_DAYS | - | Prune memories older than N days (never prunes pinned/favorite) |
| openaiApiKey | OPENAI_API_KEY | - | Optional; enables LLM extraction and session summary |
| recencyHalfLifeDays | RECENCY_HALF_LIFE_DAYS | 30 | Recency decay for ranking |
| maxVectorK | MAX_VECTOR_K | 100 | Max vector search results |
| rateLimitMax | RATE_LIMIT_MAX | 0 | Rate limit (0 = off) |
| auditLogEnabled | AUDIT_LOG_ENABLED | false | Log memory create/update/delete to AuditLog |
| useLLMExtraction | USE_LLM_EXTRACTION | true | Use LLM for extraction when OPENAI_API_KEY set |
| useLLMSessionSummary | USE_LLM_SESSION_SUMMARY | true | Generate session summary via LLM on Stop event |
| dedupSimilarityThreshold | DEDUP_SIMILARITY_THRESHOLD | 0.92 | Skip create if similar memory exists (0 = off) |
| redactionPatterns | (in settings.json) | [] | Custom redaction patterns: `[{ "pattern": "regex", "replacement": "..." }]` |

Example `~/.moltiq/settings.json`:

```json
{
  "port": 37777,
  "databaseUrl": "file:/path/to/moltiq.db",
  "chromaHost": "localhost",
  "chromaPort": 8000,
  "chromaOptional": false,
  "pruneDays": 90,
  "recencyHalfLifeDays": 30,
  "auditLogEnabled": true,
  "redactionPatterns": []
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

**Health** (includes DB status):

```bash
curl http://localhost:37777/health
```

**API docs** (Swagger UI):

```
http://localhost:37777/docs
```

**Project CRUD:**

```bash
curl http://localhost:37777/api/projects
curl -X POST http://localhost:37777/api/projects -H "Content-Type: application/json" -d '{"name":"my-project"}'
curl http://localhost:37777/api/projects/:id
curl -X PATCH http://localhost:37777/api/projects/:id -H "Content-Type: application/json" -d '{"name":"new-name"}'
curl -X DELETE http://localhost:37777/api/projects/:id
```

**Search** (pagination: `limit`, `offset`; `explain=true` for score breakdown):

```bash
curl "http://localhost:37777/api/search?q=architecture&project=my-project&limit=10&offset=0&explain=true"
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

**Ingest event** (or **batch**: send an array of events):

```bash
curl -X POST http://localhost:37777/api/events \
  -H "Content-Type: application/json" \
  -d '{
    "project": "my-project",
    "type": "PostToolUse",
    "payloadJson": "User decided to use Fastify for the API."
  }'
```

## Deploy (live API + Swagger)

To run the API in production and share the Swagger docs (e.g. on X): use the root **Dockerfile** and set `DATABASE_URL`, `CHROMA_OPTIONAL=true`, and `PORT` (if your host sets it). See **[DEPLOY.md](./DEPLOY.md)** for Railway, Render, Fly.io, and a “share on X” checklist.

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
