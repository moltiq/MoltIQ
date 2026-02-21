/**
 * LLM-powered extraction of memory candidates and session summaries.
 * Used when OPENAI_API_KEY is set and useLLMExtraction / useLLMSessionSummary are enabled.
 */

import { redact } from "./redaction.js";
import type { MemoryCandidate } from "./extraction.js";
import type { MemoryType } from "./extraction.js";

const EXTRACT_SYSTEM = `You extract structured "memories" from raw text. For each distinct memory, output a JSON object with: type (one of FACT, DECISION, SNIPPET, TASK, SUMMARY), title (short), content (the extracted text), tags (array of lowercase tags, optional). Output a JSON array of such objects. If nothing worth remembering, output []. No markdown, only valid JSON array.`;

const SUMMARY_SYSTEM = `You write a brief session summary (2-4 sentences) capturing key decisions, facts, and outcomes. Output only the summary text, no JSON.`;

function getApiKey(): string | null {
  return process.env.OPENAI_API_KEY ?? null;
}

async function chat(
  system: string,
  user: string,
  model: string = "gpt-4o-mini"
): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.2,
      max_tokens: 2000,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API ${res.status}: ${err}`);
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content?.trim() ?? "";
  return content;
}

/** Extract memory candidates using LLM. Returns empty array on error or invalid JSON. */
export async function extractMemoryCandidatesWithLLM(payload: string): Promise<MemoryCandidate[]> {
  if (!payload?.trim() || payload.length > 30000) return [];

  const raw = payload.slice(0, 15000);
  const out = await chat(EXTRACT_SYSTEM, `Extract memories from:\n\n${raw}`);

  try {
    const parsed = JSON.parse(out) as Array<{
      type?: string;
      title?: string;
      content?: string;
      tags?: string[];
    }>;
    if (!Array.isArray(parsed)) return [];

    const validTypes: MemoryType[] = ["FACT", "DECISION", "SNIPPET", "TASK", "SUMMARY"];
    const candidates: MemoryCandidate[] = [];

    for (const item of parsed) {
      const type = item.type && validTypes.includes(item.type as MemoryType) ? (item.type as MemoryType) : "FACT";
      const title = typeof item.title === "string" ? item.title : (item.content ?? "").slice(0, 80);
      const content = typeof item.content === "string" ? item.content : "";
      if (content.length < 5) continue;

      candidates.push({
        type,
        title: redact(title),
        content: redact(content.slice(0, 2000)),
        source: "llm",
        tags: Array.isArray(item.tags) ? item.tags.map((t) => String(t).toLowerCase()) : [],
        confidence: 0.85,
      });
    }
    return candidates;
  } catch {
    return [];
  }
}

/** Generate a session summary using LLM. Returns null on error or empty. */
export async function generateSessionSummaryWithLLM(payload: string): Promise<MemoryCandidate | null> {
  if (!payload?.trim() || payload.length > 20000) return null;

  const text = payload.slice(0, 10000);
  const summary = await chat(SUMMARY_SYSTEM, `Summarize this session:\n\n${text}`);

  const trimmed = summary.trim();
  if (trimmed.length < 20) return null;

  return {
    type: "SUMMARY",
    title: "Session summary",
    content: redact(trimmed.slice(0, 2000)),
    source: "SessionStop",
    tags: ["summary"],
    confidence: 0.85,
  };
}
