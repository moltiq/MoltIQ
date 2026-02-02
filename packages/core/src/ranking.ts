/**
 * Hybrid ranking: semantic score, keyword match, recency, tag filter, pinned/favorite boost.
 */

export interface RankableMemory {
  id: string;
  projectId: string;
  type: string;
  title: string;
  content: string;
  tagsJson: string | null;
  isFavorite: boolean;
  isPinned: boolean;
  confidence: number | null;
  createdAt: Date;
  semanticScore?: number;
}

export interface RankingOptions {
  query: string;
  projectId?: string;
  tags?: string[];
  recencyBoostDays?: number;
  pinnedBoost?: number;
  favoriteBoost?: number;
  keywordWeight?: number;
  semanticWeight?: number;
}

const DEFAULT_RECENCY_DAYS = 30;
const DEFAULT_PINNED_BOOST = 1.5;
const DEFAULT_FAVORITE_BOOST = 1.2;
const DEFAULT_KEYWORD_WEIGHT = 0.3;
const DEFAULT_SEMANTIC_WEIGHT = 0.7;

function keywordMatchScore(query: string, text: string): number {
  if (!query.trim()) return 0;
  const q = query.toLowerCase().trim();
  const t = (text || "").toLowerCase();
  const terms = q.split(/\s+/).filter(Boolean);
  if (terms.length === 0) return 0;
  let hits = 0;
  for (const term of terms) {
    if (term.length >= 2 && t.includes(term)) hits++;
  }
  return terms.length > 0 ? hits / terms.length : 0;
}

function recencyScore(createdAt: Date, now: Date, decayDays: number): number {
  const ageMs = now.getTime() - new Date(createdAt).getTime();
  const ageDays = ageMs / (24 * 60 * 60 * 1000);
  if (ageDays <= 0) return 1;
  return Math.exp(-ageDays / decayDays);
}

function tagMatchScore(tagsJson: string | null, filterTags: string[]): number {
  if (!filterTags.length) return 1;
  if (!tagsJson) return 0;
  let parsed: string[] = [];
  try {
    parsed = JSON.parse(tagsJson) as string[];
  } catch {
    return 0;
  }
  const set = new Set(parsed.map((t) => t.toLowerCase()));
  const match = filterTags.filter((t) => set.has(t.toLowerCase())).length;
  return filterTags.length > 0 ? match / filterTags.length : 1;
}

export function rankMemories(
  memories: RankableMemory[],
  options: RankingOptions
): RankableMemory[] {
  const {
    query,
    projectId,
    tags = [],
    recencyBoostDays = DEFAULT_RECENCY_DAYS,
    pinnedBoost = DEFAULT_PINNED_BOOST,
    favoriteBoost = DEFAULT_FAVORITE_BOOST,
    keywordWeight = DEFAULT_KEYWORD_WEIGHT,
    semanticWeight = DEFAULT_SEMANTIC_WEIGHT,
  } = options;

  const now = new Date();
  const scored = memories.map((m) => {
    if (projectId && m.projectId !== projectId) return { memory: m, score: -1 };

    const tagScore = tagMatchScore(m.tagsJson, tags);
    if (tagScore === 0) return { memory: m, score: -1 };

    const text = `${m.title} ${m.content}`;
    const kw = keywordMatchScore(query, text);
    const sem = m.semanticScore ?? 0;
    const rec = recencyScore(m.createdAt, now, recencyBoostDays);

    let score = keywordWeight * kw + semanticWeight * sem;
    score *= rec;
    score *= tagScore;
    if (m.isPinned) score *= pinnedBoost;
    if (m.isFavorite) score *= favoriteBoost;
    if (m.confidence != null && m.confidence > 0) score *= 0.5 + 0.5 * m.confidence;

    return { memory: m, score };
  });

  return scored
    .filter((s) => s.score >= 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.memory);
}
