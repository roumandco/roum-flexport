import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import express from "express";

const SHOPIFY_STORE = "roumgold.myshopify.com";
const API_TOKEN = process.env.SHOPIFY_API_TOKEN;
const API_VERSION = "2025-01";
const SHOPIFY_API = `https://${SHOPIFY_STORE}/admin/api/${API_VERSION}`;

if (!API_TOKEN) {
  console.error("ERROR: SHOPIFY_API_TOKEN environment variable is required.");
  process.exit(1);
}

// ── Shopify HTTP helper ───────────────────────────────────────────────────────
async function shopify(path, { method = "GET", params = {}, body } = {}) {
  const url = new URL(`${SHOPIFY_API}${path}`);
  if (method === "GET") {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    });
  }

  const res = await fetch(url.toString(), {
    method,
    headers: {
      "X-Shopify-Access-Token": API_TOKEN,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const json = await res.json();
  if (!res.ok) {
    const msg = json?.errors || json?.error?.message || res.statusText;
    throw new Error(`Shopify API error ${res.status}: ${JSON.stringify(msg)}`);
  }
  return json;
}

// ── MCP Server ────────────────────────────────────────────────────────────────
const server = new McpServer({
  name: "roumgold-shopify-mcp",
  version: "1.0.0",
});

// LIST ORDERS
server.tool(
  "list_orders",
  "List Shopify orders, optionally filtered by status.",
  {
    status: z.enum(["open", "closed", "cancelled", "any"]).default("any").describe("Order status filter"),
    fulfillment_status: z.enum(["shipped", "partial", "unshipped", "unfulfilled", "any"]).optional().describe("Filter by fulfillment status"),
    limit: z.number().int().min(1).max(250).default(50).describe("Number of orders to return (max 250)"),
    page_info: z.string().optional().describe("Pagination cursor from previous response"),
  },
  async ({ status, fulfillment_status, limit, page_info }) => {
    const data = await shopify("/orders.json", {
      params: { status, fulfillment_status, limit, page_info },
    });
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// GET ORDER
server.tool(
  "get_order",
  "Retrieve full details for a single Shopify order by its ID.",
  {
    order_id: z.number().int().describe("Shopify order ID"),
  },
  async ({ order_id }) => {
    const data = await shopify(`/orders/${order_id}.json`);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// LIST FULFILLMENTS FOR AN ORDER
server.tool(
  "list_fulfillments",
  "List all fulfillments (shipments) for a specific order.",
  {
    order_id: z.number().int().describe("Shopify order ID"),
  },
  async ({ order_id }) => {
    const data = await shopify(`/orders/${order_id}/fulfillments.json`);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// LIST PRODUCTS
server.tool(
  "list_products",
  "List products in the Shopify store.",
  {
    limit: z.number().int().min(1).max(250).default(50).describe("Number of products to return"),
    status: z.enum(["active", "archived", "draft"]).optional().describe("Filter by product status"),
  },
  async ({ limit, status }) => {
    const data = await shopify("/products.json", {
      params: { limit, status },
    });
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// LIST INVENTORY LEVELS
server.tool(
  "list_inventory_levels",
  "List inventory levels across locations.",
  {
    location_ids: z.string().optional().describe("Comma-separated location IDs to filter by"),
    limit: z.number().int().min(1).max(250).default(50).describe("Number of results to return"),
  },
  async ({ location_ids, limit }) => {
    const data = await shopify("/inventory_levels.json", {
      params: { location_ids, limit },
    });
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// LIST LOCATIONS
server.tool(
  "list_locations",
  "List all fulfillment locations for the store.",
  {},
  async () => {
    const data = await shopify("/locations.json");
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// LIST RETURNS
server.tool(
  "list_returns",
  "List returns for a specific order.",
  {
    order_id: z.number().int().describe("Shopify order ID"),
  },
  async ({ order_id }) => {
    const data = await shopify(`/orders/${order_id}/returns.json`);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// LIST TRANSACTIONS
server.tool(
  "list_transactions",
  "List financial transactions for a specific order.",
  {
    order_id: z.number().int().describe("Shopify order ID"),
  },
  async ({ order_id }) => {
    const data = await shopify(`/orders/${order_id}/transactions.json`);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ── Express HTTP transport ────────────────────────────────────────────────────
const app = express();
app.use(express.json());

app.get("/", (_, res) => res.json({ status: "ok", server: "roumgold-shopify-mcp" }));

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
  console.log(`Shopify MCP server listening on port ${PORT}`);
  console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
});
