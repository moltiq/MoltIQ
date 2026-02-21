import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const SETTINGS_PATH =
  process.env.MOLTIQ_SETTINGS ?? join(process.env.HOME ?? process.env.USERPROFILE ?? "", ".moltiq", "settings.json");

export interface RedactionPatternConfig {
  pattern: string;
  replacement: string;
  flags?: string;
}

export interface Config {
  port: number;
  databaseUrl: string;
  chromaHost: string;
  chromaPort: number;
  /** If true, server still works when Chroma is down (non-vector routes only). */
  chromaOptional: boolean;
  pruneDays: number | null;
  openaiApiKey: string | null;
  /** Recency decay half-life in days (default 30). */
  recencyHalfLifeDays: number;
  /** Max vector query k (default 100). */
  maxVectorK: number;
  /** Embedding batch size when indexing (default 32). */
  embedBatchSize: number;
  /** Rate limit: max requests per window (0 = disabled). */
  rateLimitMax: number;
  /** Rate limit window in ms (default 60_000). */
  rateLimitWindowMs: number;
  /** Custom redaction patterns from config (pattern string, replacement). */
  redactionPatterns: RedactionPatternConfig[];
  /** Enable audit log for memory create/update/delete. */
  auditLogEnabled: boolean;
  /** Use LLM for extraction when OPENAI_API_KEY set. */
  useLLMExtraction: boolean;
  /** Generate session summary via LLM on Stop event. */
  useLLMSessionSummary: boolean;
  /** Dedup: skip create if similar memory exists (similarity threshold 0..1, 0 = off). */
  dedupSimilarityThreshold: number;
}

function loadConfig(): Config {
  let overrides: Partial<Config> & { redactionPatterns?: RedactionPatternConfig[] } = {};
  if (existsSync(SETTINGS_PATH)) {
    try {
      overrides = JSON.parse(readFileSync(SETTINGS_PATH, "utf-8")) as Partial<Config> & {
        redactionPatterns?: RedactionPatternConfig[];
      };
    } catch {
      // ignore
    }
  }
  return {
    port: overrides.port ?? Number(process.env.MOLTIQ_PORT ?? process.env.PORT ?? 37777),
    databaseUrl: overrides.databaseUrl ?? process.env.DATABASE_URL ?? "file:./data/moltiq.db",
    chromaHost: overrides.chromaHost ?? process.env.CHROMA_HOST ?? "localhost",
    chromaPort: overrides.chromaPort ?? Number(process.env.CHROMA_PORT ?? 8000),
    chromaOptional: overrides.chromaOptional ?? process.env.CHROMA_OPTIONAL === "true",
    pruneDays: overrides.pruneDays ?? (process.env.PRUNE_DAYS ? Number(process.env.PRUNE_DAYS) : null),
    openaiApiKey: overrides.openaiApiKey ?? process.env.OPENAI_API_KEY ?? null,
    recencyHalfLifeDays: overrides.recencyHalfLifeDays ?? Number(process.env.RECENCY_HALF_LIFE_DAYS ?? 30),
    maxVectorK: overrides.maxVectorK ?? Number(process.env.MAX_VECTOR_K ?? 100),
    embedBatchSize: overrides.embedBatchSize ?? Number(process.env.EMBED_BATCH_SIZE ?? 32),
    rateLimitMax: overrides.rateLimitMax ?? Number(process.env.RATE_LIMIT_MAX ?? 0),
    rateLimitWindowMs: overrides.rateLimitWindowMs ?? Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000),
    redactionPatterns: overrides.redactionPatterns ?? [],
    auditLogEnabled: overrides.auditLogEnabled ?? process.env.AUDIT_LOG_ENABLED === "true",
    useLLMExtraction: overrides.useLLMExtraction ?? process.env.USE_LLM_EXTRACTION !== "false",
    useLLMSessionSummary: overrides.useLLMSessionSummary ?? process.env.USE_LLM_SESSION_SUMMARY !== "false",
    dedupSimilarityThreshold: overrides.dedupSimilarityThreshold ?? Number(process.env.DEDUP_SIMILARITY_THRESHOLD ?? 0.92),
  };
}

export const config = loadConfig();
