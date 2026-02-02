/**
 * MCP server exposing MoltIQ memory tools. Calls MoltIQ HTTP API.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as client from "./client.js";

function createServer(): McpServer {
  const server = new McpServer({
    name: "moltiq",
    version: "0.1.0",
  });

  server.registerTool(
    "memory.search",
    {
      description: "Search memories by query with optional project and tags",
      inputSchema: {
        q: z.string().describe("Search query"),
        project: z.string().optional().describe("Project ID or name filter"),
        tags: z.string().optional().describe("Comma-separated tags"),
        limit: z.number().optional().describe("Max results (default 20)"),
      },
    },
    async ({ q, project, tags, limit }) => {
      const data = await client.apiGet<{ memories: unknown[] }>("/api/search", {
        q: q ?? "",
        project: project ?? "",
        tags: tags ?? "",
        limit: limit ?? 20,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.registerTool(
    "memory.recall",
    {
      description: "Recall relevant memories packed into a token budget",
      inputSchema: {
        q: z.string().describe("Recall query"),
        project: z.string().optional().describe("Project filter"),
        budgetTokens: z.number().optional().describe("Token budget (default 2000)"),
      },
    },
    async ({ q, project, budgetTokens }) => {
      const data = await client.apiGet<{ packed: string; memories: unknown[] }>("/api/recall", {
        q: q ?? "",
        project: project ?? "",
        budgetTokens: budgetTokens ?? 2000,
      });
      return {
        content: [{ type: "text", text: data.packed || JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.registerTool(
    "memory.save",
    {
      description: "Save a new memory",
      inputSchema: {
        projectId: z.string().describe("Project ID"),
        type: z.enum(["FACT", "DECISION", "SNIPPET", "TASK", "SUMMARY"]).describe("Memory type"),
        title: z.string().describe("Title"),
        content: z.string().describe("Content"),
        tags: z.string().optional().describe("Comma-separated tags"),
        source: z.string().optional(),
        isFavorite: z.boolean().optional(),
        isPinned: z.boolean().optional(),
      },
    },
    async (args) => {
      const body = {
        projectId: args.projectId,
        type: args.type,
        title: args.title,
        content: args.content,
        tags: args.tags ? args.tags.split(",").map((t) => t.trim()) : [],
        source: args.source,
        isFavorite: args.isFavorite ?? false,
        isPinned: args.isPinned ?? false,
      };
      const data = await client.apiPost<{ memory: unknown }>("/api/memory", body);
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.registerTool(
    "memory.timeline",
    {
      description: "Get memories timeline for a project over recent days",
      inputSchema: {
        project: z.string().describe("Project ID or name"),
        days: z.number().optional().describe("Number of days (default 7)"),
      },
    },
    async ({ project, days }) => {
      const data = await client.apiGet<{ memories: unknown[] }>("/api/timeline", {
        project: project ?? "",
        days: days ?? 7,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.registerTool(
    "memory_stats",
    {
      description: "Get memory statistics for a project",
      inputSchema: {
        project: z.string().optional().describe("Project ID or name (optional)"),
      },
    },
    async ({ project }) => {
      const data = await client.apiGet<unknown>("/api/stats", {
        project: project ?? "",
      });
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.registerTool(
    "memory.export",
    {
      description: "Export memories as JSON, CSV, or Markdown",
      inputSchema: {
        format: z.enum(["json", "csv", "md"]).describe("Export format"),
        project: z.string().optional().describe("Project filter"),
      },
    },
    async ({ format, project }) => {
      const data = await client.apiGet<{ export: string } | { memories: unknown[] }>("/api/export", {
        format: format ?? "json",
        project: project ?? "",
      });
      const text = "export" in data && typeof data.export === "string" ? data.export : JSON.stringify(data, null, 2);
      return {
        content: [{ type: "text", text }],
      };
    }
  );

  return server;
}

export async function runMcpServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("MoltIQ MCP server running on stdio\n");
}
