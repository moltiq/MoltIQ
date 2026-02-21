import { PrismaClient } from "@prisma/client";
export { PrismaClient } from "@prisma/client";
export type { Project, Session, Event, Memory, MemoryEmbedding, AuditLog } from "@prisma/client";

export type MemoryType = "FACT" | "DECISION" | "SNIPPET" | "TASK" | "SUMMARY";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
