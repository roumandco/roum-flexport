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

// ── Flexport HTTP helper ──────────────────────────────────────────────────────
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

// ── MCP Server ────────────────────────────────────────────────────────────────
const server = new McpServer({
  name: "flexport-mcp",
  version: "1.0.0",
});

// LIST SHIPMENTS
server.tool(
  "list_shipments",
  "List all Flexport shipments, optionally filtered by status or date range.",
  {
    status: z.string().optional().describe("Filter by shipment status, e.g. 'active', 'delivered'"),
    per_page: z.number().int().min(1).max(100).default(20).describe("Results per page (max 100)"),
    page: z.number().int().min(1).default(1).describe("Page number"),
  },
  async ({ status, per_page, page }) => {
    const data = await flexport("/shipments", {
      params: { status, per_page, page },
    });
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// GET SHIPMENT
server.tool(
  "get_shipment",
  "Retrieve full details for a single Flexport shipment by its ID.",
  {
    shipment_id: z.number().int().describe("Flexport shipment ID (numeric Flex ID)"),
  },
  async ({ shipment_id }) => {
    const data = await flexport(`/shipments/${shipment_id}`);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// LIST CONTAINERS
server.tool(
  "list_containers",
  "List all ocean containers in your Flexport account.",
  {
    per_page: z.number().int().min(1).max(100).default(20).describe("Results per page"),
    page: z.number().int().min(1).default(1).describe("Page number"),
  },
  async ({ per_page, page }) => {
    const data = await flexport("/containers", { params: { per_page, page } });
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// GET CONTAINER
server.tool(
  "get_container",
  "Retrieve details for a single ocean container by ID.",
  {
    container_id: z.number().int().describe("Flexport container ID"),
  },
  async ({ container_id }) => {
    const data = await flexport(`/containers/${container_id}`);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// LIST DOCUMENTS
server.tool(
  "list_documents",
  "List all documents (invoices, BOLs, air waybills, etc.) in your account.",
  {
    shipment_id: z.number().int().optional().describe("Filter by shipment ID"),
    document_type: z.string().optional().describe("Filter by document type, e.g. 'commercial_invoice', 'air_waybill'"),
    per_page: z.number().int().min(1).max(100).default(20).describe("Results per page"),
    page: z.number().int().min(1).default(1).describe("Page number"),
  },
  async ({ shipment_id, document_type, per_page, page }) => {
    const data = await flexport("/documents", {
      params: { shipment_id, document_type, per_page, page },
    });
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// LIST INVOICES
server.tool(
  "list_invoices",
  "List freight invoices, optionally filtered by status, shipment, or date range.",
  {
    status: z.string().optional().describe("Invoice status, e.g. 'open', 'paid'"),
    shipment_id: z.number().int().optional().describe("Filter by shipment ID"),
    per_page: z.number().int().min(1).max(100).default(20).describe("Results per page"),
    page: z.number().int().min(1).default(1).describe("Page number"),
  },
  async ({ status, shipment_id, per_page, page }) => {
    const data = await flexport("/invoices", {
      params: { status, shipment_id, per_page, page },
    });
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// LIST WEBHOOK EVENTS
server.tool(
  "list_webhook_events",
  "List recent Flexport webhook events (milestones, document updates, etc.).",
  {
    per_page: z.number().int().min(1).max(100).default(20).describe("Results per page"),
    page: z.number().int().min(1).default(1).describe("Page number"),
  },
  async ({ per_page, page }) => {
    const data = await flexport("/webhook_events", { params: { per_page, page } });
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// CALCULATE CARBON EMISSIONS
server.tool(
  "calculate_carbon",
  "Calculate estimated carbon emissions for a shipment.",
  {
    shipment_id: z.number().int().describe("Flexport shipment ID"),
  },
  async ({ shipment_id }) => {
    const data = await flexport("/carbon/emissions", {
      method: "POST",
      body: { shipment_id },
    });
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ── Express HTTP transport ────────────────────────────────────────────────────
const app = express();
app.use(express.json());

// Health check — used by Railway / Render / Fly.io
app.get("/", (_, res) => res.json({ status: "ok", server: "flexport-mcp" }));

// MCP endpoint (Streamable HTTP transport)
app.all("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    allowedHosts: ["*"],
  });

  res.on("close", () => transport.close());

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Flexport MCP server listening on port ${PORT}`);
  console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
});
