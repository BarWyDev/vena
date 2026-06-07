# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-06-07

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the team
   is worried about X, and the failure would surface somewhere in area Y"
   carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents *what
   could fail* and *why we believe it's likely* — drawn from documents,
   interview, and codebase *signal* (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/` (excluding
`node_modules`, `dist`, build output, `context/`), last 30 days, 24 commits.

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the *evidence that surfaced
this risk* — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|---|---|---|---|
| 1 | Editing or deleting a donation silently recomputes the eligible date onto the wrong anchor donation, and the donor sees a stale or incorrect date | High | High | interview Q3 ("every tweak feels risky for the calculator"); PRD FR-007 socratic note (delete-recompute flagged as a sharp edge); roadmap S-03 risk row (same concern, still an open "unknown") |
| 2 | A shared-UI refactor (layout / auth forms) breaks an authenticated flow — login, registration, or reaching a protected page — without any test catching it | High | High | interview Q2 ("a refactor of shared UI broke a flow not covered by any test"); hot-spot dirs `src/components/auth` (9 commits/30d), `src/pages/auth` (8/30d), `src/layouts/` — `Layout.astro` (5/30d) |
| 3 | The eligibility date shown is wrong — the RCKiK interval math, or the "latest donation per type" it is anchored to, is incorrect | High | Medium | interview Q1 ("a donor adds a donation and the date shown is wrong"); interview Q4 (the form→calculator seam is untested); PRD §Business Logic and NFR ("an incorrect date is a release-blocking defect") |
| 4 | A donor's profile or donation history becomes readable or writable from another account (IDOR / RLS gap) | High | Medium | PRD §Access Control ("sees only their own data"), NFR ("never visible to any other account"); roadmap F-01 risk row (RLS policies not yet migrated — new code about to land) |
| 5 | A new data-bearing route ships without being added to `PROTECTED_ROUTES`, leaving it reachable while unauthenticated | High | Medium | AGENTS.md hard rule ("add its path to `PROTECTED_ROUTES`" — a manual step); hot-spot file `src/middleware.ts` (4 commits/30d); PRD §Access Control ("unauthenticated access … redirects to login"); roadmap S-01/S-02 about to add new data-bearing pages |
| 6 | The exported .ics file fails to import cleanly into a real calendar client (timezone / DTSTART formatting) | Medium | Medium | archived `calendar-ics-export` risk row ("edge-cases … test on real clients before release" — never confirmed done); PRD NFR ("imports in one tap … without manual editing") |

**Abuse / security lens applied:** risk #4 (authorization/access — IDOR at
the RLS layer) and risk #5 (access-control coverage of new routes) are the
abuse-class scenarios this product genuinely exposes (it has auth and
accepts user input). Untrusted-input and resource-abuse classes were
considered and found to ride along with risks #1 and #3 (the donation-form
seam) rather than standing alone — Vena is email/password only, single-role,
small-scale, with no payment or high-frequency endpoints that would make
rate-limit bypass a distinct top-N risk.

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|------|---|---|---|---|---|
| #1 | Editing/deleting a donation correctly changes which donation anchors each type's date, and the donor sees the new RCKiK-correct date | "Delete just removes a row" — PRD's own note says the recompute onto an earlier date is *correct* behavior; the test must prove it lands on the right donation, not merely that something changed | What triggers recompute (re-fetch vs. client-side recompute); whether the UI refresh is synchronous with the write | integration (real Supabase) — post-write row ranking is exactly what a mock would lie about | asserting only "row count changed" / "old date is gone" — must assert the *new* date is correct for the new anchor donation |
| #2 | A refactor of shared layout/auth components doesn't break: register → log in → reach a protected page → `context.locals.user` populated | "The page renders, so it works" — cosmetic survival of a refactor says nothing about whether the actual auth handshake (form → API route → middleware → locals.user) still completes | How `FormField`/`SubmitButton`/`Layout` wire into the real signin/signup API routes and middleware; what observable signal proves "logged in" | integration/component test exercising the real form → API route → middleware chain for at least the login flow | snapshot/visual diff on layout or forms — the user explicitly named this as wasted budget (interview Q5) |
| #3 | Given a donor's full donation history and sex, the displayed date for each type matches the RCKiK rule anchored to the correct "latest donation per type" | "The 8 existing unit tests already prove this" — they prove pure interval math on a hand-built input map; they say nothing about whether that map is built correctly from a donor's full history | How "latest donation per type" is selected from the full donation list (sort/filter logic), and where that selection happens (server query vs. client) | unit/property test on the selection function feeding the existing pure-math layer in `src/lib/eligibility.test.ts`; integration only if selection turns out to be inline in a DB query | deriving the "expected latest donation" by re-running the selection code under test (oracle problem) — derive it independently from the donation list and the RCKiK rule |
| #4 | Donor A's session cannot read, edit, or delete donor B's profile or donation records, enforced at the RLS / data layer | "The UI only shows my own data" — a UI that displays only your rows says nothing about whether a crafted request (wrong id, direct call) can reach someone else's row | The actual RLS policy definitions once F-01 migrations land; whether API routes additionally filter by `user_id` or rely solely on RLS | integration test against a real/local Supabase instance with two seeded accounts — RLS enforcement is exactly the kind of constraint a mock would lie about | testing only "my own data appears" (happy path) — must attempt the cross-account read/write and assert it is *denied*, not merely absent from the UI |
| #5 | Every data-bearing route (current and the ones S-01/S-02 are about to add) redirects an unauthenticated visitor to login | "The middleware exists, so we're covered" — `PROTECTED_ROUTES` is a manually maintained list; the middleware only protects what's *listed*, and new pages are imminent | How `PROTECTED_ROUTES` matching works (exact-match vs. prefix); whether anything fails loudly when a new data-bearing page ships unlisted | small integration/contract test that walks the set of data-bearing routes derived from the PRD's Access Control rule and asserts each redirects when unauthenticated | testing only the routes already in the list — that mirrors the current config and proves nothing about omissions |
| #6 | The generated .ics file is RFC 5545–correct and the eligibility date it carries imports cleanly into Google, Apple, and Outlook | "It downloads and looks like valid iCal text" — interoperability bugs (DTSTART format, timezone handling, line-folding) look fine in isolation and only surface in a specific client | Which iCal fields/format the export currently emits (DTSTART, VTIMEZONE vs. UTC, line endings); whether the archived risk note's "test on real clients" step was ever actually performed | deterministic format/contract test against the iCal spec as the cheap layer; scripted or manual real-client import smoke as the higher-cost layer the archived note called for but may not have happened | snapshotting the generated file's exact byte content (implementation mirror) — assert spec-required fields/formats are present and correct, not "matches what the generator currently emits" |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|---|---|---|---|---|---|
| 1 | Auth & shared-UI regression safety net | Prove that shared layout/auth-form changes can't silently break login, registration, or protected-route access | #2, #5 | integration (form→API→middleware chain), route-protection contract test | complete | `context/changes/testing-auth-shared-ui-safety-net/` |
| 2 | Cross-account data isolation (RLS) | Prove donor data stays private at the database layer once F-01's schema and RLS land | #4 | integration against real/local Supabase, two seeded accounts | not started | — |
| 3 | Donation-seam → calculator correctness | Prove the full path "edit/delete a donation" → "latest-per-type selection" → "RCKiK-correct date shown" is right | #1, #3 | integration (real Supabase) for mutation-recompute; unit/property tests on the selection feeding the existing pure-math layer | not started | — |
| 4 | Calendar-export interoperability check | Close the archived S-04 risk note's open loop — prove the .ics file is spec-correct and importable in real clients | #6 | deterministic RFC 5545 format/contract test; scripted or manual real-client import smoke | not started | — |

**Status vocabulary** (fixed — parser literals): `not started` →
`change opened` → `researched` → `planned` → `implementing` → `complete`.

## 4. Stack

| Layer | Tool | Version | Notes |
|---|---|---|---|
| unit + integration | Vitest | ^3 | configured (`vitest.config.ts`, `@` alias to `src/`); one test file today (`src/lib/eligibility.test.ts`, 8 cases, pure calculation logic only) |
| API / data mocking | none | — | no MSW or similar installed; per cost × signal, the risks that need real signal here (RLS, mutation-recompute) require a real/local Supabase instance — a mock would lie about row state and policy enforcement, so Phases 1–3 plan integration tests, not mocks |
| e2e | none yet | — | roadmap OQ-2 ("Playwright or Cypress?") is still an open, blocking decision for S-02; no phase in this rollout resolves it — the chosen integration layer (real route/middleware/Supabase chain) covers risks #1–#5 without it. Re-evaluate if/when OQ-2 is resolved and an E2E layer is added for the PRD's primary success criterion (full register→…→export flow) |
| accessibility | none | — | no risk in §2 names an accessibility failure mode and the PRD carries no accessibility NFR; out of scope for this rollout |
| (optional) AI-native | not available in current session | n/a | no Playwright MCP, Context7, or similar exposed; not used anywhere in this plan |

**Stack grounding tools (current session):**
- Docs: none available (no Context7 / framework-docs MCP) — relying on local manifests, AGENTS.md, and PRD/roadmap; checked: 2026-06-07
- Search: generic WebSearch available — not used for this plan (no stack-tooling decision required grounding beyond local config); checked: 2026-06-07
- Runtime/browser: none available (no Playwright/browser MCP) — notable because roadmap OQ-2 (E2E framework choice) remains unresolved and this plan does not attempt to resolve it; checked: 2026-06-07
- Provider/platform: Supabase MCP plugin installed but not authenticated this session; `gh` CLI available via Bash for GitHub/CI inspection; checked: 2026-06-07

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required for §3 Phase N" means the gate is enforced once that rollout
phase lands; before that, the gate is `planned`.

| Gate | Where | Required? | Catches |
|---|---|---|---|
| lint + typecheck | local + CI | required — already wired (`.github/workflows/ci.yml`) | syntactic / type drift |
| unit + integration (auth, RLS, donation-seam) | local + CI | required after §3 Phase 1 | shared-UI/auth regressions, cross-account access, calculator-input correctness |
| .ics format/contract test | local + CI | required after §3 Phase 4 | iCal spec violations (DTSTART, timezone, line-folding) |
| real-client calendar import smoke | manual, pre-release | optional — recommended after §3 Phase 4 | client-specific interop bugs the format test can't see |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD — see §3 Phase N."

### 6.1 Adding a unit test

- **Location**: next to the unit under test (e.g. `src/lib/eligibility.test.ts` sits beside `src/lib/eligibility.ts`).
- **Naming**: `<module>.test.ts`.
- **Reference test**: `src/lib/eligibility.test.ts`.
- **Run locally**: `npm run test` (or `npx vitest run <path>` for a single file).

### 6.2 Adding an integration test

- **Location**: `src/test/`. Tests run against the real local Supabase stack (`npx supabase start`) — nothing is mocked; `vitest.config.ts` uses `getViteConfig()` (from `astro/config`) so `astro:env/server` and other Astro virtual modules resolve inside Vitest, and loads `.dev.vars` into `process.env` first so `SUPABASE_URL`/`SUPABASE_KEY` evaluate to the local stack's values (otherwise `createClient()` silently returns `null`).
- **Harness**: `src/test/middleware-harness.ts` provides the invocation primitives — import and reuse them rather than re-deriving how to call real Astro code:
  - `buildContext({ method, pathname, params?, formData?, cookieHeader?, locals? })` — returns a real `APIContext` via Astro's own `createContext()`.
  - `invokeRoute(handler, context)` — invokes an API route's exported HTTP handler (e.g. `signin.ts`'s `POST`) and returns the real `Response`.
  - `invokeMiddleware(context)` — invokes the project's real `onRequest` with a `next` stub that returns a sentinel `Response` *without rendering any page* (rendering would reintroduce "the page renders, so it works"); returns `{ response, calledNext, capturedUser }`, where `capturedUser` is `context.locals.user` captured at the moment `next` was called — the assertable proof of "logged in." If the middleware short-circuits with a redirect (never calls `next`), read `context.locals.user` directly instead — it's set synchronously before the protection check runs.
  - `chainCookies(context)` — reads the `Set-Cookie` strings queued on a prior invocation's `context.cookies`, and folds their `name=value` pairs into a single `Cookie` header string for the next `buildContext()` call. This is how a two-request handshake (e.g. signin → middleware) is chained.
- **Fixtures**: for tests that need an authenticated account, `src/test/auth-fixtures.ts`'s `createSeededAccount()` creates a real, disposable account on the local stack (`auth.signUp`, immediately usable — `enable_confirmations = false`) and seeds a *complete* profile (`sex` set) via the account's own session and the `profiles_insert_own` RLS policy — no service-role client needed. No explicit cleanup; the local instance is itself disposable.
- **Reference suites**: `src/test/route-protection.test.ts` (no-account, `locals.user = null` shape) and `src/test/auth-flow.test.ts` (full two-request cookie-chaining shape).
- **Run locally**: `npm test` (or `npx vitest run <path>` for a single file) — requires `npx supabase start` first.

### 6.3 Adding an e2e test

- TBD — no phase in this rollout adds e2e. Roadmap OQ-2 (Playwright vs. Cypress) is still open and blocking; revisit this entry once that decision lands.

### 6.4 Adding a test for a new data-bearing route

- **Identify which protection tier the route falls into** — this codebase has two, independently maintained, and the oracle differs per tier (conflating them tests the wrong thing for one of them, `research.md:111`):
  - **Page tier** (`.astro` routes rendering HTML): governed centrally by `PROTECTED_ROUTES` in `src/middleware.ts` (prefix-matched via `pathname.startsWith()`). The oracle is "does the middleware redirect it" — add a case to `route-protection.test.ts`'s page-tier table asserting `invokeMiddleware()` returns a `302` to `/auth/signin` *without* calling `next` (`calledNext === false`). If the new route's path isn't already covered by an existing `PROTECTED_ROUTES` prefix, add the prefix there too — the whole point of this suite is to catch the gap between "the list" and "the filesystem," so don't let the test cover a route the middleware doesn't actually protect.
  - **API tier** (`/api/*` routes): never matched by `PROTECTED_ROUTES` (none of them start with `/profile` or `/donations` — `research.md:109/173`, deliberate documented precedent). Each does its own inline `if (!context.locals.user) return context.redirect("/auth/signin")` check. The oracle is "does the handler check `locals.user`" — import the route's exported handler and add a case to the API-tier table asserting `invokeRoute()` returns a `302` to `/auth/signin` directly.
- **Always assert both** `response.status === 302` *and* `response.headers.get("Location") === "/auth/signin"` — "not 200" alone would also pass for an unrelated server error and prove nothing about protection.
- **Dynamic segments** (`[id]`-style routes): pass any syntactically-valid placeholder (e.g. a UUID) via `params` — the protection check runs before any by-id lookup, so its value is immaterial.
- **Re-derive the inventory from the filesystem** (`find src/pages -type f`), not from `PROTECTED_ROUTES` or a copy of the existing test table — that would "mirror the current config and prove nothing about omissions" (§2 row 5 anti-pattern column). This is exactly the manual-verification step the original phase used (`plan.md` 2.3) and should be repeated whenever the route inventory changes.

### 6.5 Adding a test for the eligibility calculator or the donation seam feeding it

- TBD — see §3 Phase 3 (the phase that grounds the "latest donation per type" selection and the mutation-recompute path).

### 6.6 Per-rollout-phase notes

- **Phase 1 (`testing-auth-shared-ui-safety-net`, 2026-06-07)**: The harness needs *two* distinct invocation shapes for "real code" — an API route's exported HTTP handler (`POST: APIRoute`) and the middleware's `onRequest` (`MiddlewareHandler`, which needs a non-rendering `next` stub) — because risk #2's chain spans both. The other surprise: `astro:env/server` evaluates via Vite's `loadEnv()`, which merges `process.env` for *any* key when the prefix list includes `""` — so loading `.dev.vars` into `process.env` at the top of `vitest.config.ts`, before `getViteConfig()` resolves the Astro config, was sufficient to make `createClient()` return a real client (not `null`) inside Vitest. No Vitest `setupFiles`/`test.env` plumbing was needed.

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption changes.

- **Visual/snapshot tests on shared layout (`Layout.astro` and similar)** — the user named these directly as wasted budget: "they break on every tweak and catch nothing real" (interview Q5). Re-evaluate only if the team adopts a deterministic visual-diff tool with a genuinely stable baseline strategy, and even then scope it narrowly (not full-page snapshots).

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-06-07
- Stack versions last verified: 2026-06-07
- AI-native tool references last verified: 2026-06-07 (none in use — no Playwright/Context7/Exa MCP available this session)

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
