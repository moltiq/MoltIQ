import type { VectorAdapter, VectorMetadata } from "moltiq-vector";

/**
 * Wraps a vector adapter and catches errors. When chromaOptional is true,
 * failed vector ops return empty results so non-vector routes still work.
 */
export class VectorFallbackAdapter implements VectorAdapter {
  private failed = false;

  constructor(
    private inner: VectorAdapter,
    private optional: boolean
  ) {}

  async add(id: string, text: string, metadata?: VectorMetadata): Promise<void> {
    try {
      await this.inner.add(id, text, metadata);
    } catch (err) {
      this.failed = true;
      if (!this.optional) throw err;
      // optional: skip indexing
    }
  }

  async query(
    text: string,
    k: number,
    filter?: Partial<VectorMetadata>
  ): Promise<Array<{ id: string; score: number; metadata?: VectorMetadata }>> {
    try {
      return await this.inner.query(text, k, filter);
    } catch (err) {
      this.failed = true;
      if (!this.optional) throw err;
      return [];
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.inner.delete(id);
    } catch (err) {
      this.failed = true;
      if (!this.optional) throw err;
    }
  }

  isHealthy(): boolean {
    return !this.failed;
  }
}
