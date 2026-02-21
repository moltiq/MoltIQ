import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { config } from "./config.js";
import { healthRoutes } from "./routes/health.js";
import { apiRoutes } from "./routes/api.js";
import { ChromaAdapter } from "moltiq-vector";
import { VectorFallbackAdapter } from "./lib/vector-fallback.js";
import { RetrievalEngine } from "moltiq-core";
import { MemoryService } from "./services/memory-service.js";
import { pruneOldMemories } from "./services/prune.js";
import { loadCustomPatterns } from "moltiq-core";
import { AppError } from "./lib/errors.js";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = config.databaseUrl;
}

// Apply redaction patterns from config
if (config.redactionPatterns.length > 0) {
  loadCustomPatterns(config.redactionPatterns);
}

async function main() {
  const chroma = new ChromaAdapter({
    host: config.chromaHost,
    port: config.chromaPort,
  });
  const vector = new VectorFallbackAdapter(chroma, config.chromaOptional);

  const memoryService = new MemoryService(vector, {
    embedBatchSize: config.embedBatchSize,
    dedupSimilarityThreshold: config.dedupSimilarityThreshold,
    auditLogEnabled: config.auditLogEnabled,
  });
  const fetchMemoriesByIds = (ids: string[]) => memoryService.getByIds(ids);
  const retrieval = new RetrievalEngine(vector, fetchMemoriesByIds, config.maxVectorK);

  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      transport:
        process.env.NODE_ENV !== "production"
          ? { target: "pino-pretty", options: { translateTime: "SYS:standard" } }
          : undefined,
    },
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.statusCode).send(err.toJSON());
    }
    app.log.error(err);
    return reply.status(500).send({
      code: "INTERNAL_ERROR",
      message: "Internal server error",
      statusCode: 500,
    });
  });

  await app.register(cors, { origin: true });

  if (config.rateLimitMax > 0) {
    await app.register(rateLimit, {
      max: config.rateLimitMax,
      timeWindow: config.rateLimitWindowMs,
    });
  }

  await app.register(swagger, {
    openapi: {
      info: { title: "MoltIQ API", version: "0.1.0", description: "Local-first memory layer for AI agents" },
      servers: [{ url: `http://localhost:${config.port}` }],
    },
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });

  await app.register(healthRoutes);
  await app.register((instance) =>
    apiRoutes(instance, {
      vector,
      memoryService,
      retrieval,
      config: {
        recencyHalfLifeDays: config.recencyHalfLifeDays,
        useLLMExtraction: config.useLLMExtraction,
        useLLMSessionSummary: config.useLLMSessionSummary,
      },
    })
  );

  if (config.pruneDays != null && config.pruneDays > 0) {
    const pruneInterval = setInterval(async () => {
      try {
        const n = await pruneOldMemories(config.pruneDays!, chroma);
        if (n > 0) app.log.info({ pruned: n }, "Pruned old memories");
      } catch (err) {
        app.log.error(err, "Prune failed");
      }
    }, 60 * 60 * 1000);
    const cleanup = () => clearInterval(pruneInterval);
    process.on("SIGTERM", cleanup);
    process.on("SIGINT", cleanup);
  }

  await app.listen({ port: config.port, host: "0.0.0.0" });
  app.log.info({ port: config.port }, "MoltIQ server listening");

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "Shutting down");
    try {
      await app.close();
      app.log.info("Server closed");
      process.exit(0);
    } catch (err) {
      app.log.error(err, "Error during shutdown");
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
