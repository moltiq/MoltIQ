# MoltIQ Roadmap

**Current state: Beyond MVP.** Many roadmap items are implemented. Remaining gaps are listed below.

---

## What We Have (implemented)

- **REST API**: health, search, recall, timeline, stats, export, CRUD memories, event ingestion, **project CRUD**, **batch events** (array body)
- **MCP server**: `memory.search`, `memory.recall`, `memory.save`, `memory.timeline`, `memory.stats`, `memory.export`
- **SQLite + Prisma** schema, migrations, **AuditLog** table
- **Chroma** adapter + **VectorFallbackAdapter** (optional Chroma: non-vector routes work when Chroma is down)
- **Hybrid ranking** + **recency decay config** (`recencyHalfLifeDays`) + **score explanation** (`?explain=true`)
- **Context budgeter**, **max vector K** config
- **Redaction** + **custom patterns from config** (`~/.moltiq/settings.json` → `redactionPatterns`)
- **LLM extraction** when `OPENAI_API_KEY` set (`useLLMExtraction`) and **LLM session summary** on Stop (`useLLMSessionSummary`)
- **Deduplication** before create (similarity threshold `dedupSimilarityThreshold`)
- **Pruning** (PRUNE_DAYS; never prunes pinned/favorite)
- **Export** (JSON, CSV, Markdown) with **pagination** (limit/offset)
- **Structured errors** (AppError, code, message, statusCode, details)
- **OpenAPI + Swagger UI** at `/docs`
- **Graceful shutdown** (SIGTERM/SIGINT)
- **Structured logging** (pino, pino-pretty in dev)
- **Optional rate limiting** (`rateLimitMax`, `rateLimitWindowMs`)
- **Audit log** (optional, `auditLogEnabled`) for memory create/update/delete
- **Pagination** on search, timeline, export (limit/offset)
- **CI migrations**: `scripts/ci-migrate.sh` / `scripts/ci-migrate.ps1`
- Vitest: redaction, ranking, budgeter, project scoping

---

## Gaps & Next Steps (by area)

### 1. Ingestion & extraction

| Item | Priority | Status |
|------|----------|--------|
| **LLM-powered extraction** | High | Done – `extractMemoryCandidatesWithLLM`, config `useLLMExtraction` |
| **Deduplication** | High | Done – similarity threshold before create (`dedupSimilarityThreshold`) |
| **Session end handling** | Medium | Done – `generateSessionSummaryWithLLM` on Stop, config `useLLMSessionSummary` |
| **Batch ingestion** | Low | Done – `POST /api/events` accepts array of events |

### 2. Retrieval & ranking

| Item | Priority | Status |
|------|----------|--------|
| **Keyword index** | High | Not done – still in-memory keyword match over text; SQLite FTS optional later. |
| **Recency decay tuning** | Medium | Done – `recencyHalfLifeDays` in config / `RECENCY_HALF_LIFE_DAYS` env |
| **Score explanation** | Low | Done – `?explain=true` on search/recall returns `explanations[]` |

### 3. API & developer experience

| Item | Priority | Status |
|------|----------|--------|
| **OpenAPI / Swagger** | High | Done – `/docs` Swagger UI, OpenAPI schema |
| **Structured errors** | High | Done – AppError, code/message/statusCode/details |
| **Pagination** | Medium | Done – limit/offset on search, timeline, export |
| **Project CRUD** | Medium | Done – GET/POST/PATCH/DELETE `/api/projects` and `/api/projects/:id` |
| **Health dependencies** | Medium | Done – `GET /health` returns `dependencies: { db }` |

### 4. Reliability & operations

| Item | Priority | Status |
|------|----------|--------|
| **Graceful shutdown** | High | Done – SIGTERM/SIGINT close Fastify |
| **Chroma fallback** | High | Done – VectorFallbackAdapter, either fail fast with clear error or run in “read-only / no vector” mode so the API still works for non-vector endpoints. |
| **Migrations in CI** | Medium | Done – scripts/ci-migrate.sh and ci-migrate.ps1 |
| **Structured logging** | Medium | Done – pino, pino-pretty in dev |
| **Optional rate limiting** | Low | Done – rateLimitMax, rateLimitWindowMs |

### 5. Scale & performance

| Item | Priority | Status |
|------|----------|--------|
| **Embedding batch size** | Medium | Config `embedBatchSize` (used when we add batch create path). |
| **Vector query limit** | Medium | Done – `maxVectorK` / `MAX_VECTOR_K` |
| **Postgres option** | Low | Not done – SQLite only; Postgres via DATABASE_URL later. |

### 6. Security & compliance

| Item | Priority | Status |
|------|----------|--------|
| **Redaction denylist from config** | Medium | Done – `redactionPatterns` in settings.json, `loadCustomPatterns()` at startup |
| **Audit log** | Low | Done – `AuditLog` table, `auditLogEnabled`, optional `actor` |

---

## Suggested phases

- **Phase 1 (Polish MVP)**  
  LLM extraction path, deduplication, OpenAPI + structured errors, graceful shutdown, Chroma fallback, health with dependencies.

- **Phase 2 (Production-ready)**  
  Keyword/index improvement, pagination, project CRUD, migrations in CI, structured logging, optional rate limiting.

- **Phase 3 (Perfect / advanced)**  
  Batch ingestion, recency tuning, score explanation, Postgres option, redaction from config, audit log.

---

## How to use this

- Open an issue per item (or per phase) and label with `roadmap`.
- Pick a phase and tick off items; update this file when something lands.
- Re-prioritize as needed; “perfect” is a moving target.
