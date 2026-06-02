
---
project: vena
researched_at: 2026-05-29
recommended_platform: Cloudflare Workers
runner_up: Render
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro v6 SSR
  runtime: Cloudflare workerd (via @astrojs/cloudflare v13)
  database: Supabase (external)
---

## Recommendation

**Deploy on Cloudflare Workers.**

The project already uses `@astrojs/cloudflare v13` with a `wrangler.jsonc` configured for the Workers deployment model (`"main": "@astrojs/cloudflare/entrypoints/server"`) — migrating to any other platform would require replacing the adapter and rewriting local dev setup for zero practical gain. Cloudflare Workers scored Pass on all five agent-friendly criteria (the only platform to do so alongside Render), offers a free tier that covers MVP traffic (100k requests/day), and provides the strongest agent integration of any platform evaluated: 16 specialized MCP servers (most GA), a dedicated Claude Code integration page, and `llms.txt` plus Accept-Markdown headers across all docs. The scoring, the cost profile (free at MVP scale, $5/month as the first paid tier), and the zero-migration-cost stack alignment all converge on the same answer.

One pre-existing issue must be resolved before first deploy: `wrangler.jsonc` has `compatibility_date: 2026-05-08` and `compatibility_flags: ["nodejs_compat"]` but is missing `"disable_nodejs_process_v2"` — the workaround for a confirmed Astro v6 + middleware rendering bug (GitHub #15434). Add it before deploying.

---

## Platform Comparison

| Platform | CLI-first | Managed/Serverless | Agent docs | Deploy API | MCP | Pass count |
|---|---|---|---|---|---|---|
| **Cloudflare Workers** | Pass | Pass | Pass | Pass | Pass | **5** |
| **Render** | Pass | Pass | Pass | Pass | Pass | **5** |
| **Railway** | Partial | Pass | Pass | Pass | Pass | **4 + 1P** |
| **Netlify** | Partial | Pass | Pass | Pass | Pass | **4 + 1P** |
| **Vercel** | Partial | Pass | Pass | Pass | Partial | **3 + 2P** |
| **Fly.io** | Partial | Pass | Partial | Pass | Partial | **2 + 3P** |

**Notes per criterion:**

- _CLI-first Partials_: Railway and Netlify have no single-command CLI rollback (dashboard or REST API only). Vercel Hobby limits rollback to the immediately previous deployment. Fly.io requires image-redeploy workaround. Cloudflare and Render both expose `wrangler rollback [VERSION_ID]` and `render deploys create` respectively.
- _Agent docs Partial (Fly.io)_: `llms.txt` is present but less structured and less comprehensive than Cloudflare's multi-product `llms.txt` + `Accept: text/markdown` header support or Railway's agent-specific markdown corpus.
- _MCP Partials_: Vercel MCP is beta (as of 2026-04-06). Fly.io `fly mcp server` is preview (not formally GA-labeled).

**Soft-weight adjustments applied:**

- _Minimize cost_ (Q2): Cloudflare free tier is 100k requests/day — the only platform that is genuinely free at MVP traffic without degraded UX. Render free tier has 60-second cold starts (unusable for real users; $7/month to fix). Vercel Hobby is non-commercial only and has a 4 CPU-hour/month limit. Railway is $5/month flat with no free tier. Fly.io has no free tier (~$4–6/month minimum).
- _Single region — Poland_ (Q4): No edge advantage needed; all platforms serve Poland adequately. Fly.io's Warsaw region was deprecated in 2025; nearest substitutes are Amsterdam and Frankfurt (~15–20ms RTT from Poland).
- _External providers fine_ (Q5): Supabase handles auth and data; no platform co-location needed. Cloudflare Hyperdrive (GA) could reduce per-request Supabase connection overhead if latency becomes a concern post-MVP.
- _No strong familiarity_ (Q3): No tie-breaking applied.

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

The stack is already fully configured for Workers: `@astrojs/cloudflare v13` adapter, `wrangler.jsonc`, workerd dev runtime, `.dev.vars` for local secrets. Deploying requires `wrangler secret put` for two keys and `wrangler deploy` — no adapter swap, no new tooling, no config rewrite. Free tier covers MVP traffic entirely; the $5/month Workers Bundled plan (10M requests, 30M CPU-ms) is the first upgrade tier if needed. Agent tooling is industry-leading: 16 MCP servers (most GA), `llms.txt` + `llms-full.txt` per product, `Accept: text/markdown` on all doc pages, and a dedicated Claude Code integration path. One known pre-existing bug requires a one-line fix before deploy.

#### 2. Render

Render matched Cloudflare's perfect 5-Pass score on the agent-friendly criteria. Its MCP server is GA (since August 2025), CLI is clean (`render deploys create`, structured JSON output), and docs expose both `llms.txt` and `llms-full.txt`. The platform runs persistent Node.js processes (no per-invocation cold start budget), which eliminates the workerd CPU-time-limit concern. The gap versus Cloudflare: migration work (replace `@astrojs/cloudflare` with `@astrojs/node`, update `astro.config.mjs`, switch `.dev.vars` to `.env`), and cost — the free tier's 60-second cold start makes it unsuitable for real users; the $7/month Starter tier is the practical minimum.

#### 3. Railway

Railway scored 4 Pass + 1 Partial (CLI rollback is dashboard-only) and offers the strongest agent-specific MCP integration evaluated: local and remote MCP servers both GA, Claude Code explicitly listed as a supported client at `railway.com/agents/claude`, and a `railway setup agent` command that installs a procedural skill for Claude Code. Cost is $5/month flat (Hobby plan includes $5 compute credits; a small always-on Node.js service costs ~$1–3/month in compute, staying within the included credits). The gaps versus Cloudflare: migration required (same as Render), no free tier, and CLI rollback requires dashboard intervention.

---

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. **Active `nodejs_compat` + middleware rendering bug (GitHub #15434)**: `wrangler.jsonc` already has `compatibility_date: 2026-05-08` (after the `2025-09-15` threshold) and `nodejs_compat` flag — the exact combination that triggers `context.locals.user` being serialized to `[object Object]` in SSR pages. The project has `src/middleware.ts`. The documented workaround (`disable_nodejs_process_v2` in `compatibility_flags`) is a flag that could be deprecated in a future compatibility date bump.

2. **workerd is not Node.js — constraints are invisible until they hit you**: No `fs`, no native modules, no CJS `require()`. Any npm dependency that relies on Node.js-specific APIs fails silently or throws at runtime. All three container-based alternatives (Render, Railway, Fly.io) give the full Node.js surface. The dev environment has near-identical behavior but the CPU time accounting and some edge-case module resolution differ.

3. **Free tier 10ms active CPU per invocation**: Astro SSR with Supabase JWT verification + eligibility calculation + page render could approach this on complex pages. Requests that exceed the limit fail with a 503 — no user-visible error text, no automatic dashboard alert. The per-request CPU cost is difficult to predict locally.

4. **No built-in PR preview URLs for Workers**: Cloudflare Pages offers branch preview URLs; Workers does not. Getting PR previews requires configuring a separate `[env.preview]` Worker in `wrangler.jsonc` and wiring it to CI — not automatic. Render, Netlify, Vercel, and Railway all provide this out of the box.

5. **`wrangler tail` is a 5-minute streaming session, not a log sink**: For incident response or async monitoring, `wrangler tail` must be actively running. It is not a persistent log drain. Cloudflare's observability layer (`observability.enabled: true` is already set in `wrangler.jsonc`) provides dashboard-level logs, but structured log export requires Logpush configuration — a separate setup step.

### Pre-Mortem — How This Could Fail

The team deploys Vena to Cloudflare Workers in June 2026 with the middleware bug unfixed. The first week goes fine — eligibility pages render correctly in local `wrangler dev`. Two weeks after launch, users report blank screens on the eligibility page after logging in. The root cause is `context.locals.user` arriving as the string `[object Object]` in the page component: the `nodejs_compat` + middleware regression was present from day one but only manifested intermittently under production's exact compatibility flag resolution order.

While investigating, the team notices a second class of failures in Cloudflare's dashboard: occasional 503s on the donation-add page with CPU time exactly at 10ms. Astro SSR for that page runs Supabase JWT verification + an eligibility recalculation that together push past the free tier limit on pages with longer component trees. Neither failure was caught in local dev (wrangler dev has no CPU budget), and neither produced an error log — just a silent failure with a 503 status. Fixing the middleware bug requires a one-line config change; fixing the CPU limit requires upgrading to Workers Bundled ($5/month). The combined debugging time was two weekends that nobody had planned for, and the launch blog post had to be delayed.

### Unknown Unknowns

1. **Workers vs Pages is a load-bearing architectural distinction, not a naming preference.** This project is confirmed as Workers (the `"main"` field in `wrangler.jsonc` is the Worker entrypoint). Secrets are set via `wrangler secret put` (not `wrangler pages secret put`). The deploy command is `wrangler deploy` (not `wrangler pages deploy`). Mixing these up — e.g. reading a Pages deploy guide — produces silently incorrect behavior.

2. **`astro:env/server` schema gaps are silent at runtime.** Any secret added later via `wrangler secret put` without a corresponding `envField` declaration in `astro.config.mjs` will be `undefined` at runtime with no startup error. The Astro env schema validates at build time; the deployed Worker trusts the schema was complete.

3. **`observability.enabled: true` provides dashboard logs but `wrangler tail` has a 5-minute limit.** For async debugging, the dashboard is the primary tool. For structured streaming, configure a Logpush rule to R2 or a third-party log drain (Axiom, Baselime). This is not automatic.

4. **Static assets are served via the ASSETS binding (CDN), not through the Worker handler.** The `assets.directory: ./dist` binding in `wrangler.jsonc` routes static file requests to Cloudflare's CDN directly — they do not count against the 100k requests/day Worker invocation limit. This is correct behavior and means the free tier headroom is larger than it appears for an SSR app with many static assets.

---

## Operational Story

- **Preview deploys**: No built-in branch preview URLs for Workers. Add a `[env.preview]` environment to `wrangler.jsonc` with `name: "vena-preview"`; wire `wrangler deploy --env preview` to a CI step on pull requests. Preview URLs follow the pattern `vena-preview.<account>.workers.dev`.
- **Secrets**: Set per-environment via `npx wrangler secret put SUPABASE_URL` and `npx wrangler secret put SUPABASE_KEY`. For the preview environment: `npx wrangler secret put SUPABASE_URL --env preview`. Secrets are encrypted in Cloudflare's secret store; they are not readable after being set (only replaceable). Rotation: run `wrangler secret put` again with the new value.
- **Rollback**: `npx wrangler rollback [VERSION_ID]` — rolls back to the specified deployment version within ~60 seconds; omit the ID to roll back to the previous version. List versions with `npx wrangler deployments list`. Database migrations do NOT roll back automatically — coordinate with Supabase migration history.
- **Approval**: Human-only: deleting the Worker project, rotating the Supabase service key, changing DNS/custom domain routing. Agent may perform unattended: deploy, rollback, `wrangler tail`, `wrangler secret put` for non-primary secrets, reading `wrangler deployments list`.
- **Logs**: `npx wrangler tail --format json` streams live logs (5-minute session, must re-run after timeout). Dashboard logs via Cloudflare Workers → Logs tab (retained per `observability.enabled: true`). For persistent structured logs: add a Logpush rule from the Cloudflare dashboard to export to R2 or a third-party sink.

---

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| `nodejs_compat` + middleware bug renders `[object Object]` on SSR pages (GitHub #15434) | Research finding | **H** (already triggered by current config) | **H** | Add `"disable_nodejs_process_v2"` to `compatibility_flags` in `wrangler.jsonc` before first deploy |
| workerd runtime lacks Node.js APIs (`fs`, native modules, CJS `require()`) | Devil's advocate | M | H | Test each new npm dependency with `wrangler dev` before committing; prefer ESM packages; check compatibility in Cloudflare's module compatibility docs |
| Free tier 10ms CPU limit causes silent 503s on complex SSR pages | Devil's advocate | M | M | Monitor CPU time in Cloudflare dashboard after launch; upgrade to Workers Bundled ($5/month, 30ms CPU/invocation) if any page approaches the limit |
| `astro:env/server` schema gap: new secrets are silently `undefined` at runtime | Unknown unknowns | M | M | Any new `wrangler secret put` must be paired with an `envField` declaration in `astro.config.mjs`; add this check to the PR checklist |
| No built-in PR preview URLs | Devil's advocate | M | L | Add `[env.preview]` environment to `wrangler.jsonc`; wire `wrangler deploy --env preview` to CI on pull requests |
| `wrangler tail` session limit (5 min) blocks async log monitoring | Unknown unknowns | M | L | Enable Logpush to R2 or a third-party log drain for persistent structured logs |
| `disable_nodejs_process_v2` workaround deprecated in a future compatibility date bump | Pre-mortem | L | H | Track Cloudflare compatibility dates changelog; test middleware behavior after each compatibility date upgrade |
| Workers vs Pages command confusion in CI/CD setup | Unknown unknowns | M | M | Deploy command is `wrangler deploy` (not `wrangler pages deploy`); this is confirmed by `"main"` field in `wrangler.jsonc` |

---

## Getting Started

The project is already configured for Cloudflare Workers deployment. These are the steps to ship the first production deploy:

1. **Fix the active middleware bug first** — add `"disable_nodejs_process_v2"` to `compatibility_flags` in `wrangler.jsonc`:
   ```json
   "compatibility_flags": ["nodejs_compat", "disable_nodejs_process_v2"]
   ```

2. **Authenticate with Cloudflare** (one-time, browser-based):
   ```bash
   npx wrangler login
   ```

3. **Set production secrets** (run each command and paste the value when prompted):
   ```bash
   npx wrangler secret put SUPABASE_URL
   npx wrangler secret put SUPABASE_KEY
   ```

4. **Build and deploy**:
   ```bash
   npm run build
   npx wrangler deploy
   ```
   The deploy command outputs a `workers.dev` URL. Verify the auth flow and eligibility calculator on this URL before adding a custom domain.

5. **Tail live logs** to verify no 503s or rendering errors after deploy:
   ```bash
   npx wrangler tail --format pretty
   ```

For CI (GitHub Actions): add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as repository secrets, then add `npx wrangler deploy` as the production deploy step after the lint + build checks pass. Both `SUPABASE_URL` and `SUPABASE_KEY` must also be set as repository secrets for the CI build step (they are referenced in `astro.config.mjs` as optional env fields).

---

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup (covered by GitHub Actions — `.github/workflows/ci.yml` already exists)
- Production-scale architecture (multi-region, HA, DR)
- Cloudflare custom domain and DNS configuration
