import { prisma } from "moltiq-db";
import type { MemoryType } from "moltiq-db";
import type { VectorAdapter } from "moltiq-vector";
import { redact } from "moltiq-core";

export interface CreateMemoryInput {
  projectId: string;
  sessionId?: string;
  type: MemoryType;
  title: string;
  content: string;
  source?: string;
  tags?: string[];
  isFavorite?: boolean;
  isPinned?: boolean;
  confidence?: number;
}

export interface MemoryServiceOptions {
  embedBatchSize?: number;
  dedupSimilarityThreshold?: number;
  auditLogEnabled?: boolean;
}

async function auditLog(
  action: string,
  resource: string,
  resourceId: string,
  projectId: string | null,
  details?: string,
  actor?: string
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: { action, resource, resourceId, projectId, details, actor },
    });
  } catch {
    // ignore audit failures
  }
}

export class MemoryService {
  constructor(
    private vector: VectorAdapter,
    private options: MemoryServiceOptions = {}
  ) {}

  private get auditEnabled(): boolean {
    return this.options.auditLogEnabled ?? false;
  }

  private get dedupThreshold(): number {
    return this.options.dedupSimilarityThreshold ?? 0;
  }

  async create(input: CreateMemoryInput, actor?: string) {
    const title = redact(input.title);
    const content = redact(input.content);
    const source = input.source ? redact(input.source) : null;
    const tagsJson = input.tags?.length ? JSON.stringify(input.tags) : null;

    const textToEmbed = `${title} ${content}`;

    if (this.dedupThreshold > 0) {
      const existing = await this.vector.query(textToEmbed, 1, { projectId: input.projectId });
      if (existing.length > 0 && existing[0].score >= this.dedupThreshold) {
        const dup = await prisma.memory.findUnique({ where: { id: existing[0].id } });
        if (dup) return dup;
      }
    }

    const memory = await prisma.memory.create({
      data: {
        projectId: input.projectId,
        sessionId: input.sessionId ?? null,
        type: input.type,
        title,
        content,
        source,
        tagsJson,
        isFavorite: input.isFavorite ?? false,
        isPinned: input.isPinned ?? false,
        confidence: input.confidence ?? null,
      },
    });

    await this.vector.add(memory.id, textToEmbed, {
      projectId: memory.projectId,
      memoryId: memory.id,
      type: memory.type,
    });

    await prisma.memoryEmbedding.create({
      data: {
        memoryId: memory.id,
        vectorProvider: "chroma",
        vectorId: memory.id,
      },
    });

    if (this.auditEnabled) {
      await auditLog("create", "memory", memory.id, memory.projectId, JSON.stringify({ type: memory.type, title: memory.title }), actor);
    }

    return memory;
  }

  async update(id: string, data: Partial<CreateMemoryInput>, actor?: string) {
    const existing = await prisma.memory.findUnique({ where: { id } });
    if (!existing) return null;

    const title = data.title != null ? redact(data.title) : existing.title;
    const content = data.content != null ? redact(data.content) : existing.content;
    const source = data.source !== undefined ? (data.source ? redact(data.source) : null) : existing.source;
    const tagsJson = data.tags !== undefined ? (data.tags?.length ? JSON.stringify(data.tags) : null) : existing.tagsJson;

    const memory = await prisma.memory.update({
      where: { id },
      data: {
        ...(data.type && { type: data.type }),
        title,
        content,
        source,
        tagsJson,
        ...(data.isFavorite !== undefined && { isFavorite: data.isFavorite }),
        ...(data.isPinned !== undefined && { isPinned: data.isPinned }),
        ...(data.confidence !== undefined && { confidence: data.confidence }),
      },
    });

    await this.vector.delete(memory.id).catch(() => {});
    const textToEmbed = `${memory.title} ${memory.content}`;
    await this.vector.add(memory.id, textToEmbed, {
      projectId: memory.projectId,
      memoryId: memory.id,
      type: memory.type,
    });

    const emb = await prisma.memoryEmbedding.findFirst({ where: { memoryId: id } });
    if (emb) {
      await prisma.memoryEmbedding.updateMany({
        where: { memoryId: id },
        data: { vectorId: memory.id },
      });
    } else {
      await prisma.memoryEmbedding.create({
        data: {
          memoryId: memory.id,
          vectorProvider: "chroma",
          vectorId: memory.id,
        },
      });
    }

    if (this.auditEnabled) {
      await auditLog("update", "memory", memory.id, memory.projectId, undefined, actor);
    }

    return memory;
  }

  async delete(id: string, actor?: string) {
    const existing = await prisma.memory.findUnique({ where: { id } });
    if (!existing) return false;

    await this.vector.delete(id).catch(() => {});
    await prisma.memoryEmbedding.deleteMany({ where: { memoryId: id } });
    await prisma.memory.delete({ where: { id } });

    if (this.auditEnabled) {
      await auditLog("delete", "memory", id, existing.projectId, undefined, actor);
    }
    return true;
  }

  async getByIds(ids: string[]) {
    if (ids.length === 0) return [];
    return prisma.memory.findMany({
      where: { id: { in: ids } },
    });
  }
}
