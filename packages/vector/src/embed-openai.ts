import type { Embedder } from "./types.js";

const OPENAI_EMBED_DIMS = 1536;
const OPENAI_EMBED_MODEL = "text-embedding-3-small";

export class OpenAIEmbedder implements Embedder {
  readonly dimensions = OPENAI_EMBED_DIMS;

  async embed(text: string): Promise<number[]> {
    const [v] = await this.embedBatch([text]);
    return v;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY not set");

    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_EMBED_MODEL,
        input: texts,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI embeddings failed: ${res.status} ${err}`);
    }
    const data = (await res.json()) as { data: Array<{ embedding: number[] }> };
    return data.data.map((d) => d.embedding);
  }
}
