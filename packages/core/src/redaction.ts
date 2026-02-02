/**
 * Redacts secrets and sensitive patterns from text.
 * Configurable denylist; never store or inject secrets.
 */

type Replacement = string | ((match: string) => string);

const DEFAULT_PATTERNS: Array<{ pattern: RegExp; replacement: Replacement }> = [
  { pattern: /\b(?:sk|pk)_[a-zA-Z0-9_-]{20,}\b/g, replacement: "[REDACTED_KEY]" },
  { pattern: /\b(?:Bearer|bearer)\s+[a-zA-Z0-9_.-]{20,}\b/gi, replacement: "Bearer [REDACTED]" },
  { pattern: /\b(?:api[_-]?key|apikey)\s*[:=]\s*["']?[a-zA-Z0-9_-]{20,}["']?/gi, replacement: "api_key=[REDACTED]" },
  { pattern: /\b(?:private[_-]?key|privatekey)\s*[:=]\s*["']?(?:-----BEGIN[^-]*-----)[\s\S]*?(?:-----END[^-]*-----)["']?/gi, replacement: "private_key=[REDACTED]" },
  { pattern: /\b(?:0x)[a-fA-F0-9]{64}\b/g, replacement: "[REDACTED_WALLET]" },
  { pattern: /\b(?:-----BEGIN [A-Z ]+-----)[\s\S]*?(?:-----END [A-Z ]+-----)\b/g, replacement: "[REDACTED_PEM]" },
  { pattern: /\b[A-Za-z0-9+/]{40,}={0,2}\b/g, replacement: (m) => (m.length > 80 ? "[REDACTED_BLOB]" : m) },
];

let customPatterns: Array<{ pattern: RegExp; replacement: Replacement }> = [];

export function setRedactionDenylist(patterns: Array<{ pattern: RegExp; replacement: Replacement }>): void {
  customPatterns = patterns;
}

export function getRedactionPatterns(): Array<{ pattern: RegExp; replacement: Replacement }> {
  return [...DEFAULT_PATTERNS, ...customPatterns];
}

export function redact(text: string): string {
  if (!text || typeof text !== "string") return text;
  let out = text;
  for (const { pattern, replacement } of getRedactionPatterns()) {
    out = out.replace(pattern, (match) =>
      typeof replacement === "function" ? replacement(match) : replacement
    );
  }
  return out;
}

export function redactObject<T extends Record<string, unknown>>(obj: T): T {
  const out = { ...obj };
  for (const key of Object.keys(out)) {
    if (typeof out[key] === "string") {
      (out as Record<string, unknown>)[key] = redact(out[key] as string);
    } else if (out[key] !== null && typeof out[key] === "object" && !Array.isArray(out[key])) {
      (out as Record<string, unknown>)[key] = redactObject(out[key] as Record<string, unknown>);
    } else if (Array.isArray(out[key])) {
      (out as Record<string, unknown>)[key] = (out[key] as unknown[]).map((v) =>
        typeof v === "string" ? redact(v) : v && typeof v === "object" ? redactObject(v as Record<string, unknown>) : v
      );
    }
  }
  return out;
}
