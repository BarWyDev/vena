---
date: 2026-06-07T06:58:54+02:00
researcher: BarWyDev
git_commit: 5838d8380b8afdd2e37470bbf48d4d68f85aeb84
branch: main
repository: vena
topic: "Auth & shared-UI regression safety net (test-plan Phase 1) — risks #2 and #5"
tags: [research, codebase, auth, middleware, route-protection, testing-infrastructure, supabase]
status: complete
last_updated: 2026-06-07
last_updated_by: BarWyDev
---

# Research: Auth & shared-UI regression safety net (test-plan Phase 1)

**Date**: 2026-06-07T06:58:54+02:00
**Researcher**: BarWyDev
**Git Commit**: 5838d8380b8afdd2e37470bbf48d4d68f85aeb84
**Branch**: main
**Repository**: vena

## Research Question

Ground rollout Phase 1 ("Auth & shared-UI regression safety net", `context/foundation/test-plan.md` §3 row 1) before planning its tests. Two risks:

- **#2** — A shared-UI refactor (layout / auth forms) breaks an authenticated flow (login, registration, reaching a protected page) without any test catching it. What must be proven: register → log in → reach a protected page → `context.locals.user` populated survives a refactor of `FormField`/`SubmitButton`/`Layout` and friends. Must NOT be proven via snapshot/visual diffs (named as wasted budget).
- **#5** — A new data-bearing route ships without being added to `PROTECTED_ROUTES`, leaving it reachable while unauthenticated. What must be proven: every data-bearing route (current and the ones S-01/S-02/S-03 are about to add — though research below shows they've actually already landed) redirects an unauthenticated visitor to login. Must NOT be proven by testing only the routes already in the list.

The test-plan also names an open infrastructure question this phase must resolve: **how to exercise a real route → API route → middleware → Supabase chain in Vitest without mocking** (§6.2 TBD; the team explicitly rejected mocks here on cost×signal grounds — "a mock would lie about row state and policy enforcement").

## Summary

**Risk #2 (auth/shared-UI flow):**
The chain is real and traceable end-to-end: `signin.astro`/`signup.astro` render React forms (`client:load`) that POST via plain HTML form submission (no client-side fetch/redirect — `useFormStatus()` only disables the button) to redirect-only API routes (`/api/auth/signin.ts`, `signup.ts`). Those routes call real `@supabase/ssr` methods, which set `Set-Cookie` session-token headers via `context.cookies.set()`, then `context.redirect()` to `/donations` (signin) or `/auth/confirm-email` (signup). On the *next* request, `src/middleware.ts` reconstructs the Supabase client from the incoming `Cookie` header, calls `supabase.auth.getUser()`, and populates `context.locals.user`. Protected pages (`profile.astro`, `donations.astro`, `donations/[id]/edit.astro`) then simply read `Astro.locals.user` with **no independent check of their own** — they trust the middleware completely. **The observable, assertable signal of "logged in" is exactly this two-request handshake**: (1) `Set-Cookie` + redirect from the API route, (2) `context.locals.user !== null` on the very next request to a protected page (provable by the page rendering protected content instead of redirecting to `/auth/signin`).

**Risk #5 (route protection):**
There are **two distinct, independently-maintained protection mechanisms** in this codebase, and a contract test must know which one governs which route:
1. **Page routes** (`.astro` files serving HTML) are gated centrally by `src/middleware.ts:5,19`: `PROTECTED_ROUTES = ["/profile", "/donations"]`, matched via `pathname.startsWith()` (prefix match, not exact). This is the "manually maintained list" risk #5 is about.
2. **API routes** (`/api/*`, including `/api/donations/export`) are **not** covered by `PROTECTED_ROUTES` at all — `/api/...` paths don't start with `/profile` or `/donations` — and instead each does its own inline `if (!context.locals.user) return context.redirect("/auth/signin")` check. This is confirmed as deliberate, documented precedent: the archived `calendar-ics-export` plan states explicitly that `/api/donations/export` "does NOT fall under PROTECTED_ROUTES; route must handle its own auth guard (same pattern as all `/api/` routes)".

The "manual list" fragility risk #5 worries about has **already manifested once**, on record: `donation-history-management`'s implementation review (`impl-review.md:53-61`) flagged that `/donations/[id]/edit` is protected only by accident of `startsWith("/donations")` prefix matching — it was never explicitly added to the list — and warned this breaks if matching ever becomes exact. Separately, `/dashboard` was deliberately *removed* from `PROTECTED_ROUTES` when it became a thin redirect stub (`authenticated-area-redesign` change) — so the list has both grown and shrunk by hand, twice, already.

**Test infrastructure (the open TBD):**
No mock-free way exists to exercise the full chain "for free" — three real options were investigated:
- **Astro Container API** — verified NOT viable: it never wires user middleware into its render pipeline (`NOOP_MIDDLEWARE_FN`); it would only let you hand-set `locals` and test rendering, which "lies" about exactly what risk #2 cares about (whether middleware actually populates `locals.user`).
- **(B) Spin up `astro dev`/`astro preview` + real `fetch`** — exercises the *entire* real chain (routing + middleware + Supabase) with zero internals mocked; heaviest cost (process lifecycle, port management, Docker-backed local Supabase, new CI infrastructure — current CI only runs lint+build).
- **(C) Call `onRequest`/`createContext` directly with a real Supabase backend** — exercises the real middleware function and a real local Supabase instance (which has `enable_confirmations = false`, so throwaway users + real session cookies can be created without email), but bypasses Astro's router; the test must hand-construct `context.url`/`params`, so a typo there could produce a false pass on routing/matching specifically — the very thing risk #5 cares about.

Both B and C require new Vitest setup work: `vitest.config.ts` is currently a bare `@` alias and cannot resolve the `astro:env/server` virtual module that `src/lib/supabase.ts` (and therefore `middleware.ts`) imports — Astro's own testing guide recommends `getViteConfig()` from `astro/config` for this.

## Detailed Findings

### Risk #2 — Auth flow wiring

**Form → API route chain (both signin and signup are structurally identical):**
- `src/pages/auth/signin.astro` — renders `Layout` + `AuthShell`, client-loads `SignInForm` (`client:load`), passes `serverError` from `?error=` query param
- `src/pages/auth/signup.astro` — same shape with `SignUpForm`
- `src/components/auth/SignInForm.tsx` — plain `<form method="POST" action="/api/auth/signin">`; client-side validation only blocks submission on invalid input (`e.preventDefault()`); on valid input it's a normal browser form POST (full page navigation, not `fetch`)
- `src/components/auth/SignUpForm.tsx` — same shape, posts to `/api/auth/signup`
- `src/components/auth/SubmitButton.tsx` — uses `useFormStatus()` from `react-dom` purely to disable the button while pending; **does not** inspect the response or navigate — all redirect behavior is server-driven
- `src/pages/api/auth/signin.ts` — null-checks `createClient()`, calls `supabase.auth.signInWithPassword()`; on error redirects to `/auth/signin?error=…`; **on success redirects to `/donations`**
- `src/pages/api/auth/signup.ts` — same shape; calls `supabase.auth.signUp()`; **on success redirects to `/auth/confirm-email`**
- `src/pages/api/auth/signout.ts` — calls `supabase.auth.signOut()`, redirects to `/`
- `src/pages/auth/confirm-email.astro` — IS part of the register→login chain (not a side path): it's the redirect target after successful signup; in `import.meta.env.DEV` it shows an auto-confirm message ("you can sign in now"), in prod shows "check your inbox"; both paths link back to `/auth/signin`

**The cookie/session mechanism that makes "logged in" observable:**
- `src/lib/supabase.ts` wraps `createServerClient` from `@supabase/ssr`, wiring `getAll()` (parses the incoming `Cookie` header into `{name, value}` pairs) and `setAll()` (writes outgoing cookies via `context.cookies.set()`)
- On successful `signInWithPassword`/`signUp`, the Supabase SSR client calls `setAll()` with session tokens (`sb-access-token`/`sb-refresh-token`-style cookies), which land in the HTTP response as `Set-Cookie` headers alongside the redirect
- The browser stores these and resends them as the `Cookie` header on the next request
- `src/middleware.ts:8,13-14` reconstructs the client from that `Cookie` header, calls `supabase.auth.getUser()`, and sets `context.locals.user`

**The assertable "logged in" signal, concretely:**
1. POST `/api/auth/signin` with valid creds → response has `Set-Cookie` + redirect to `/donations`
2. A subsequent GET `/donations` carrying those cookies renders the protected page (not a redirect to `/auth/signin`) — because `context.locals.user !== null`

**Shared-UI dependency surface (the refactor blast radius for risk #2):**
- `src/layouts/Layout.astro` — used by every page (auth + protected); pulls in `Banner.astro`, `OfflineBanner` (React), `UpdatePwaToast` (React)
- `src/components/AuthShell.astro` — used by every auth + protected page; pulls in `Topbar.astro`
- `src/components/Topbar.astro` — reads `Astro.locals.user` directly to render conditional login/profile/logout links — itself a piece of "shared UI that depends on the auth signal," not just UI that could break it
- `src/components/auth/{FormField,PasswordToggle,SubmitButton,ServerError}.tsx` — shared between `SignInForm`/`SignUpForm`, and `SubmitButton`/`ServerError` are *also* reused by `ProfileForm`, `DonationForm`, `DonationEditForm` (i.e., a refactor of `SubmitButton` has blast radius beyond auth)
- `src/components/profile/SelectField.tsx` — shared between `ProfileForm`, `DonationForm`, `DonationEditForm`

**A coupling worth flagging for the plan:** `src/middleware.ts:26-30` redirects an authenticated-but-incomplete-profile user from `/donations` to `/profile`. This means "register → login → reach a protected page" is not a 2-page chain but potentially a 3-page one (signin → `/donations` → redirected to `/profile`) depending on profile state — a naive test asserting "lands on `/donations`" would be brittle/wrong for a fresh account.

### Risk #5 — Route protection mechanism

**The middleware gate (the "manually maintained list"):**
```
src/middleware.ts:5   const PROTECTED_ROUTES = ["/profile", "/donations"];
src/middleware.ts:19  const isProtected = PROTECTED_ROUTES.some((route) => context.url.pathname.startsWith(route));
```
This is **prefix match**, not exact match — `/donations/123/edit` and `/donations/anything` are covered by the `"/donations"` entry without being separately listed.

**Current full route inventory** (`find src/pages -type f`):

| Route (path) | Kind | Data-bearing? | Protection mechanism |
|---|---|---|---|
| `/` (`index.astro`) | page | no | none needed |
| `/auth/signin`, `/auth/signup`, `/auth/confirm-email` | page | no | none needed (pre-auth) |
| `/dashboard` | page | **no — retired redirect stub** (`Astro.response.status = 302` → `/donations`) | none — deliberately removed from `PROTECTED_ROUTES` |
| `/profile` | page | yes | middleware `PROTECTED_ROUTES` (explicit entry) |
| `/donations` | page | yes | middleware `PROTECTED_ROUTES` (explicit entry) |
| `/donations/[id]/edit` | page | yes | middleware `PROTECTED_ROUTES` — **covered only by `startsWith("/donations")` prefix match, never explicitly listed** (flagged before, see Historical Context) |
| `/api/profile` | API (POST) | yes | **own inline check**: `context.locals.user` null → redirect `/auth/signin` (`src/pages/api/profile.ts:15-17`) |
| `/api/donations` | API (POST) | yes | own inline check (`src/pages/api/donations.ts:13-15`) |
| `/api/donations/[id]` | API (POST) | yes | own inline check (`src/pages/api/donations/[id].ts:14-16`) |
| `/api/donations/[id]/delete` | API (POST) | yes | own inline check (`src/pages/api/donations/[id]/delete.ts:11-13`) |
| `/api/donations/export` | API (GET) | yes | own inline check (`src/pages/api/donations/export.ts:18-21`) — **explicitly documented as outside `PROTECTED_ROUTES`** |
| `/api/auth/signin`, `signup`, `signout` | API | no (pre-auth / session-mutating, not data-reading) | n/a |

**Key architectural fact for the plan:** `/api/*` paths never match `PROTECTED_ROUTES` because none of them start with `/profile` or `/donations` (they start with `/api/`). This is not an oversight — it's the established, documented pattern (every `/api/*` route does its own `context.locals.user` check). A route-protection contract test that walks "every data-bearing route and asserts a redirect" must therefore either (a) scope itself to page routes governed by the middleware list, where the risk's "manually maintained list" framing actually applies, or (b) cover both tiers but assert via two different oracles (middleware list membership vs. inline-check presence) — conflating them would produce a test that "passes" for the wrong reason on one tier.

**Roadmap context check:** the change.md notes for this phase say new routes are "about to" land from S-01/S-02. Research shows they've actually **already shipped** — `donor-profile-setup` (S-01, status `implemented`), `eligibility-calculator-view` (S-02, status `impl_reviewed`), and `donation-history-management` (S-03, status `impl_reviewed`) all show their routes present in `src/pages` today. The route-protection contract test will be grounded against the *current*, already-larger route inventory above, not a smaller pre-S-01 one.

### Test infrastructure — how to exercise the chain without mocking

Three candidate approaches were evaluated against the test-plan's cost×signal bar (no MSW/mocks installed; only `vitest ^3` configured with a bare `@` → `src` alias; one existing test file is pure-function-only):

**A. Astro Container API (`experimental_AstroContainer`) — ruled out.**
Verified in `node_modules/astro/dist/container/index.js`: `createManifest()` is always called without the `middleware` argument, so user middleware is replaced by `NOOP_MIDDLEWARE_FN`. The only path that could inject real middleware (`createFromManifest`) is marked `@ts-expect-error` and explicitly experimental/undocumented for this purpose. **It cannot exercise `onRequest`** — using it would mean hand-setting `locals.user` and testing only page rendering, which is precisely the "the page renders, so it works" anti-pattern risk #2 names as something to challenge.

**B. Real server (`astro dev` / `astro preview`) + `fetch` against it.**
- Exercises the entire real chain — HTTP → Astro router → middleware → API route → real Supabase — nothing mocked
- `package.json` already has `dev`/`preview`/`build` scripts that could run as a child process
- Cost: process lifecycle + port management + startup-readiness race + a running local Supabase (Docker-backed `supabase start`, slow on first run) + new CI infrastructure (current `.github/workflows/ci.yml` runs only `lint` + `build` — no server-spin-up precedent exists)
- Closest to "real"; nothing about the chain is left unproven

**C. Direct `onRequest`/`createContext` invocation with a real local Supabase backend.**
- `astro/middleware` is a real, stable package export (`createContext`, `defineMiddleware`, `sequence`, …) documented as Astro's "low-level API for integrations/adapters that need to programmatically execute Astro middleware"
- `createContext()` builds a genuine `APIContext` (real `AstroCookies`, real `redirect()` returning a `Response` with `Location`)
- The local Supabase instance (`supabase/config.toml:151,154,169` — `enabled=true`, `site_url=http://127.0.0.1:3000`, **`enable_confirmations = false`**, `enable_signup = true`) lets a test create real throwaway users and obtain real session cookies via the auth API on port 54321 — no browser, no email needed
- Cost: lower than B (no server process), but the test must hand-construct `context.url`/`params` — a mismatch there (e.g., wrong pathname) would silently produce a false pass on exactly the routing/matching question risk #5 cares about
- **Does not** prove Astro's router → middleware wiring or the Cloudflare adapter's request/response translation — it proves "the middleware function, given a request shaped like X, does Y"

**Cross-cutting setup cost (applies to B and C equally):** `vitest.config.ts` currently cannot resolve the `astro:env/server` virtual module that `src/lib/supabase.ts` imports (and `middleware.ts` imports transitively). Astro's testing guide recommends `getViteConfig()` from `astro/config` in `vitest.config.ts` for exactly this. This is infrastructure work the plan must schedule regardless of which approach (B/C) it picks — and it's also the reason `eligibility.test.ts` (the only existing test) never had to deal with this: it tests pure functions with no `astro:*` imports.

No external precedent was found for "Astro middleware + Supabase + Cloudflare Workers integration testing" specifically — WebSearch surfaced only generic Cloudflare Workers Vitest-pool docs and Supabase mocking guides, none addressing this combination. `createContext` (approach C) is the only Astro-native primitive purpose-built for "execute middleware programmatically."

## Code References

- `src/middleware.ts:5` — `const PROTECTED_ROUTES = ["/profile", "/donations"]`
- `src/middleware.ts:19` — `pathname.startsWith()` prefix-match logic
- `src/middleware.ts:13-14` — `context.locals.user` populated from `supabase.auth.getUser()`
- `src/middleware.ts:26-30` — profile-completeness redirect (`/donations` → `/profile` if `sex` unset) — makes the "reach a protected page" chain conditionally 3 hops
- `src/lib/supabase.ts:6-25` — `createClient()`; `getAll`/`setAll` cookie wiring against `@supabase/ssr`
- `src/pages/api/auth/signin.ts` — redirect-only signin route; success → `/donations`
- `src/pages/api/auth/signup.ts` — redirect-only signup route; success → `/auth/confirm-email`
- `src/pages/api/auth/signout.ts` — signout route; → `/`
- `src/pages/auth/signin.astro`, `src/pages/auth/signup.astro`, `src/pages/auth/confirm-email.astro` — auth pages
- `src/components/auth/SignInForm.tsx`, `SignUpForm.tsx` — POST forms (`action="/api/auth/signin"` / `/signup`), client-side validation only
- `src/components/auth/{FormField,PasswordToggle,SubmitButton,ServerError}.tsx` — shared form primitives (SubmitButton/ServerError reused beyond auth)
- `src/layouts/Layout.astro`, `src/components/AuthShell.astro`, `src/components/Topbar.astro` — shared chrome; `Topbar.astro` reads `Astro.locals.user` directly
- `src/pages/profile.astro:8`, `src/pages/donations.astro:14`, `src/pages/donations/[id]/edit.astro:8` — protected pages; each does only `const { user } = Astro.locals`, no independent check
- `src/pages/dashboard.astro` — retired 302 redirect stub (`/donations`); intentionally not in `PROTECTED_ROUTES`
- `src/pages/api/profile.ts:15-17`, `src/pages/api/donations.ts:13-15`, `src/pages/api/donations/[id].ts:14-16`, `src/pages/api/donations/[id]/delete.ts:11-13`, `src/pages/api/donations/export.ts:18-21` — inline `context.locals.user` null-check + redirect pattern (the API-route protection tier)
- `vitest.config.ts` — current minimal config (bare `@` alias, no `getViteConfig`)
- `supabase/config.toml:151,154,169` — local auth config: `enabled=true`, `site_url=http://127.0.0.1:3000`, `enable_confirmations=false`, `enable_signup=true`
- `package.json:7-9,14` — `dev`/`build`/`preview`/`test` scripts
- `.github/workflows/ci.yml` — current CI runs `lint` + `build` only (no test execution, no server spin-up)

## Architecture Insights

- **Two-tier, independently-maintained route protection.** Page routes are gated centrally (middleware + `PROTECTED_ROUTES` prefix list); API routes self-guard inline. This split is deliberate and documented (the archived `calendar-ics-export` plan states it explicitly), but it means a single "every data-bearing route redirects" test cannot use one oracle — it must assert against two different mechanisms, or scope to the tier risk #5 actually targets (the manually-maintained list).
- **Redirect-only, two-request auth handshake.** Nothing in this app uses client-side fetch/JSON for auth — the entire flow is plain HTML form POST → server redirect → cookie-carried session on the next request. This matches the AGENTS.md hard rule ("API route errors redirect, they do not return JSON") and means the *only* way to observe "logged in" is the two-request `Set-Cookie` → `locals.user` handshake — there is no synchronous, single-request signal to assert on.
- **Pages trust the middleware completely; they are not a second line of defense.** `profile.astro`/`donations.astro`/`donations/[id]/edit.astro` read `Astro.locals.user` with zero redirect logic of their own. If the middleware's `PROTECTED_ROUTES` match ever fails to cover a route, the page itself will not catch it — it will simply render with `user = null` (and, per `profile.astro:14-20`, just skip the data fetch, rendering an empty form rather than erroring). This is exactly the silent-failure shape risk #5 describes.
- **Prefix matching is a known, live fragility — not hypothetical.** It has already produced one accidental "covered, but not listed" route (`/donations/[id]/edit`), flagged in a prior implementation review. The risk #5 scenario ("ships without being added to the list") is therefore better framed for this codebase as "ships at a path the prefix match doesn't cover" — e.g., a hypothetical future `/history` or `/account` page would NOT be silently caught by the existing `"/donations"`/`"/profile"` prefixes.
- **Shared UI components have asymmetric blast radii.** `SubmitButton`/`ServerError`/`SelectField` are reused well beyond the auth surface (into profile and donation forms); `Topbar` is both "shared UI that could break the auth signal's display" and "UI that depends on the auth signal" — a refactor risk in both directions.

## Historical Context (from prior changes)

- `context/changes/donation-history-management/reviews/impl-review.md:53-61` (F3) — **Direct precedent for risk #5's exact scenario**: flags that `/donations/[id]/edit` is protected only by `startsWith` prefix-match accident, not an explicit `PROTECTED_ROUTES` entry; recommends documenting the `startsWith` behavior with a comment. This is on-the-record evidence that the "manually maintained list" framing is not theoretical — it has already produced a near-miss.
- `context/changes/authenticated-area-redesign/plan.md:20,82-84` and `change.md` — Documents that `PROTECTED_ROUTES` used to include `"/dashboard"`, was deliberately removed when `/dashboard` became a redirect stub, and that `roadmap.md` had a stale documentation bug claiming the middleware protected only `/dashboard`. The list has changed by hand at least twice already (additions for S-01/S-02, removal for the redesign).
- `context/archive/2026-06-06-calendar-ics-export/plan.md:26,82-86` — Explicit, written confirmation that `/api/donations/export` (and "all `/api/` routes") are deliberately outside `PROTECTED_ROUTES` and self-guard via the same `context.locals.user` null-check + redirect pattern. Establishes the two-tier model as intentional, not accidental.
- `context/changes/eligibility-calculator-view/plan.md` (Phase 1) and its `reviews/plan-review.md:27-35,76-84` — First (and only) introduction of Vitest to this project; the plan-review flagged that `npm test` is **not wired into CI** (`.github/workflows/ci.yml` runs `lint`+`build` only) — green CI does not currently prove tests run — and that the alias should use `fileURLToPath()` not `.pathname`. Both are still true today and relevant to whatever this phase adds.
- `context/foundation/infrastructure.md` (risk matrix) — Two pre-existing platform risks touch this phase's surface directly: (1) a `nodejs_compat` + middleware bug where `context.locals.user` can serialize to `[object Object]` on SSR (workaround: `disable_nodejs_process_v2` compat flag); (2) `astro:env/server` schema gaps are silent at runtime (a secret set via `wrangler secret put` without a matching `envField` produces `undefined`, not an error).
- `context/changes/authenticated-area-redesign/plan.md:136` — The only documented "full chain" verification to date for this flow is a **manual** smoke test script: register → confirm-email → signin → land on `/donations` → add/edit donation → `/profile` → sign out. No automated test has ever exercised this chain — confirms risk #2 is genuinely uncovered ground.
- No prior change folder discusses how to set up integration tests against Astro middleware/Supabase — this phase is establishing that pattern from scratch (matches test-plan §6.2's "TBD — see §3 Phase 1").

## Related Research

None — this is the first `research.md` written under `context/changes/**` (verified via filesystem search; no other change folder has one yet).

## Open Questions

1. **B vs. C for the integration layer**: does the plan accept C's lower setup cost in exchange for not proving Astro's router/adapter wiring (and the small risk of a hand-constructed `context.url` producing a false pass on routing — the exact failure mode risk #5 cares about), or pay B's higher cost (new CI infrastructure: server spin-up + Docker-backed local Supabase) for a chain with nothing left unproven? This is squarely a planning decision the test-plan defers to research/plan, and research has now laid out the tradeoff with no clear "free" winner.
2. **Scope of the route-protection contract test**: should it cover only the middleware-gated page-route tier (where the "manually maintained list" framing of risk #5 literally applies), or also the self-guarding API-route tier (a different, already-consistent pattern with a different, simpler oracle: "does this handler check `context.locals.user`")? Conflating the two into one assertion would test the wrong thing for one tier.
3. **Fresh-account chain length**: should the risk #2 test assert the 2-hop chain (signin → `/donations`) or the 3-hop chain that a fresh, profile-incomplete account actually takes (signin → `/donations` → redirected to `/profile`)? The oracle here is profile-completeness state, which the test will need to control (seed a complete vs. incomplete profile) to make this deterministic rather than environment-dependent.
4. **CI wiring**: `npm test` still isn't in `.github/workflows/ci.yml` (flagged a phase ago and never resolved). Should this phase's plan also close that loop, given it's about to add the project's first non-pure-function tests — or is that explicitly out of scope for this phase and left as a follow-up?
5. **`disable_nodejs_process_v2` workaround**: does the chosen integration approach (B, which would run through the real Cloudflare adapter via `preview`/`wrangler dev`, vs. C, which bypasses the adapter) interact with the documented `context.locals.user` serialization bug (`infrastructure.md` risk matrix)? If approach B is chosen, the test environment needs that compat flag to avoid a false negative unrelated to the code under test.
