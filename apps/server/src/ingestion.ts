import { prisma } from "moltiq-db";
import {
  extractMemoryCandidates,
  extractSummaryFromStop,
  extractMemoryCandidatesWithLLM,
  generateSessionSummaryWithLLM,
  type MemoryCandidate,
} from "moltiq-core";
import type { MemoryService } from "./services/memory-service.js";
import type { MemoryType } from "moltiq-db";

export interface IngestEventInput {
  sessionId: string;
  type: string;
  payloadJson: string;
}

export interface IngestOptions {
  useLLMExtraction?: boolean;
  useLLMSessionSummary?: boolean;
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
  memoryService: MemoryService,
  options: IngestOptions = {}
): Promise<{ memoriesCreated: number }> {
  const { useLLMExtraction = false, useLLMSessionSummary = false } = options;

  await prisma.event.create({
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
    if (useLLMExtraction && process.env.OPENAI_API_KEY) {
      try {
        candidates = await extractMemoryCandidatesWithLLM(input.payloadJson);
      } catch {
        candidates = extractMemoryCandidates(input.payloadJson);
      }
    } else {
      candidates = extractMemoryCandidates(input.payloadJson);
    }
  } else if (input.type === "PostToolUse") {
    if (useLLMExtraction && process.env.OPENAI_API_KEY) {
      try {
        candidates = await extractMemoryCandidatesWithLLM(input.payloadJson);
      } catch {
        candidates = extractMemoryCandidates(input.payloadJson);
      }
    } else {
      candidates = extractMemoryCandidates(input.payloadJson);
    }
  } else if (input.type === "Stop") {
    if (useLLMSessionSummary && process.env.OPENAI_API_KEY) {
      try {
        const summary = await generateSessionSummaryWithLLM(input.payloadJson);
        if (summary) candidates = [summary];
        else {
          const fallback = extractSummaryFromStop(input.payloadJson);
          if (fallback) candidates = [fallback];
        }
      } catch {
        const fallback = extractSummaryFromStop(input.payloadJson);
        if (fallback) candidates = [fallback];
      }
    } else {
      const summary = extractSummaryFromStop(input.payloadJson);
      if (summary) candidates = [summary];
    }
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
