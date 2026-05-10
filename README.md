# Flexport MCP Server

Remote MCP server that wraps the [Flexport API](https://apidocs.flexport.com) so you can connect it to **Claude.ai** as a custom connector — no local config file needed.

## Tools exposed

| Tool | What it does |
|---|---|
| `list_shipments` | List shipments, filter by status / page |
| `get_shipment` | Full detail for one shipment by ID |
| `list_containers` | List ocean containers |
| `get_container` | Detail for one container |
| `list_documents` | List docs (BOL, air waybill, invoice PDFs) |
| `list_invoices` | List freight invoices, filter by status |
| `list_webhook_events` | Recent milestone / document events |
| `calculate_carbon` | Estimate carbon emissions for a shipment |

---

## 1. Get your Flexport API key

1. Log into [Flexport Portal](https://app.flexport.com)
2. Go to **Your Business → Settings → API Keys**
3. Click **Create Key** → copy the token

---

## 2. Deploy (choose one)

### Option A — Railway (recommended, free tier available)

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway init
railway up

# Set environment variable
railway variables set FLEXPORT_API_KEY=your_key_here
```

Railway auto-assigns a public HTTPS URL like `https://flexport-mcp-production.up.railway.app`

---

### Option B — Render

1. Push this folder to a GitHub repo
2. Go to [render.com](https://render.com) → New → Web Service
3. Connect your repo
4. Set:
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Environment variable:** `FLEXPORT_API_KEY=your_key_here`
5. Deploy → copy the public URL

---

### Option C — Fly.io

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Deploy
fly launch
fly secrets set FLEXPORT_API_KEY=your_key_here
fly deploy
```

---

### Option D — Run locally (for testing only)

```bash
npm install
FLEXPORT_API_KEY=your_key_here npm start
# Server runs at http://localhost:3000/mcp
# Use ngrok to expose: ngrok http 3000
```

---

## 3. Connect to Claude.ai

1. Open [claude.ai](https://claude.ai)
2. Go to **Settings → Connectors → Add custom connector**
3. Paste your deployed URL + `/mcp`
   - Example: `https://flexport-mcp-production.up.railway.app/mcp`
4. Click **Add**
5. Enable the connector per conversation via the **+** button in chat

---

## Security note

- Your `FLEXPORT_API_KEY` lives only in your deployment environment — never in code
- The MCP server is stateless (no session storage)
- Recommend scoping API credentials to read-only endpoints in Flexport Settings
