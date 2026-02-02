/**
 * Retrieval engine: vector search + hybrid ranking + context budgeter.
 */

import type { VectorAdapter, VectorMetadata } from "moltiq-vector";
import type { Memory } from "moltiq-db";
import { rankMemories, type RankableMemory, type RankingOptions } from "./ranking.js";
import { packIntoBudget, type BudgetItem } from "./budgeter.js";

export interface RetrievalOptions {
  query: string;
  projectId?: string;
  tags?: string[];
  limit?: number;
  budgetTokens?: number;
  budgetChars?: number;
  recencyBoostDays?: number;
}

export interface RecallResult {
  memories: Memory[];
  packed: string;
  usedChars: number;
  dropped: number;
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
    private fetchMemoriesByIds: (ids: string[]) => Promise<Memory[]>
  ) {}

  async search(
    options: RetrievalOptions
  ): Promise<Memory[]> {
    const {
      query,
      projectId,
      tags = [],
      limit = 20,
      recencyBoostDays,
    } = options;

    const filter: Partial<VectorMetadata> = {};
    if (projectId) filter.projectId = projectId;

    const k = Math.min(limit * 2, 100);
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
    const ranked = rankMemories(rankable, rankOpts);
    return ranked.slice(0, limit);
  }

  async recall(options: RetrievalOptions & { budgetTokens: number }): Promise<RecallResult> {
    const memories = await this.search(options);
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
    };
  }
}
