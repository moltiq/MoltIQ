import { prisma } from "moltiq-db";
import type { VectorAdapter } from "moltiq-vector";

/**
 * Prune old memories. Never prune pinned or favorite.
 */
export async function pruneOldMemories(
  olderThanDays: number,
  vector?: VectorAdapter
): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - olderThanDays);

  const toDelete = await prisma.memory.findMany({
    where: {
      createdAt: { lt: cutoff },
      isPinned: false,
      isFavorite: false,
    },
    include: { embeddings: true },
  });

  for (const m of toDelete) {
    for (const emb of m.embeddings) {
      try {
        await vector?.delete(emb.vectorId);
      } catch {
        // ignore
      }
    }
    await prisma.memoryEmbedding.deleteMany({ where: { memoryId: m.id } });
    await prisma.memory.delete({ where: { id: m.id } });
  }
  return toDelete.length;
}
