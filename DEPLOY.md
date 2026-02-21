# Deploy MoltIQ API (Swagger live)

MoltIQ is **API-first**: no frontend is required. You deploy the HTTP server and share:

- **Live API base URL** (e.g. `https://your-app.up.railway.app`)
- **Swagger docs** at `/docs` (e.g. `https://your-app.up.railway.app/docs`)

Agents and developers call the API or use the MCP server pointing at your deployed URL.

---

## 1. Deploy the API

### Option A: Railway (recommended, free tier)

1. Push your repo to GitHub (you already have [runicprotocol/MoltIQ](https://github.com/runicprotocol/MoltIQ)).
2. Go to [railway.app](https://railway.app) → **Start a New Project** → **Deploy from GitHub** → select **MoltIQ**.
3. Railway will detect the repo. Add a **Dockerfile** deployment (use root `Dockerfile`).
4. Variables (Railway → your service → **Variables**):
   - `DATABASE_URL`: leave default or set e.g. `file:/data/moltiq.db` (Railway provides a volume; you can also add a **Postgres** plugin and use its `DATABASE_URL` when you add Postgres support).
   - `CHROMA_OPTIONAL`: `true` (so the API runs without a Chroma server).
   - `PORT`: Railway sets this automatically; the app already reads `process.env.PORT`.
5. Deploy. Railway assigns a URL like `https://moltiq-production.up.railway.app`.
6. **Swagger UI**: open `https://your-app.up.railway.app/docs`.

### Option B: Render

1. [render.com](https://render.com) → **New** → **Web Service**.
2. Connect GitHub and select **MoltIQ**.
3. **Build**: Docker (use root `Dockerfile`).
4. **Environment**:
   - `DATABASE_URL`: `file:/data/moltiq.db` (or path Render provides).
   - `CHROMA_OPTIONAL`: `true`
5. Add a **Disk** (persistent storage) and mount at `/data` so the SQLite DB persists.
6. Deploy. Docs: `https://your-service.onrender.com/docs`.

### Option C: Fly.io

```bash
# Install flyctl, then:
cd /path/to/MoltIQ
fly launch --no-deploy
# Add a volume for SQLite:
fly volumes create moltiq_data --size 1
```

In `fly.toml`, set:

```toml
[env]
  DATABASE_URL = "file:/data/moltiq.db"
  CHROMA_OPTIONAL = "true"

[mounts]
  source = "moltiq_data"
  destination = "/data"
```

Then:

```bash
fly deploy
```

Docs: `https://your-app.fly.dev/docs`.

### Option D: Your own server (VPS)

```bash
docker build -t moltiq .
docker run -d -p 37777:37777 \
  -e CHROMA_OPTIONAL=true \
  -v moltiq_data:/data \
  --name moltiq moltiq
```

Use a reverse proxy (Caddy, nginx) with HTTPS and point a domain to port 37777. Docs: `https://your-domain.com/docs`.

---

## 2. Share on X (Twitter)

Once the API is live:

1. **Tweet** with:
   - Short pitch: e.g. *"MoltIQ: open-source memory layer for AI agents. REST API + MCP, hybrid search, project scoping. Try the API docs:"*
   - Link to **Swagger**: `https://your-app.up.railway.app/docs`
   - Link to **GitHub**: `https://github.com/runicprotocol/MoltIQ`
   - Hashtags (optional): `#AI #OpenSource #MCP #BuildInPublic`

2. **Pin** the tweet or add the links to your profile so people can find the live docs and repo.

3. **Reply** with a curl example so devs can test immediately, e.g.:

   ```bash
   curl https://your-app.up.railway.app/health
   ```

---

## 3. Is there a frontend?

- **Current repo**: No. MoltIQ is an **API + MCP server** for agents and developers.
- **Optional later**: You could add a small frontend (e.g. Next.js or a static site) that talks to your deployed API (search, timeline, export). Not required to deploy or share the API; Swagger at `/docs` is enough for trying the API and for sharing on X.

---

## 4. Checklist before you share

- [ ] API is deployed and `/health` returns 200.
- [ ] `/docs` loads (Swagger UI).
- [ ] GitHub repo is public and README is clear.
- [ ] Tweet includes: live docs URL + repo URL (+ optional curl example).
