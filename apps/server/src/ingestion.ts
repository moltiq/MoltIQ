import { prisma } from "moltiq-db";
import {
  extractMemoryCandidates,
  extractSummaryFromStop,
  type MemoryCandidate,
} from "moltiq-core";
import type { MemoryService } from "./services/memory-service.js";
import type { MemoryType } from "moltiq-db";

export interface IngestEventInput {
  sessionId: string;
  type: string;
  payloadJson: string;
}

export async function ensureProject(name: string): Promise<string> {
  let project = await prisma.project.findFirst({ where: { name } });
  if (!project) {
    project = await prisma.project.create({ data: { name } });
  }
  return project.id;
}

export async function ingestEvent(
  input: IngestEventInput,
  memoryService: MemoryService
): Promise<{ memoriesCreated: number }> {
  const event = await prisma.event.create({
    data: {
      sessionId: input.sessionId,
      type: input.type,
      payloadJson: input.payloadJson,
    },
  });

  const session = await prisma.session.findUnique({
    where: { id: input.sessionId },
    include: { project: true },
  });
  if (!session) return { memoriesCreated: 0 };

  const projectId = session.projectId;
  let candidates: MemoryCandidate[] = [];

  if (input.type === "SessionStart") {
    // Optional: extract from payload if it contains context
    candidates = extractMemoryCandidates(input.payloadJson);
  } else if (input.type === "PostToolUse") {
    candidates = extractMemoryCandidates(input.payloadJson);
  } else if (input.type === "Stop") {
    const summary = extractSummaryFromStop(input.payloadJson);
    if (summary) candidates = [summary];
  }

  let created = 0;
  for (const c of candidates) {
    try {
      await memoryService.create({
        projectId,
        sessionId: input.sessionId,
        type: c.type as MemoryType,
        title: c.title,
        content: c.content,
        source: c.source,
        tags: c.tags,
        confidence: c.confidence ?? undefined,
      });
      created++;
    } catch {
      // skip duplicate or invalid
    }
  }
  return { memoriesCreated: created };
}
