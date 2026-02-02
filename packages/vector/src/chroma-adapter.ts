import type { VectorAdapter, VectorMetadata } from "./types.js";
import { getEmbedder } from "./embed.js";

const DEFAULT_COLLECTION = "moltiq_memories";

export interface ChromaAdapterOptions {
  host?: string;
  port?: number;
  collection?: string;
}

export class ChromaAdapter implements VectorAdapter {
  private client: import("chromadb").ChromaClient | null = null;
  private collectionName: string;
  private host: string;
  private port: number;

  constructor(options: ChromaAdapterOptions = {}) {
    this.collectionName = options.collection ?? DEFAULT_COLLECTION;
    this.host = options.host ?? "localhost";
    this.port = options.port ?? 8000;
  }

  private async getClient(): Promise<import("chromadb").ChromaClient> {
    if (this.client) return this.client;
    const { ChromaClient } = await import("chromadb");
    this.client = new ChromaClient({ host: this.host, port: this.port });
    return this.client;
  }

  private metadataToRecord(m?: VectorMetadata): Record<string, string | number | boolean> {
    if (!m) return {};
    const out: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries(m)) {
      if (v !== undefined && v !== null && typeof v !== "object") out[k] = v as string | number | boolean;
    }
    return out;
  }

  private async getCollection() {
    const client = await this.getClient();
    return client.getOrCreateCollection({
      name: this.collectionName,
      metadata: { "hnsw:space": "cosine" },
    });
  }

  async add(id: string, text: string, metadata?: VectorMetadata): Promise<void> {
    const collection = await this.getCollection();
    const embedder = getEmbedder();
    const [vector] = await embedder.embedBatch([text]);
    const meta = this.metadataToRecord(metadata);
    await collection.add({
      ids: [id],
      embeddings: [vector],
      metadatas: [meta],
    });
  }

  async query(
    text: string,
    k: number,
    filter?: Partial<VectorMetadata>
  ): Promise<Array<{ id: string; score: number; metadata?: VectorMetadata }>> {
    const collection = await this.getCollection();
    const embedder = getEmbedder();
    const [vector] = await embedder.embedBatch([text]);
    const where: Record<string, unknown> = {};
    if (filter?.projectId) where.projectId = filter.projectId;
    if (filter?.type) where.type = filter.type;

    const result = await collection.query({
      queryEmbeddings: [vector],
      nResults: k,
      where: Object.keys(where).length ? where : undefined,
    });

    const ids = result.ids[0] ?? [];
    const distances = result.distances?.[0] ?? [];
    const metadatas = result.metadatas?.[0] ?? [];

    return ids.map((id, i) => ({
      id: id as string,
      score: 1 - (distances[i] ?? 0),
      metadata: metadatas[i] as VectorMetadata | undefined,
    }));
  }

  async delete(id: string): Promise<void> {
    const collection = await this.getCollection();
    await collection.delete({ ids: [id] });
  }
}
