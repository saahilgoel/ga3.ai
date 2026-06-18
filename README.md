<div align="center">
  <img src="public/brand/mark.svg" width="72" height="72" alt="GA3" />
  <h1>GA3.ai</h1>
  <p><strong>You don't hate your data. You hate opening GA4.</strong></p>
  <p>The Google Analytics dashboard you missed — rebuilt readable, then made conversational.<br/>Ask your analytics in plain English. Read-only. Self-hostable.</p>
</div>

---

GA3 connects to your Google Analytics 4 property (read-only) and gives you back a dashboard you can actually read — sessions, users, channels, a realtime view — and lets you skip the dashboard entirely and just **ask**: *"Why did mobile conversion drop on Tuesday?"* It answers in plain English, with real charts, grounded in context it builds about your business (your site, products, competitors and industry).

> **Not affiliated with Google.** GA3 is an independent project. Google Analytics™ and GA4™ are trademarks of Google LLC. GA3 requests **read-only** access and never modifies your analytics.

## Why GA3 exists

When Google sunset Universal Analytics (the "GA3" era) and forced everyone onto GA4 in July 2023, it replaced a dashboard you could read at a glance with a reporting tool built for analysts: reports you assemble yourself in *Explore*, a vanished bounce rate, data that lands a day or two late, totals that don't add up because of thresholding, and a learning curve most marketers never asked for.

GA3 is a small bet that the answer isn't *another* dashboard to learn — it's **two** things: bring back the readable overview, and let people skip it entirely by **asking questions in plain English**. Because an LLM can read your numbers *and* understand your business, the answers can be specific ("mobile payment success fell to 71% on Thursday") instead of generic.

## Who it's for

- **Founders & operators** who want a straight answer ("how did last week go, and what needs me?") without building a report.
- **Marketers** who knew Universal Analytics cold and don't want to relearn analytics to find a bounce rate.
- **Agencies** managing many properties who want briefings and anomaly flags instead of manual check-ins.
- **Developers** who want a self-hostable, read-only, open analytics layer over their own GA4 data.

## Features

- **Conversational analytics** — ask questions, get charts + answers + the "so what."
- **The classic dashboard** — KPIs, trends, channels, top pages, at a glance.
- **Realtime view** — who's on your site, where, right now.
- **Daily briefings** — a plain-English overnight readout.
- **Named agents** — each watches a slice (acquisition, conversion, retention, spend) and flags changes.
- **Business context** — builds a profile of your site, products, competitors and industry to make insights specific.
- **Admin usage/cost dashboard** — per-account token/credit/cost tracking at `/admin`.

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind · [Vercel AI SDK](https://sdk.vercel.ai) · Anthropic Claude · Voyage embeddings · better-sqlite3 + sqlite-vec · iron-session · Recharts.

## Quick start

### Prerequisites

- **Node 22+**
- API keys for: [Anthropic](https://console.anthropic.com), [Voyage AI](https://www.voyageai.com), [ScrapingDog](https://www.scrapingdog.com)
- A **Google OAuth client** (see below)

### 1. Clone + install

```bash
git clone https://github.com/saahilgoel/ga3.ai.git
cd ga3.ai
npm install
```

### 2. Configure Google OAuth

1. In the [Google Cloud Console](https://console.cloud.google.com/), create a project.
2. Enable the **Google Analytics Data API** and **Google Analytics Admin API**.
3. **OAuth consent screen** — configure it and add yourself as a **Test user** (Testing mode needs no verification for up to 100 users).
4. **Credentials → Create OAuth client ID → Web application**. Add an authorized redirect URI:
   - `http://localhost:3000/api/auth/callback`
5. Copy the **Client ID** and **Client secret** into your `.env.local`.

### 3. Environment

```bash
cp .env.example .env.local
# then fill in the values — see the comments in .env.example
```

Generate a session secret with `openssl rand -base64 32`.

### 4. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), sign in with a Google account that has access to a GA4 property, pick a property, and start asking.

## Configuration

| Variable | Required | Purpose |
|---|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | ✅ | Google OAuth client |
| `GOOGLE_REDIRECT_URI` | ✅ | Must match an authorized redirect URI on the client |
| `ANTHROPIC_API_KEY` | ✅ | Claude — chat, briefings, narrative |
| `VOYAGE_API_KEY` | ✅ | Embeddings for context search |
| `SCRAPINGDOG_API_KEY` | ✅ | Fetches public web pages for context |
| `SESSION_SECRET` | ✅ | Encrypts the session cookie |
| `OWNER_EMAIL` | — | Your email → access to `/admin` |
| `ADMIN_EMAILS` | — | Extra admin emails (comma-separated) |
| `DB_PATH` | — | SQLite path (use a mounted volume in prod) |
| `GOOGLE_ADS_*` | — | Optional Google Ads connect (extra `adwords` scope) |

Full annotated list in [`.env.example`](.env.example).

## Deployment

Deploys cleanly to any Node host. On [Railway](https://railway.app): connect the repo, set the env vars, and add a **persistent volume** mounted where `DB_PATH` points (e.g. `/data`) so the SQLite database survives restarts. Set `GOOGLE_REDIRECT_URI` to your production callback URL and add that URL to the OAuth client's authorized redirect URIs.

## Architecture — and why each piece exists

```
Browser ──▶ Next.js route ──▶ Claude (tool calling) ──▶ Google Analytics API (read-only)
                                   │
                            context built from your
                            site + competitors + industry
                            (embedded in sqlite-vec)
```

| Piece | Where | Why it's built this way |
|---|---|---|
| **Auth gate + chrome in a route group** | `app/(app)/layout.tsx` | The sidebar/top-bar live in the layout so they don't re-mount on navigation — every page click feels instant instead of redrawing the shell. |
| **`loading.tsx` skeletons per section** | `app/(app)/**/loading.tsx` | A click registers in <100 ms with a skeleton shaped like the real page, so nothing ever looks frozen while data resolves. |
| **Context-build pipeline** | `lib/context/orchestrator.ts` | Before answering, GA3 reads your site, products, competitors and industry. This is what makes answers *specific to you* rather than generic GA explanations. It's a guarded, resumable, single-flight job (boot recovery + watchdog) because scraping + LLM steps are slow and must survive restarts. |
| **Vector search over context** | `lib/db.ts` (sqlite-vec) | Embeddings (Voyage) let the model retrieve the *relevant* slice of your business context per question, cheaply, from a single local SQLite file — no external vector DB to run. |
| **Named agents** | `lib/agents.ts` | Splitting monitoring into roles (acquisition, conversion, retention, spend) lets each "agent" watch one slice and surface changes proactively, instead of one model trying to watch everything. |
| **Tool-calling chat** | `app/api/chat/route.ts` | The model picks GA4 queries as tools and renders results as charts inline, so "ask a question" maps to a real report + a plain-English read. |
| **SSE, not polling** | `app/api/stream` | One server-sent-events stream pushes state changes (new findings, briefing ready) to every open tab, instead of N tabs each polling. |
| **Usage/cost admin layer** | `lib/usage/*`, `app/admin` | Every LLM/embedding/scrape call is attributed (tokens, credits, cost, by account + section) via `AsyncLocalStorage`, so a multi-tenant deployment can see exactly what each user costs. Owner-gated by `OWNER_EMAIL`. |
| **SQLite + a volume** | `lib/db.ts` | One embedded database (data + vectors) keeps self-hosting to "set `DB_PATH`, mount a volume" — no managed Postgres required to try it. |

### Project structure

```
app/
  (app)/            authenticated pages + shared chrome (sidebar, top-bar)
  api/              chat, dashboard, context, stream (SSE), admin, auth
  privacy, terms    legal pages
  page.tsx          public landing
components/         UI: chat, viz (hand-built charts), reports, landing
lib/
  context/          orchestrator + site/competitor/industry builders
  usage/            token/credit/cost attribution + pricing
  library/          brief templates seeded from data/library/seed_briefs.json
  google.ts         OAuth (read-only analytics scope)
  db.ts             SQLite + sqlite-vec
data/library/       seed brief templates (extras/ is gitignored, user-local)
```

## Data & privacy

GA3 requests the read-only `.../auth/analytics.readonly` scope — there is no write path. Analytics data is fetched on demand to answer your questions; it is not sold or used to train models. See the in-app privacy policy at `/privacy`.

## Contributing

Issues and PRs welcome. Run `npm run lint` and `npx tsc --noEmit` before opening a PR.

## License

[MIT](LICENSE) © Saahil Goel
