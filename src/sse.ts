#!/usr/bin/env node
/*
  SSE entrypoint (HTTP-based MCP transport)

  This file scaffolds an HTTP server and attempts to dynamically load the
  SSE transport from the MCP SDK. It prints a clear error if the runtime
  transport wiring needs adjustment for your SDK version.
*/
import http from "node:http";
import { randomUUID } from "node:crypto";
import { createMcpServer } from "./mcp-server.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

const PORT = Number(process.env.PORT || 3000);
const server = createMcpServer();
const stateless = process.env.MCP_STATELESS === "1" || process.env.MCP_STATEFUL === "0";
const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: stateless ? undefined : () => randomUUID(),
    enableJsonResponse: true
});
await server.connect(transport as any);

const httpServer = http.createServer(async (req, res) => {
    // Basic CORS (allow local testing and MCP clients running elsewhere)
    const origin = (req.headers.origin as string) || "*";
    const allowOrigin = process.env.CORS_ORIGIN || origin || "*";
    res.setHeader("Access-Control-Allow-Origin", allowOrigin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    // Echo requested headers if provided; include common defaults
    const acrh = (req.headers["access-control-request-headers"] as string) || "accept, content-type, authorization";
    res.setHeader("Access-Control-Allow-Headers", acrh);
    // Support Private Network Access preflights from Chromium/Electron
    const acpnh = req.headers["access-control-request-private-network"];
    if (String(acpnh).toLowerCase() === "true") {
        res.setHeader("Access-Control-Allow-Private-Network", "true");
    }
    if (req.method === "OPTIONS") {
        res.statusCode = 204;
        res.end();
        return;
    }

    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    const path = url.pathname;
    // Light request log for debugging connector setup
    try {
        const a = String(req.headers["accept"] || "");
        const ct = String(req.headers["content-type"] || "");
        console.log(`${new Date().toISOString()} ${req.method} ${path} Accept=${a} CT=${ct}`);
    } catch {}
    const _start = Date.now();
    res.on("finish", () => {
        try {
            console.log(`${new Date().toISOString()} ${req.method} ${path} -> ${res.statusCode} in ${Date.now() - _start}ms`);
        } catch {}
    });

    // MCP Streamable HTTP single endpoint
    if (path === "/mcp") {
        // Normalize headers expected by Streamable HTTP transport to reduce client friction
        const origAccept = String(req.headers["accept"] || "");
        const parts = origAccept.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
        const hasJson = parts.some((p) => p.startsWith("application/json"));
        const hasSse = parts.some((p) => p.startsWith("text/event-stream"));
        const newParts = new Set(parts);
        if (!hasJson) newParts.add("application/json");
        if (!hasSse) newParts.add("text/event-stream");
        req.headers["accept"] = Array.from(newParts).join(", ");
        if (!req.headers["content-type"]) {
            req.headers["content-type"] = "application/json";
        }

        // Patch initialize requests missing required fields (protocolVersion/capabilities)
        const DEFAULT_PROTOCOL = process.env.MCP_PROTOCOL_VERSION || "2025-03-26";
        let parsedBody: any | undefined = undefined;
        if (req.method === "POST") {
            try {
                const chunks: Buffer[] = [];
                await new Promise<void>((resolve, reject) => {
                    req.on("data", (c) => chunks.push(Buffer.from(c)));
                    req.on("end", () => resolve());
                    req.on("error", (e) => reject(e));
                });
                const text = Buffer.concat(chunks).toString("utf8");
                if (process.env.MCP_LOG_BODY === "1") {
                    const preview = text.length > 4000 ? text.slice(0, 4000) + "…(truncated)" : text;
                    console.log(`[MCP] POST /mcp raw body: ${preview}`);
                }
                const candidate = JSON.parse(text);
                if (candidate && !Array.isArray(candidate) && candidate.method === "initialize") {
                    const params = (candidate.params = candidate.params || {});
                    if (!params.protocolVersion) params.protocolVersion = DEFAULT_PROTOCOL;
                    if (!params.capabilities) params.capabilities = {};
                    if (!params.clientInfo) params.clientInfo = { name: "unknown", version: "0.0.0" };
                    if (!candidate.jsonrpc) candidate.jsonrpc = "2.0";
                    if (candidate.id === undefined || candidate.id === null) candidate.id = 1;
                    if (process.env.MCP_LOG_BODY === "1") {
                        console.log(`[MCP] initialize (patched) -> ${JSON.stringify(candidate)}`);
                    }
                }
                parsedBody = candidate;
            } catch {
                parsedBody = undefined;
            }
        }

        try {
            await (transport as any).handleRequest(req as any, res as any, parsedBody);
            return;
        } catch (err) {
            res.statusCode = 500;
            res.end(`Streamable HTTP transport error: ${String(err)}`);
            return;
        }
    }

    // Health and info
    if (req.method === "GET" && path === "/.well-known/mcp.json") {
        res.setHeader("content-type", "application/json");
        res.end(
            JSON.stringify({
                name: "scryfall-mcp",
                version: "0.1.0",
                description: "MCP server for Scryfall + Commander Spellbook",
                transport: "streamable_http",
                endpoint: "/mcp"
            })
        );
        return;
    }
    if (req.method === "GET" && path === "/") {
        res.setHeader("content-type", "application/json");
        res.end(
            JSON.stringify({
                name: "scryfall-mcp",
                version: "0.1.0",
                transport: "streamable_http",
                endpoint: "/mcp"
            })
        );
        return;
    }

    res.statusCode = 404;
    res.end("Not Found");
});

httpServer.listen(PORT, () => {
    console.log(`MCP server (streamable_http) on http://localhost:${PORT} (endpoint: /mcp)`);
});
