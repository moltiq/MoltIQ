import type { Embedder } from "./types.js";

/** Deterministic stub embeddings for tests (hash-based, fixed dims). */
function stubEmbed(text: string, dims: number): number[] {
  const out: number[] = [];
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = (h * 31 + text.charCodeAt(i)) >>> 0;
  }
  for (let i = 0; i < dims; i++) {
    const x = (h * (i + 1) + i * 17) >>> 0;
    out.push((x % 1000) / 1000 - 0.5);
  }
  return out;
}

const STUB_DIMENSIONS = 384;

export class StubEmbedder implements Embedder {
  readonly dimensions = STUB_DIMENSIONS;

  async embed(text: string): Promise<number[]> {
    return stubEmbed(text, this.dimensions);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((t) => this.embed(t)));
  }
}

let defaultEmbedder: Embedder | null = null;

export function getEmbedder(): Embedder {
  if (defaultEmbedder) return defaultEmbedder;
  if (process.env.OPENAI_API_KEY) {
    try {
      // Lazy load to avoid requiring openai when not used
      const { OpenAIEmbedder } = require("./embed-openai.js");
      defaultEmbedder = new OpenAIEmbedder();
      return defaultEmbedder;
    } catch {
      // fall through to stub
    }
  }
  defaultEmbedder = new StubEmbedder();
  return defaultEmbedder;
}

export function setEmbedder(embedder: Embedder | null): void {
  defaultEmbedder = embedder;
}
