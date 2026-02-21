import type { FastifyInstance } from "fastify";
import { prisma } from "moltiq-db";
import { RetrievalEngine } from "moltiq-core";
import { exportJson, exportCsv, exportMarkdown } from "../services/export-service.js";
import { MemoryService } from "../services/memory-service.js";
import { ingestEvent, ensureProject } from "../ingestion.js";
import { notFound, badRequest } from "../lib/errors.js";
import type { VectorAdapter } from "moltiq-vector";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export async function apiRoutes(
  app: FastifyInstance,
  deps: {
    vector: VectorAdapter;
    memoryService: MemoryService;
    retrieval: RetrievalEngine;
    config: { recencyHalfLifeDays: number; useLLMExtraction?: boolean; useLLMSessionSummary?: boolean };
  }
) {
  const { vector, memoryService, retrieval, config } = deps;

  app.get("/api/search", async (req, reply) => {
    const q = (req.query as { q?: string }).q ?? "";
    const project = (req.query as { project?: string }).project;
    const tags = (req.query as { tags?: string }).tags?.split(",").filter(Boolean) ?? [];
    const limit = Math.min(Number((req.query as { limit?: string }).limit) || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const offset = Math.max(0, Number((req.query as { offset?: string }).offset) || 0);
    const explain = (req.query as { explain?: string }).explain === "true";

    let projectId: string | undefined;
    if (project) {
      const p = await prisma.project.findFirst({
        where: { OR: [{ id: project }, { name: project }] },
      });
      projectId = p?.id;
    }

    const result = await retrieval.search({
      query: q,
      projectId,
      tags,
      limit: limit + offset,
      recencyBoostDays: config.recencyHalfLifeDays,
      explain,
    });

    const slice = result.memories.slice(offset, offset + limit);
    const explanations = result.explanations?.slice(offset, offset + limit);

    return {
      memories: slice,
      ...(explanations && { explanations }),
      pagination: { limit, offset, total: result.memories.length },
    };
  });

  app.get("/api/recall", async (req, reply) => {
    const q = (req.query as { q?: string }).q ?? "";
    const project = (req.query as { project?: string }).project;
    const budgetTokens = Number((req.query as { budgetTokens?: string }).budgetTokens) || 2000;
    const explain = (req.query as { explain?: string }).explain === "true";

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
      recencyBoostDays: config.recencyHalfLifeDays,
      explain,
    });
    return {
      memories: result.memories,
      packed: result.packed,
      usedChars: result.usedChars,
      dropped: result.dropped,
      ...(result.explanations && { explanations: result.explanations }),
    };
  });

  app.get("/api/timeline", async (req, reply) => {
    const project = (req.query as { project?: string }).project ?? "";
    const days = Number((req.query as { days?: string }).days) || 7;
    const limit = Math.min(Number((req.query as { limit?: string }).limit) || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const offset = Math.max(0, Number((req.query as { offset?: string }).offset) || 0);
    const since = new Date();
    since.setDate(since.getDate() - days);

    const p = await prisma.project.findFirst({
      where: { OR: [{ id: project }, { name: project }] },
    });
    if (!p) return { memories: [], pagination: { limit, offset, total: 0 } };

    const [memories, total] = await Promise.all([
      prisma.memory.findMany({
        where: { projectId: p.id, createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.memory.count({ where: { projectId: p.id, createdAt: { gte: since } } }),
    ]);
    return { memories, pagination: { limit, offset, total } };
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
    if (!p) throw notFound("Project not found", { project });
    const count = await prisma.memory.count({ where: { projectId: p.id } });
    return { projectId: p.id, projectName: p.name, count };
  });

  app.get("/api/export", async (req, reply) => {
    const format = ((req.query as { format?: string }).format ?? "json") as "json" | "csv" | "md";
    const project = (req.query as { project?: string }).project;
    const limit = Math.min(Number((req.query as { limit?: string }).limit) || 1000, MAX_PAGE_SIZE * 10);
    const offset = Math.max(0, Number((req.query as { offset?: string }).offset) || 0);

    let where: { projectId?: string } = {};
    if (project) {
      const p = await prisma.project.findFirst({
        where: { OR: [{ id: project }, { name: project }] },
      });
      if (p) where.projectId = p.id;
    }

    const [memories, total] = await Promise.all([
      prisma.memory.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.memory.count({ where }),
    ]);

    if (format === "json") return { memories, pagination: { limit, offset, total } };
    if (format === "csv") return { export: exportCsv(memories), pagination: { limit, offset, total } };
    if (format === "md") return { export: exportMarkdown(memories), pagination: { limit, offset, total } };
    return { export: exportJson(memories), pagination: { limit, offset, total } };
  });

  // Project CRUD
  app.get("/api/projects", async () => {
    const projects = await prisma.project.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { memories: true } } },
    });
    return { projects: projects.map((p) => ({ id: p.id, name: p.name, createdAt: p.createdAt, memoryCount: p._count.memories })) };
  });

  app.post("/api/projects", async (req, reply) => {
    const body = req.body as { name: string };
    if (!body.name?.trim()) throw badRequest("name is required");
    const existing = await prisma.project.findFirst({ where: { name: body.name.trim() } });
    if (existing) throw badRequest("Project with this name already exists", { projectId: existing.id });
    const project = await prisma.project.create({ data: { name: body.name.trim() } });
    return { project };
  });

  app.get("/api/projects/:id", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const project = await prisma.project.findFirst({
      where: { OR: [{ id }, { name: id }] },
      include: { _count: { select: { memories: true, sessions: true } } },
    });
    if (!project) throw notFound("Project not found", { id });
    return { project: { ...project, memoryCount: project._count.memories, sessionCount: project._count.sessions } };
  });

  app.patch("/api/projects/:id", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const body = req.body as { name?: string };
    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) throw notFound("Project not found", { id });
    if (!body.name?.trim()) throw badRequest("name is required");
    const updated = await prisma.project.update({ where: { id }, data: { name: body.name.trim() } });
    return { project: updated };
  });

  app.delete("/api/projects/:id", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) throw notFound("Project not found", { id });
    await prisma.project.delete({ where: { id } });
    return { deleted: id };
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
    if (!memory) throw notFound("Memory not found", { id });
    return { memory };
  });

  app.delete("/api/memory/:id", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const ok = await memoryService.delete(id);
    if (!ok) throw notFound("Memory not found", { id });
    return { deleted: id };
  });

  app.post("/api/events", async (req, reply) => {
    const body = req.body as
      | {
          sessionId?: string;
          project?: string;
          type: string;
          payload?: string;
          payloadJson?: string;
        }
      | Array<{
          sessionId?: string;
          project?: string;
          type: string;
          payload?: string;
          payloadJson?: string;
        }>;

    const events = Array.isArray(body) ? body : [body];
    const results: Array<{ memoriesCreated: number; sessionId?: string }> = [];

    for (const ev of events) {
      let sessionId = ev.sessionId;
      if (ev.project && !sessionId) {
        const projectId = await ensureProject(ev.project);
        const session = await prisma.session.create({
          data: { projectId, startedAt: new Date() },
        });
        sessionId = session.id;
      }
      if (!sessionId) {
        throw badRequest("sessionId or project required");
      }
      const payloadJson = ev.payloadJson ?? (ev.payload ? JSON.stringify(ev.payload) : "{}");
      const result = await ingestEvent(
        { sessionId, type: ev.type, payloadJson },
        memoryService,
        { useLLMExtraction: config.useLLMExtraction, useLLMSessionSummary: config.useLLMSessionSummary }
      );
      results.push({ ...result, sessionId });
    }

    if (results.length === 1) return results[0];
    return { results };
  });
}
