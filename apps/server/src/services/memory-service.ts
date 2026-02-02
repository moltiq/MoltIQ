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

export class MemoryService {
  constructor(private vector: VectorAdapter) {}

  async create(input: CreateMemoryInput) {
    const title = redact(input.title);
    const content = redact(input.content);
    const source = input.source ? redact(input.source) : null;
    const tagsJson = input.tags?.length ? JSON.stringify(input.tags) : null;

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

    const textToEmbed = `${memory.title} ${memory.content}`;
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

    return memory;
  }

  async update(id: string, data: Partial<CreateMemoryInput>) {
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

    return memory;
  }

  async delete(id: string) {
    await this.vector.delete(id).catch(() => {});
    await prisma.memoryEmbedding.deleteMany({ where: { memoryId: id } });
    await prisma.memory.delete({ where: { id } });
    return true;
  }

  async getByIds(ids: string[]) {
    if (ids.length === 0) return [];
    return prisma.memory.findMany({
      where: { id: { in: ids } },
    });
  }
}
