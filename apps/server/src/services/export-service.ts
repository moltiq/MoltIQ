import type { Memory } from "moltiq-db";

export function exportJson(memories: Memory[]): string {
  return JSON.stringify(
    memories.map((m) => ({
      id: m.id,
      projectId: m.projectId,
      type: m.type,
      title: m.title,
      content: m.content,
      source: m.source,
      tags: m.tagsJson ? (JSON.parse(m.tagsJson) as string[]) : [],
      isFavorite: m.isFavorite,
      isPinned: m.isPinned,
      confidence: m.confidence,
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
    })),
    null,
    2
  );
}

export function exportCsv(memories: Memory[]): string {
  const header = "id,projectId,type,title,content,source,tags,isFavorite,isPinned,confidence,createdAt,updatedAt";
  const escape = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
  const rows = memories.map((m) =>
    [
      m.id,
      m.projectId,
      m.type,
      escape(m.title),
      escape(m.content),
      m.source ? escape(m.source) : "",
      m.tagsJson ? escape(m.tagsJson) : "[]",
      m.isFavorite,
      m.isPinned,
      m.confidence ?? "",
      m.createdAt.toISOString(),
      m.updatedAt.toISOString(),
    ].join(",")
  );
  return [header, ...rows].join("\n");
}

export function exportMarkdown(memories: Memory[]): string {
  const lines: string[] = ["# MoltIQ Memory Export", ""];
  for (const m of memories) {
    lines.push(`## ${m.title}`, "");
    lines.push(`- **ID**: ${m.id}`);
    lines.push(`- **Type**: ${m.type}`);
    lines.push(`- **Project**: ${m.projectId}`);
    if (m.source) lines.push(`- **Source**: ${m.source}`);
    if (m.tagsJson) {
      const tags = JSON.parse(m.tagsJson) as string[];
      lines.push(`- **Tags**: ${tags.join(", ")}`);
    }
    lines.push(`- **Created**: ${m.createdAt.toISOString()}`);
    lines.push("");
    lines.push(m.content);
    lines.push("");
    lines.push("---");
    lines.push("");
  }
  return lines.join("\n");
}
