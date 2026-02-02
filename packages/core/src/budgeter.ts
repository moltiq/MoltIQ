/**
 * Packs best memories into a token or character budget for context.
 */

export interface BudgetItem {
  id: string;
  text: string;
  score: number;
  meta?: Record<string, unknown>;
}

export interface BudgeterOptions {
  /** Max tokens (approx 4 chars per token if not provided). */
  budgetTokens?: number;
  /** Max characters (used if budgetTokens not set). */
  budgetChars?: number;
  /** Separator between items. */
  separator?: string;
  /** Include item headers (e.g. "[memory:id]"). */
  includeIds?: boolean;
}

const DEFAULT_SEP = "\n\n";
const CHARS_PER_TOKEN = 4;

export function packIntoBudget(
  items: BudgetItem[],
  options: BudgeterOptions
): { packed: string; used: number; dropped: number } {
  const {
    budgetTokens,
    budgetChars,
    separator = DEFAULT_SEP,
    includeIds = true,
  } = options;

  const budget = budgetTokens != null
    ? budgetTokens * CHARS_PER_TOKEN
    : budgetChars ?? 8000;

  let used = 0;
  const parts: string[] = [];

  for (const item of items) {
    const prefix = includeIds ? `[memory:${item.id}]\n` : "";
    const line = prefix + item.text;
    const need = line.length + (parts.length ? separator.length : 0);
    if (used + need <= budget) {
      parts.push(line);
      used += need;
    } else {
      break;
    }
  }

  const packed = parts.join(separator);
  const dropped = items.length - parts.length;
  return { packed, used, dropped };
}

export function estimateTokens(text: string): number {
  return Math.ceil((text?.length ?? 0) / CHARS_PER_TOKEN);
}
