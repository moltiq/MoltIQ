import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const SETTINGS_PATH =
  process.env.MOLTIQ_SETTINGS ?? join(process.env.HOME ?? process.env.USERPROFILE ?? "", ".moltiq", "settings.json");

export interface Config {
  port: number;
  databaseUrl: string;
  chromaHost: string;
  chromaPort: number;
  pruneDays: number | null;
  openaiApiKey: string | null;
}

function loadConfig(): Config {
  let overrides: Partial<Config> = {};
  if (existsSync(SETTINGS_PATH)) {
    try {
      overrides = JSON.parse(readFileSync(SETTINGS_PATH, "utf-8")) as Partial<Config>;
    } catch {
      // ignore
    }
  }
  return {
    port: overrides.port ?? Number(process.env.MOLTIQ_PORT ?? process.env.PORT ?? 37777),
    databaseUrl: overrides.databaseUrl ?? process.env.DATABASE_URL ?? "file:./data/moltiq.db",
    chromaHost: overrides.chromaHost ?? process.env.CHROMA_HOST ?? "localhost",
    chromaPort: overrides.chromaPort ?? Number(process.env.CHROMA_PORT ?? 8000),
    pruneDays: overrides.pruneDays ?? (process.env.PRUNE_DAYS ? Number(process.env.PRUNE_DAYS) : null),
    openaiApiKey: overrides.openaiApiKey ?? process.env.OPENAI_API_KEY ?? null,
  };
}

export const config = loadConfig();
