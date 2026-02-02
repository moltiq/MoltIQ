import { describe, it, expect } from "vitest";
import { packIntoBudget, estimateTokens } from "./budgeter.js";

describe("budgeter", () => {
  it("packs items into token budget", () => {
    const items = [
      { id: "1", text: "short", score: 1 },
      { id: "2", text: "also short", score: 0.9 },
      { id: "3", text: "x".repeat(1000), score: 0.8 },
    ];
    const result = packIntoBudget(items, { budgetTokens: 50 });
    expect(result.packed).toContain("short");
    expect(result.packed).toContain("also short");
    expect(result.dropped).toBeGreaterThanOrEqual(1);
    expect(result.used).toBeLessThanOrEqual(50 * 4);
  });

  it("respects budgetChars when no budgetTokens", () => {
    const items = [
      { id: "1", text: "a".repeat(10), score: 1 },
      { id: "2", text: "b".repeat(10), score: 0.9 },
    ];
    const result = packIntoBudget(items, { budgetChars: 15 });
    expect(result.packed.length).toBeLessThanOrEqual(15 + 10);
    expect(result.used).toBeLessThanOrEqual(50);
  });

  it("includes memory ids when includeIds true", () => {
    const items = [{ id: "mem-1", text: "one", score: 1 }];
    const result = packIntoBudget(items, { budgetTokens: 100, includeIds: true });
    expect(result.packed).toContain("[memory:mem-1]");
    expect(result.packed).toContain("one");
  });

  it("estimateTokens approximates by chars", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("a".repeat(40))).toBe(10);
  });
});
