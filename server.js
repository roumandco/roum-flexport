import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import express from "express";

const FLEXPORT_API = "https://api.flexport.com";
const API_KEY = process.env.FLEXPORT_API_KEY;
if (!API_KEY) { console.error("ERROR: FLEXPORT_API_KEY required."); process.exit(1); }

async function flexport(path, { method = "GET", params = {}, body } = {}) {
  const url = new URL(`${FLEXPORT_API}${path}`);
  if (method === "GET") Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  });
  const res = await fetch(url.toString(), {
    method,
    headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json", "Flexport-Version": "2" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Flexport API error ${res.status}: ${json?.error?.message || json?.message || res.statusText}`);
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
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : `http://localhost:${PORT}`;

app.get("/", (_, res) => res.json({ status: "ok", server: "flexport-mcp" }));

app.get("/.well-known/oauth-authorization-server", (_, res) => {
  res.json({
    issuer: BASE_URL,
    authorization_endpoint: `${BASE_URL}/authorize`,
    token_endpoint: `${BASE_URL}/token`,
    registration_endpoint: `${BASE_URL}/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
  });
});

app.post("/register", (req, res) => {
  res.status(201).json({
    client_id: "flexport-mcp-client",
    client_secret: "not-used",
    redirect_uris: req.body?.redirect_uris || [],
    grant_types: ["authorization_code"],
    response_types: ["code"],
  });
});

app.get("/authorize", (req, res) => {
  const { redirect_uri, state } = req.query;
  const url = new URL(redirect_uri);
  url.searchParams.set("code", "static-auth-code");
  if (state) url.searchParams.set("state", state);
  res.redirect(url.toString());
});

app.post("/token", (req, res) => {
  res.json({ access_token: "static-access-token", token_type: "bearer", expires_in: 86400 });
});

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

app.listen(PORT, () => console.log(`Flexport MCP server on port ${PORT}`));
