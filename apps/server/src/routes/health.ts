import type { FastifyInstance } from "fastify";
import { prisma } from "moltiq-db";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", async (_req, reply) => {
    const dbOk = await checkDb();
    const status = dbOk === "ok" ? "ok" : "degraded";
    const statusCode = dbOk === "ok" ? 200 : 503;

    return reply.status(statusCode).send({
      status,
      service: "moltiq",
      dependencies: { db: dbOk },
    });
  });
}

async function checkDb(): Promise<"ok" | "error"> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return "ok";
  } catch {
    return "error";
  }
}
