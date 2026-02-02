/**
 * Extract memory candidates from events using regex/heuristics.
 * Optional LLM-powered extraction when OPENAI_API_KEY is set.
 */

import { redact } from "./redaction.js";

export type MemoryType = "FACT" | "DECISION" | "SNIPPET" | "TASK" | "SUMMARY";

export interface MemoryCandidate {
  type: MemoryType;
  title: string;
  content: string;
  source?: string;
  tags: string[];
  confidence?: number;
}

const FACT_PATTERNS = [
  /(?:we use|we have|it (?:is|uses)|the (?:system|app) (?:uses|has)|configured to)\s+([^.!?\n]+[.!])/gi,
  /(?:note:|remember:|important:)\s*([^\n]+)/gi,
];

const DECISION_PATTERNS = [
  /(?:chose|decided to|we (?:will )?use|going with)\s+([^.!?\n]+)/gi,
  /(?:architecture|design) (?:decision|choice):\s*([^\n]+)/gi,
];

const TASK_PATTERNS = [
  /(?:TODO|FIXME|XXX):\s*([^\n]+)/gi,
  /(?:-\s*\[ \]|^\s*\*\s*\[ \])\s*([^\n]+)/gm,
  /(?:task|need to|must)\s*:?\s*([^\n.]+)/gi,
];

const SNIPPET_PATTERNS = [
  /```[\s\S]*?```/g,
  /(?:const|let|var|function|class|import|export)\s+[\s\S]{10,200}/g,
];

function extractByPatterns(
  text: string,
  patterns: RegExp[],
  type: MemoryType,
  minLen = 10
): MemoryCandidate[] {
  const out: MemoryCandidate[] = [];
  const seen = new Set<string>();
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    const copy = new RegExp(re.source, re.flags);
    while ((m = copy.exec(text)) !== null) {
      const content = (m[1] ?? m[0]).trim();
      if (content.length >= minLen && !seen.has(content)) {
        seen.add(content);
        out.push({
          type,
          title: content.slice(0, 80),
          content: redact(content),
          source: "heuristic",
          tags: [],
          confidence: 0.6,
        });
      }
    }
  }
  return out;
}

export function extractMemoryCandidates(payload: string): MemoryCandidate[] {
  const raw = payload;
  const candidates: MemoryCandidate[] = [];

  candidates.push(...extractByPatterns(raw, FACT_PATTERNS, "FACT"));
  candidates.push(...extractByPatterns(raw, DECISION_PATTERNS, "DECISION"));
  candidates.push(...extractByPatterns(raw, TASK_PATTERNS, "TASK"));

  const snippetMatches = raw.match(SNIPPET_PATTERNS[0]) ?? [];
  for (const block of snippetMatches) {
    const content = redact(block.slice(0, 500));
    if (content.length >= 20) {
      candidates.push({
        type: "SNIPPET",
        title: "Code snippet",
        content,
        source: "heuristic",
        tags: ["code"],
        confidence: 0.7,
      });
    }
  }

  return candidates;
}

export function extractSummaryFromStop(payload: string): MemoryCandidate | null {
  const trimmed = payload.trim();
  if (trimmed.length < 30) return null;
  return {
    type: "SUMMARY",
    title: "Session summary",
    content: redact(trimmed.slice(0, 2000)),
    source: "SessionStop",
    tags: ["summary"],
    confidence: 0.8,
  };
}
