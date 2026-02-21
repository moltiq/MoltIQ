/**
 * Retrieval engine: vector search + hybrid ranking + context budgeter.
 */

import type { VectorAdapter, VectorMetadata } from "moltiq-vector";
import type { Memory } from "moltiq-db";
import { rankMemories, rankMemoriesWithExplain, type RankableMemory, type RankingOptions, type ScoreExplanation } from "./ranking.js";
import { packIntoBudget, type BudgetItem } from "./budgeter.js";

export interface RetrievalOptions {
  query: string;
  projectId?: string;
  tags?: string[];
  limit?: number;
  budgetTokens?: number;
  budgetChars?: number;
  recencyBoostDays?: number;
  /** Include per-memory score breakdown. */
  explain?: boolean;
  /** Cap for vector query k (default from config). */
  maxK?: number;
}

export interface RecallResult {
  memories: Memory[];
  packed: string;
  usedChars: number;
  dropped: number;
  explanations?: ScoreExplanation[];
}

export interface SearchResult {
  memories: Memory[];
  explanations?: ScoreExplanation[];
}

function memoryToRankable(m: Memory, semanticScore?: number): RankableMemory {
  return {
    id: m.id,
    projectId: m.projectId,
    type: m.type,
    title: m.title,
    content: m.content,
    tagsJson: m.tagsJson,
    isFavorite: m.isFavorite,
    isPinned: m.isPinned,
    confidence: m.confidence,
    createdAt: m.createdAt,
    semanticScore,
  };
}

export class RetrievalEngine {
  constructor(
    private vector: VectorAdapter,
    private fetchMemoriesByIds: (ids: string[]) => Promise<Memory[]>,
    private defaultMaxK: number = 100
  ) {}

  async search(options: RetrievalOptions): Promise<SearchResult> {
    const {
      query,
      projectId,
      tags = [],
      limit = 20,
      recencyBoostDays,
      explain = false,
      maxK = this.defaultMaxK,
    } = options;

    const filter: Partial<VectorMetadata> = {};
    if (projectId) filter.projectId = projectId;

    const k = Math.min(limit * 2, maxK);
    const vectorResults = await this.vector.query(query, k, filter);
    const ids = vectorResults.map((r) => r.id);
    const scoreMap = new Map(vectorResults.map((r) => [r.id, r.score]));

    const memories = await this.fetchMemoriesByIds(ids);
    const rankable: RankableMemory[] = memories.map((m) =>
      memoryToRankable(m, scoreMap.get(m.id))
    );

    const rankOpts: RankingOptions = {
      query,
      projectId,
      tags,
      recencyBoostDays,
    };

    const memoryById = new Map(memories.map((m) => [m.id, m]));

    if (explain) {
      const { ranked, explanations } = rankMemoriesWithExplain(rankable, rankOpts);
      const slice = ranked.slice(0, limit);
      const explSlice = explanations.slice(0, limit);
      const ordered = slice.map((r) => memoryById.get(r.id)!).filter(Boolean);
      return { memories: ordered, explanations: explSlice };
    }

    const ranked = rankMemories(rankable, rankOpts);
    const ordered = ranked.slice(0, limit).map((r) => memoryById.get(r.id)!).filter(Boolean);
    return { memories: ordered };
  }

  async recall(options: RetrievalOptions & { budgetTokens: number }): Promise<RecallResult> {
    const searchResult = await this.search(options);
    const memories = searchResult.memories;
    const budgetTokens = options.budgetTokens ?? 2000;
    const budgetItems: BudgetItem[] = memories.map((m) => ({
      id: m.id,
      text: `${m.title}\n${m.content}`,
      score: 0,
      meta: { type: m.type },
    }));

    const { packed, used, dropped } = packIntoBudget(budgetItems, {
      budgetTokens,
      separator: "\n\n",
      includeIds: true,
    });

    return {
      memories,
      packed,
      usedChars: used,
      dropped,
      ...(searchResult.explanations && { explanations: searchResult.explanations }),
    };
  }
}
