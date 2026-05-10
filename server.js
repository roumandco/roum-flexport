import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import express from "express";

const FLEXPORT_API = "https://api.flexport.com";
const API_KEY = process.env.FLEXPORT_API_KEY;

if (!API_KEY) {
  console.error("ERROR: FLEXPORT_API_KEY environment variable is required.");
  process.exit(1);
}

async function flexport(path, { method = "GET", params = {}, body } = {}) {
  const url = new URL(`${FLEXPORT_API}${path}`);
  if (method === "GET") {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    });
  }
  const res = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      "Flexport-Version": "2",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json();
  if (!res.ok) {
    const msg = json?.error?.message || json?.message || res.statusText;
    throw new Error(`Flexport API error ${res.status}: ${msg}`);
  }
  return json;
}

function registerTools(server) {
  server.tool("list_shipments", "List Flexport shipments.", {
    status: z.string().optional(),
    per_page: z.number().int().min(1).max(100).default(20),
    page: z.number().int().min(1).default(1),
  }, async ({ status, per_page, page }) => {
    const data = await flexport("/shipments", { params: { status, per_page, page } });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("get_shipment", "Get a single Flexport shipment by ID.", {
    shipment_id: z.number().int(),
  }, async ({ shipment_id }) => {
    const data = await flexport(`/shipments/${shipment_id}`);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("list_containers", "List ocean containers.", {
    per_page: z.number().int().min(1).max(100).default(20),
    page: z.number().int().min(1).default(1),
  }, async ({ per_page, page }) => {
    const data = await flexport("/containers", { params: { per_page, page } });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("list_invoices", "List freight invoices.", {
    status: z.string().optional(),
    per_page: z.number().int().min(1).max(100).default(20),
    page: z.number().int().min(1).default(1),
  }, async ({ status, per_page, page }) => {
    const data = await flexport("/invoices", { params: { status, per_page, page } });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("list_orders", "List Flexport logistics/SFN orders.", {
    per_page: z.number().int().min(1).max(100).default(20),
    page: z.number().int().min(1).default(1),
  }, async ({ per_page, page }) => {
    const data = await flexport("/logistics/orders", { params: { per_page, page } });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });
}

const app = express();
app.use(express.json());

app.get("/", (_, res) => res.json({ status: "ok", server: "flexport-mcp" }));

app.all("/mcp", async (req, res) => {
  try {
    const server = new McpServer({ name: "flexport-mcp", version: "1.0.0" });
    registerTools(server);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => transport.close());
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("MCP error:", err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Flexport MCP server on port ${PORT}`));
