#!/usr/bin/env node
/*
  SSE entrypoint (HTTP-based MCP transport)

  This file scaffolds an HTTP server and attempts to dynamically load the
  SSE transport from the MCP SDK. It prints a clear error if the runtime
  transport wiring needs adjustment for your SDK version.
*/
import http from "node:http";
import { createMcpServer } from "./mcp-server.js";

const PORT = Number(process.env.PORT || 3000);
const server = createMcpServer();

// Lazy import to avoid type coupling; SDK may evolve.
async function getSSETransport(): Promise<any> {
  try {
    // Typical path as of SDK v1.x
    const mod = await import("@modelcontextprotocol/sdk/server/sse.js");
    return mod.SSEServerTransport ?? mod.default ?? mod;
  } catch (e) {
    console.error("Failed to load SSE transport from @modelcontextprotocol/sdk/server/sse.js");
    console.error(String(e));
    process.exit(1);
  }
}

const httpServer = http.createServer(async (req, res) => {
  // Basic CORS (allow local testing and MCP clients running elsewhere)
  res.setHeader("Access-Control-Allow-Origin", process.env.CORS_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type, authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  // Expect two endpoints per MCP-over-SSE convention:
  // - GET  /sse   (EventSource stream)
  // - POST /messages  (client -> server messages)
  // The transport should handle protocol details for these endpoints.

  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const path = url.pathname;

  // Hand off any MCP-relevant paths to the SSE transport
  if ((req.method === "GET" && path === "/sse") || (req.method === "POST" && path === "/messages")) {
    const SSETransport = await getSSETransport();
    try {
      const transport = new SSETransport({ request: req, response: res });
      await server.connect(transport);
      // The SSE connection will keep the response open; do not end here.
      return;
    } catch (err) {
      res.statusCode = 500;
      res.end(`SSE transport error: ${String(err)}`);
      return;
    }
  }

  // Health and info
  if (req.method === "GET" && path === "/") {
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        name: "scryfall-mcp",
        version: "0.1.0",
        transport: "sse",
        endpoints: { events: "/sse", messages: "/messages" }
      })
    );
    return;
  }

  res.statusCode = 404;
  res.end("Not Found");
});

httpServer.listen(PORT, () => {
  console.log(`SSE MCP server listening on http://localhost:${PORT}`);
});

