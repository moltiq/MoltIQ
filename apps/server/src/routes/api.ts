import type { FastifyInstance } from "fastify";
import { prisma } from "moltiq-db";
import { RetrievalEngine } from "moltiq-core";
import { exportJson, exportCsv, exportMarkdown } from "../services/export-service.js";
import { MemoryService } from "../services/memory-service.js";
import { ingestEvent, ensureProject } from "../ingestion.js";
import { pruneOldMemories } from "../services/prune.js";
import type { VectorAdapter } from "moltiq-vector";

export async function apiRoutes(
  app: FastifyInstance,
  deps: {
    vector: VectorAdapter;
    memoryService: MemoryService;
    retrieval: RetrievalEngine;
  }
) {
  const { vector, memoryService, retrieval } = deps;

  app.get("/api/search", async (req, reply) => {
    const q = (req.query as { q?: string }).q ?? "";
    const project = (req.query as { project?: string }).project;
    const tags = (req.query as { tags?: string }).tags?.split(",").filter(Boolean) ?? [];
    const limit = Number((req.query as { limit?: string }).limit) || 20;

    let projectId: string | undefined;
    if (project) {
      const p = await prisma.project.findFirst({
        where: { OR: [{ id: project }, { name: project }] },
      });
      projectId = p?.id;
    }

    const memories = await retrieval.search({
      query: q,
      projectId,
      tags,
      limit,
    });
    return { memories };
  });

  app.get("/api/recall", async (req, reply) => {
    const q = (req.query as { q?: string }).q ?? "";
    const project = (req.query as { project?: string }).project;
    const budgetTokens = Number((req.query as { budgetTokens?: string }).budgetTokens) || 2000;

    let projectId: string | undefined;
    if (project) {
      const p = await prisma.project.findFirst({
        where: { OR: [{ id: project }, { name: project }] },
      });
      projectId = p?.id;
    }

    const result = await retrieval.recall({
      query: q,
      projectId,
      budgetTokens,
    });
    return {
      memories: result.memories,
      packed: result.packed,
      usedChars: result.usedChars,
      dropped: result.dropped,
    };
  });

  app.get("/api/timeline", async (req, reply) => {
    const project = (req.query as { project?: string }).project ?? "";
    const days = Number((req.query as { days?: string }).days) || 7;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const p = await prisma.project.findFirst({
      where: { OR: [{ id: project }, { name: project }] },
    });
    if (!p) return { memories: [] };

    const memories = await prisma.memory.findMany({
      where: { projectId: p.id, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
    });
    return { memories };
  });

  app.get("/api/stats", async (req, reply) => {
    const project = (req.query as { project?: string }).project;
    if (!project) {
      const counts = await prisma.memory.groupBy({
        by: ["projectId"],
        _count: { id: true },
      });
      const projects = await prisma.project.findMany({
        where: { id: { in: counts.map((c) => c.projectId) } },
      });
      const byName = Object.fromEntries(projects.map((p) => [p.id, p.name]));
      return {
        byProject: counts.map((c) => ({
          projectId: c.projectId,
          projectName: byName[c.projectId],
          count: c._count.id,
        })),
        total: counts.reduce((s, c) => s + c._count.id, 0),
      };
    }
    const p = await prisma.project.findFirst({
      where: { OR: [{ id: project }, { name: project }] },
    });
    if (!p) return { projectId: project, count: 0 };
    const count = await prisma.memory.count({ where: { projectId: p.id } });
    return { projectId: p.id, projectName: p.name, count };
  });

  app.get("/api/export", async (req, reply) => {
    const format = ((req.query as { format?: string }).format ?? "json") as "json" | "csv" | "md";
    const project = (req.query as { project?: string }).project;

    let where: { projectId?: string } = {};
    if (project) {
      const p = await prisma.project.findFirst({
        where: { OR: [{ id: project }, { name: project }] },
      });
      if (p) where.projectId = p.id;
    }

    const memories = await prisma.memory.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    if (format === "json") return { memories };
    if (format === "csv") return { export: exportCsv(memories) };
    if (format === "md") return { export: exportMarkdown(memories) };
    return { export: exportJson(memories) };
  });

  app.post("/api/memory", async (req, reply) => {
    const body = req.body as {
      projectId: string;
      sessionId?: string;
      type: string;
      title: string;
      content: string;
      source?: string;
      tags?: string[];
      isFavorite?: boolean;
      isPinned?: boolean;
      confidence?: number;
    };
    const memory = await memoryService.create({
      projectId: body.projectId,
      sessionId: body.sessionId,
      type: body.type as "FACT" | "DECISION" | "SNIPPET" | "TASK" | "SUMMARY",
      title: body.title,
      content: body.content,
      source: body.source,
      tags: body.tags,
      isFavorite: body.isFavorite,
      isPinned: body.isPinned,
      confidence: body.confidence,
    });
    return { memory };
  });

  app.patch("/api/memory/:id", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const body = req.body as Partial<{
      type: string;
      title: string;
      content: string;
      source: string;
      tags: string[];
      isFavorite: boolean;
      isPinned: boolean;
      confidence: number;
    }>;
    const memory = await memoryService.update(id, {
      ...body,
      type: body.type as "FACT" | "DECISION" | "SNIPPET" | "TASK" | "SUMMARY" | undefined,
    });
    if (!memory) return reply.status(404).send({ error: "Memory not found" });
    return { memory };
  });

  app.delete("/api/memory/:id", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    await memoryService.delete(id);
    return { deleted: id };
  });

  app.post("/api/events", async (req, reply) => {
    const body = req.body as {
      sessionId: string;
      project?: string;
      type: string;
      payload?: string;
      payloadJson?: string;
    };
    let sessionId = body.sessionId;
    if (body.project && !sessionId) {
      const projectId = await ensureProject(body.project);
      const session = await prisma.session.create({
        data: { projectId, startedAt: new Date() },
      });
      sessionId = session.id;
    }
    if (!sessionId) {
      return reply.status(400).send({ error: "sessionId or project required" });
    }
    const payloadJson = body.payloadJson ?? (body.payload ? JSON.stringify(body.payload) : "{}");
    const result = await ingestEvent(
      { sessionId, type: body.type, payloadJson },
      memoryService
    );
    return { ...result, sessionId };
  });
}
