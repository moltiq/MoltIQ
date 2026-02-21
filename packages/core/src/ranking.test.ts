import { describe, it, expect } from "vitest";
import { rankMemories } from "./ranking.js";
import type { RankableMemory } from "./ranking.js";

function mem(overrides: Partial<RankableMemory> & { id: string; projectId: string }): RankableMemory {
  return {
    type: "FACT",
    title: "Title",
    content: "Content",
    tagsJson: null,
    isFavorite: false,
    isPinned: false,
    confidence: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe("ranking", () => {
  it("filters by projectId", () => {
    const memories: RankableMemory[] = [
      mem({ id: "1", projectId: "proj-a", content: "alpha" }),
      mem({ id: "2", projectId: "proj-b", content: "beta" }),
    ];
    const ranked = rankMemories(memories, { query: "alpha", projectId: "proj-a" });
    expect(ranked).toHaveLength(1);
    expect(ranked[0].id).toBe("1");
  });

  it("boosts pinned and favorite", () => {
    const memories: RankableMemory[] = [
      mem({ id: "1", projectId: "p", semanticScore: 0.5, isPinned: false }),
      mem({ id: "2", projectId: "p", semanticScore: 0.5, isPinned: true }),
      mem({ id: "3", projectId: "p", semanticScore: 0.5, isFavorite: true }),
    ];
    const ranked = rankMemories(memories, { query: "q", projectId: "p" });
    expect(ranked.map((m) => m.id)).toContain("2");
    expect(ranked.map((m) => m.id)).toContain("3");
    // Pinned/favorite should be ranked higher (first or second)
    const topIds = ranked.slice(0, 2).map((m) => m.id);
    expect(topIds).toContain("2");
  });

  it("filters by tags when provided", () => {
    const memories: RankableMemory[] = [
      mem({ id: "1", projectId: "p", tagsJson: JSON.stringify(["a", "b"]) }),
      mem({ id: "2", projectId: "p", tagsJson: JSON.stringify(["c"]) }),
    ];
    const ranked = rankMemories(memories, { query: "x", projectId: "p", tags: ["a"] });
    expect(ranked).toHaveLength(1);
    expect(ranked[0].id).toBe("1");
  });

  it("returns empty when no project match", () => {
    const memories: RankableMemory[] = [mem({ id: "1", projectId: "proj-x", content: "yes" })];
    const ranked = rankMemories(memories, { query: "yes", projectId: "proj-y" });
    expect(ranked).toHaveLength(0);
  });
});
