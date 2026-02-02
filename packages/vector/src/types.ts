export interface VectorMetadata {
  projectId?: string;
  memoryId?: string;
  type?: string;
  [key: string]: string | number | boolean | undefined;
}

export interface VectorAdapter {
  add(id: string, text: string, metadata?: VectorMetadata): Promise<void>;
  query(text: string, k: number, filter?: Partial<VectorMetadata>): Promise<Array<{ id: string; score: number; metadata?: VectorMetadata }>>;
  delete(id: string): Promise<void>;
}

export interface Embedder {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  dimensions: number;
}
