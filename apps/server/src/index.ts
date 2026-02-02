import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "./config.js";
import { healthRoutes } from "./routes/health.js";
import { apiRoutes } from "./routes/api.js";
import { ChromaAdapter } from "moltiq-vector";
import { RetrievalEngine } from "moltiq-core";
import { MemoryService } from "./services/memory-service.js";
import { pruneOldMemories } from "./services/prune.js";

// Prisma reads DATABASE_URL from env
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = config.databaseUrl;
}

async function main() {
  const vector = new ChromaAdapter({
    host: config.chromaHost,
    port: config.chromaPort,
  });

  const memoryService = new MemoryService(vector);
  const fetchMemoriesByIds = (ids: string[]) => memoryService.getByIds(ids);
  const retrieval = new RetrievalEngine(vector, fetchMemoriesByIds);

  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });
  await app.register(healthRoutes);
  await app.register((instance) => apiRoutes(instance, { vector, memoryService, retrieval }));

  if (config.pruneDays != null && config.pruneDays > 0) {
    setInterval(async () => {
      try {
        const n = await pruneOldMemories(config.pruneDays!, vector);
        if (n > 0) app.log.info({ pruned: n }, "Pruned old memories");
      } catch (err) {
        app.log.error(err, "Prune failed");
      }
    }, 60 * 60 * 1000);
  }

  await app.listen({ port: config.port, host: "0.0.0.0" });
  console.log(`MoltIQ server listening on http://0.0.0.0:${config.port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
