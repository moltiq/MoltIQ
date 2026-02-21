import type { VectorAdapter, VectorMetadata } from "./types.js";
import { getEmbedder } from "./embed.js";

const DEFAULT_COLLECTION = "moltiq_memories";

export interface ChromaAdapterOptions {
  host?: string;
  port?: number;
  collection?: string;
}

// ChromaClient types can vary by chromadb version; use minimal interface to avoid type conflicts
interface ChromaClientLike {
  getOrCreateCollection(opts: { name: string; metadata?: Record<string, string> }): Promise<{
    add(opts: { ids: string[]; embeddings: number[][]; metadatas?: Record<string, string | number | boolean>[] }): Promise<void>;
    query(opts: { queryEmbeddings: number[][]; nResults: number; where?: Record<string, unknown> }): Promise<{ ids: string[][]; distances?: number[][]; metadatas?: Record<string, unknown>[][] }>;
    delete(opts: { ids: string[] }): Promise<void>;
  }>;
}

export class ChromaAdapter implements VectorAdapter {
  private client: ChromaClientLike | null = null;
  private collectionName: string;
  private host: string;
  private port: number;

  constructor(options: ChromaAdapterOptions = {}) {
    this.collectionName = options.collection ?? DEFAULT_COLLECTION;
    this.host = options.host ?? "localhost";
    this.port = options.port ?? 8000;
  }

  private async getClient(): Promise<ChromaClientLike> {
    if (this.client) return this.client;
    const chroma = await import("chromadb");
    const ChromaClient = (chroma as { ChromaClient?: new (opts: Record<string, unknown>) => ChromaClientLike }).ChromaClient;
    if (!ChromaClient) throw new Error("ChromaClient not found in chromadb");
    this.client = new ChromaClient({ host: this.host, port: this.port } as Record<string, unknown>);
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
