import { describe, it, expect } from "vitest";
import { rankMemories } from "./ranking.js";
import type { RankableMemory } from "./ranking.js";

/**
 * Project scoping: ranking must respect projectId so results are isolated per project.
 */
function mem(overrides: Partial<RankableMemory> & { id: string; projectId: string }): RankableMemory {
  return {
    type: "FACT",
    title: "T",
    content: "C",
    tagsJson: null,
    isFavorite: false,
    isPinned: false,
    confidence: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe("project scoping", () => {
  it("returns only memories for the given project", () => {
    const memories: RankableMemory[] = [
      mem({ id: "a1", projectId: "project-a", content: "query match", semanticScore: 0.9 }),
      mem({ id: "b1", projectId: "project-b", content: "query match", semanticScore: 0.9 }),
      mem({ id: "a2", projectId: "project-a", content: "query match", semanticScore: 0.8 }),
    ];
    const ranked = rankMemories(memories, { query: "query", projectId: "project-a" });
    expect(ranked).toHaveLength(2);
    expect(ranked.every((m) => m.projectId === "project-a")).toBe(true);
    expect(ranked.map((m) => m.id)).toEqual(expect.arrayContaining(["a1", "a2"]));
  });

  it("when no projectId filter, all projects included", () => {
    const memories: RankableMemory[] = [
      mem({ id: "1", projectId: "p1", semanticScore: 0.5 }),
      mem({ id: "2", projectId: "p2", semanticScore: 0.5 }),
    ];
    const ranked = rankMemories(memories, { query: "q" });
    expect(ranked).toHaveLength(2);
  });
});
