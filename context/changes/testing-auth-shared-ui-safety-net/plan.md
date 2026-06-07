# Auth & Shared-UI Regression Safety Net — Implementation Plan

## Overview

Build the project's first integration-test layer to close test-plan §2 risks
**#2** (a shared-UI/auth-form refactor silently breaks login, registration, or
reaching a protected page) and **#5** (a new data-bearing route ships unprotected
because `PROTECTED_ROUTES` is a hand-maintained list). Establish the cookbook
patterns (`test-plan.md` §6.2/§6.4) other rollout phases will reuse, and close
the standing "tests aren't wired into CI" gap.

## Current State Analysis

- One existing test file, `src/lib/eligibility.test.ts` — pure-function only,
  no `astro:*` imports, no Supabase, no middleware.
- `vitest.config.ts` is a bare `@` → `src` alias. It cannot resolve the
  `astro:env/server` virtual module that `src/lib/supabase.ts` imports (and
  `src/middleware.ts`/every API route import transitively) — the blocker for
  any test that touches auth or the middleware.
- No mocks/MSW installed — by design. Per `test-plan.md` §1/§4, the risks this
  phase covers (RLS, real session cookies, real middleware wiring) are exactly
  what a mock would lie about.
- `.github/workflows/ci.yml` runs `lint` + `build` only. `npm test` exists as a
  script (`vitest run`) but has never executed in CI — flagged in a prior
  plan-review and never resolved (`research.md:174`).
- The local Supabase stack (`supabase/config.toml:150-156`) has
  `enabled = true`, `site_url = "http://127.0.0.1:3000"`,
  `enable_confirmations = false`, `enable_signup = true` — tests can create
  real throwaway accounts and get real, immediately-usable sessions with no
  email step.
- `.dev.vars` (gitignored, present locally) already points the app's
  `SUPABASE_URL`/`SUPABASE_KEY` at `http://127.0.0.1:54321` — the local stack —
  confirming local dev and these tests target the same instance.
- `supabase` CLI is already a `devDependency` (`^2.23.4`), runnable via
  `npx supabase ...` — no new install needed for CI.
- Astro exports `createContext`/`defineMiddleware`/`onRequest`-shaped handlers
  from `astro/middleware`. `createContext({ request, locals, ... })` builds a
  **real** `APIContext`: `url` is derived from `new URL(request.url)` (not
  hand-passed — closing the "typo'd `context.url` produces a false pass"
  concern `research.md:132` raised), `cookies` is a real `AstroCookies`
  wrapping the constructed `Request`, and `redirect()` returns a real
  `Response` with a `Location` header (`node_modules/astro/dist/core/middleware/index.js:13-45`).
- `profiles_insert_own` RLS policy (`supabase/migrations/20260603163127_init_profiles_donations.sql:78-80`)
  lets an **authenticated** user insert their own profile row. No service-role
  key or RLS bypass is needed to seed a complete profile for a throwaway
  account — the account's own session is sufficient.

## Desired End State

Running `npm test` exercises, against a real local Supabase backend with
nothing mocked:

1. **Route-protection contract test** — every current data-bearing route
   (page-tier, governed by `PROTECTED_ROUTES`; API-tier, self-guarding via
   inline checks) redirects an unauthenticated visitor to `/auth/signin`.
2. **Auth-flow integration test** — the real two-request handshake (POST
   `/api/auth/signin` → `Set-Cookie` + redirect; the next request →
   `context.locals.user` populated, landing on `/donations`) survives for a
   valid-credentials account, and is correctly rejected for wrong credentials.

`npm test` runs in CI on every push/PR against a freshly started local Supabase
instance. `test-plan.md` §6.2/§6.4 describe the established harness pattern,
§6.6 carries this phase's note, and §3's Phase 1 row reads `complete`.

### Key Discoveries

- `src/middleware.ts:5,19` — `PROTECTED_ROUTES = ["/profile", "/donations"]`,
  matched via `pathname.startsWith()` (prefix, not exact).
- `src/middleware.ts:26-30` — an authenticated-but-incomplete-profile user is
  redirected `/donations` → `/profile`; a fresh throwaway account would take a
  3-hop chain unless its profile is seeded complete first.
- `src/pages/api/auth/signin.ts:19` / `signup.ts:19` — success redirects to
  `/donations` / `/auth/confirm-email` respectively; both are plain
  `context.redirect()` calls returning real `Response`s with `Location`.
- `/api/*` routes never match `PROTECTED_ROUTES` (none start with `/profile`
  or `/donations`) — each does its own
  `if (!context.locals.user) return context.redirect("/auth/signin")`
  (`research.md:104-109` enumerates all five). This is documented, deliberate
  precedent (`context/archive/2026-06-06-calendar-ics-export/plan.md:82-86`),
  not an inconsistency to "fix."
- `AstroCookies.headers()` (`node_modules/astro/dist/core/cookies/cookies.js:169`)
  yields the outgoing `Set-Cookie` strings — the mechanism for chaining a
  session from a signin response into the next request's `Cookie` header.

## What We're NOT Doing

- Risks #1, #3, #4, #6 — separate rollout phases (`test-plan.md` §3 rows 2-4).
- E2E/Playwright — roadmap OQ-2 (framework choice) is still open and out of
  this phase's scope (`test-plan.md` §4).
- Visual/snapshot tests on shared layout — explicitly excluded by `test-plan.md`
  §7 ("they break on every tweak and catch nothing real").
- Spinning up a real HTTP server (`astro dev`/`preview`) and hitting it with
  `fetch` (research's "approach B") — rejected in favor of direct
  `createContext`/handler invocation ("approach C") to avoid building new
  server-process + port-management CI infrastructure from scratch.
- Testing the "already-authenticated visitor revisits `/auth/signin`" edge
  case — no documented contract exists for this path (research never traced
  it), and asserting against undocumented current behavior would be exactly
  the oracle-from-implementation anti-pattern this lesson warns against.
- A service-role Supabase client / RLS bypass for fixture seeding — the
  authenticated-account insert path (`profiles_insert_own`) is sufficient,
  simpler, and a more realistic oracle (it's the same write path
  `/api/profile` uses).
- Investigating the `disable_nodejs_process_v2` / `locals.user` serialization
  bug noted in `infrastructure.md` — it is specific to the real Cloudflare
  adapter path (research's "approach B"), which this plan does not exercise.

## Implementation Approach

Build one small, reusable harness around Astro's `createContext` plus the
project's real `onRequest` middleware and API route handlers, all invoked
directly against the real local Supabase backend — nothing mocked. Two test
suites consume it:

1. **Route-protection (risk #5) first** — it only needs *unauthenticated*
   contexts (`locals.user = null`), so it exercises and validates the harness's
   simpler invocation shape before the auth-flow suite adds account creation
   and cookie-chaining on top.
2. **Auth-flow (risk #2) second** — adds a throwaway-account fixture helper and
   the two-request cookie-chaining mechanism, then asserts the real handshake
   for both the happy path and the wrong-credentials rejection.

CI wiring closes the loop last, once there's something real to run in CI.

## Critical Implementation Details

**The harness must invoke two different shapes of "real code," not one.**
Risk #2's chain spans both an API route's exported HTTP handler (`signin.ts`'s
`POST`, which performs the actual `signInWithPassword` and sets cookies) *and*
the middleware's `onRequest` (which reads those cookies back and populates
`locals.user` on the next request). These are different function shapes —
`POST: APIRoute = async (context) => Response` vs.
`onRequest = defineMiddleware(async (context, next) => Response)` — and the
harness needs a thin, distinct invocation helper for each. For `onRequest`,
`next` must be a stub that returns a sentinel `Response` *without rendering any
Astro page* — rendering would reintroduce exactly the "the page renders, so it
works" anti-pattern risk #2 names as the thing to challenge. The stub should
also capture `context.locals.user` at the moment `next` is called, since that
captured value — not the page output — is the assertable proof of "logged in."

**Cookie-chaining is two-step and asymmetric.** After invoking `signin.ts`'s
`POST`, the session cookies live in `context.cookies` (an `AstroCookies`
wrapping the *constructed* request), not on the returned `Response` object
directly — `AstroCookies.headers()` yields the `Set-Cookie` strings. The
harness must read them from the context used for the *first* call, parse each
`name=value` pair, and fold them into a single `Cookie:` header string for the
*second* call's constructed `Request`. Getting this wrong produces a context
that looks plausible but never carries a session — silently turning the "logged
in" assertion into a false negative (always redirected) rather than a crash,
so the harness's own correctness is worth a focused look in review.

**`astro:env/server` needs real local-instance values inside the Vitest
process — verify this empirically before writing any test that invokes real
route/middleware code.** `getViteConfig()` makes the *module* resolvable, but
`SUPABASE_URL`/`SUPABASE_KEY` must also *evaluate* to the local stack's
`http://127.0.0.1:54321` + matching anon key inside the test process, or
`createClient()` returns `null` and every test silently exercises the
"Supabase not configured" branch instead of the real chain (a false pass that
looks like a pass). `.dev.vars` already carries the right values for local dev
under the Cloudflare adapter, but Vitest runs in plain Node — confirm whether
Astro/Vite's env loading already picks them up (e.g. via `.env`/`process.env`)
and, if not, load `.dev.vars` into `process.env` before the suite runs (e.g.
`vitest.config.ts`'s `test.env`, or a `setupFiles` entry that parses it). This
gate blocks every test phase after this one — resolve it in Phase 1, not later.

## Phase 1: Test-harness infrastructure

### Overview

Make `astro:env/server` (and the local Supabase backend it points at)
resolvable and usable inside Vitest, and build the two harness primitives
every later phase imports: one to invoke an API route's exported HTTP handler,
one to invoke the real `onRequest` middleware with an observable, non-rendering
`next` stub — plus the cookie-chaining helper between them.

### Changes Required:

#### 1. Vitest config

**File**: `vitest.config.ts`

**Intent**: Replace the bare-alias config with `getViteConfig()` from
`astro/config` so Vitest resolves Astro's virtual modules
(`astro:env/server`, `astro:middleware`, …) the same way `astro dev`/`build`
do — the blocker every subsequent phase depends on.

**Contract**: Export `getViteConfig({ test: { ... } })`, preserving the
existing `@` → `src` alias but switching it from `new URL(...).pathname` to
`fileURLToPath(new URL(...))` per the standing cross-platform note from
`eligibility-calculator-view`'s plan-review (`research.md:174`). Wire whatever
mechanism the empirical check above determines is needed to make
`SUPABASE_URL=http://127.0.0.1:54321` and the local anon key evaluate inside
`astro:env/server` during `vitest run`.

#### 2. Test harness module

**File**: `src/test/middleware-harness.ts` (new)

**Intent**: Provide the invocation primitives described in "Critical
Implementation Details" above, so route-protection and auth-flow tests can
each focus on their own assertions rather than re-deriving how to call real
Astro code.

**Contract**: Exposes (names indicative, not prescriptive):
- a context builder that takes `{ method, pathname, params?, formData?,
  cookieHeader?, locals? }` and returns a real `APIContext` via
  `createContext({ request: new Request(url, init), params, locals })`, where
  `url` is built from `pathname` against the local `site_url`
  (`http://127.0.0.1:3000`, matching `supabase/config.toml:154`)
- a route-handler invoker: `await handler(context)`, returning the real
  `Response`
- a middleware invoker that calls the project's real `onRequest` with a `next`
  stub returning a sentinel `Response` and capturing `context.locals.user` at
  call time, returning both the middleware's `Response` and the captured user
- a cookie-chaining helper that reads `context.cookies.headers()` from a prior
  invocation's context and folds the `Set-Cookie` pairs into a `Cookie` header
  string for the next context builder call

### Success Criteria:

#### Automated Verification:

- [ ] Lint passes (includes type-checked rules per AGENTS.md): `npm run lint`
- [ ] `npx vitest run` completes without module-resolution errors — i.e.
      importing `src/middleware.ts` (and therefore `astro:env/server`) inside
      a test file no longer throws, and the existing
      `src/lib/eligibility.test.ts` suite still passes unchanged

#### Manual Verification:

- [ ] Confirm empirically (e.g. a throwaway `console.log` inside a test, removed
      before commit) that `createClient()` returns a real client — not `null`
      — when invoked from inside a Vitest run, proving `SUPABASE_URL`/`SUPABASE_KEY`
      evaluate to the local stack's values inside the test process

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Risk #5 — route-protection contract test

### Overview

Prove every current data-bearing route redirects an unauthenticated visitor to
`/auth/signin` — across both independently-maintained protection tiers — using
the harness from Phase 1. This is the harness's first exercise against the
real `onRequest` and route handlers, and it needs no account creation
(`locals.user = null` throughout), keeping it the simpler suite to land first.

### Changes Required:

#### 1. Route-protection contract test

**File**: `src/test/route-protection.test.ts` (new)

**Intent**: Two parameterized suites, one per protection tier, each asserting
the *tier-appropriate* oracle — conflating them would, per `research.md:111`,
"test the wrong thing for one tier."
- **Page tier** (`research.md` table rows for `/profile`, `/donations`,
  `/donations/[id]/edit`): invoke the real `onRequest` with
  `locals.user = null` for each pathname; assert the middleware itself returns
  the redirect (does **not** call `next`) and the redirect target is
  `/auth/signin`. This is the literal "manually maintained list" oracle —
  membership in `PROTECTED_ROUTES` (or, for `/donations/[id]/edit`, prefix-match
  coverage of it).
- **API tier** (`research.md` table rows for `/api/profile`, `/api/donations`,
  `/api/donations/[id]`, `/api/donations/[id]/delete`, `/api/donations/export`):
  import each route's exported handler and invoke it directly with
  `locals.user = null`; assert it returns `context.redirect("/auth/signin")`
  itself — this tier's oracle is "does the handler check `locals.user`," not
  middleware membership.

**Contract**: Each case asserts both `response.status` is a redirect (`302`)
*and* `response.headers.get("Location") === "/auth/signin"` — not merely
"not 200," which would also pass for an unrelated server error and prove
nothing about protection. Dynamic-segment routes (`/donations/[id]/edit`,
`/api/donations/[id]`, `.../delete`) need a placeholder `params.id` (any
syntactically-valid UUID) — the inline/middleware checks run before any
by-id lookup, so the placeholder's value is immaterial to what's being proven.

### Success Criteria:

#### Automated Verification:

- [ ] `npx vitest run src/test/route-protection.test.ts` passes
- [ ] `npm run lint` passes

#### Manual Verification:

- [ ] Re-derive the route inventory from `find src/pages -type f` by hand and
      confirm every data-bearing route appears in the test's parameterized
      list — the test must assert against the *current filesystem reality*,
      not a copy of `PROTECTED_ROUTES` (which would "mirror the current
      config and prove nothing about omissions," `test-plan.md` §2 row 5
      anti-pattern column)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Risk #2 — auth-flow integration tests

### Overview

Prove the real two-request handshake — POST `/api/auth/signin` → `Set-Cookie` +
redirect, then a subsequent request → `context.locals.user` populated, landing
on `/donations` — survives for a valid-credentials account, and that wrong
credentials are correctly rejected (the chosen edge case: a refactor that
accidentally lets bad credentials "succeed," e.g. by setting a cookie on the
error path, would be a severe and silent auth bug this catches).

### Changes Required:

#### 1. Throwaway-account fixture helper

**File**: `src/test/auth-fixtures.ts` (new)

**Intent**: Create a real, disposable Supabase account per test (unique email,
e.g. timestamp- or uuid-suffixed — no explicit cleanup, matching the "local
instance is disposable" framing) and seed it with a *complete* profile
(`sex` set) so the post-login chain deterministically takes the 2-hop path
(`signin` → `/donations`) rather than the 3-hop profile-incomplete path
(`signin` → `/donations` → `/profile`) — isolating the auth-handshake signal
from the separate profile-completeness redirect, which is `middleware.ts:26-30`'s
concern, not risk #2's.

**Contract**: `createSeededAccount()` →
`{ email, password, userId, session }`. Internally: (1) `supabase-js`
`createClient(LOCAL_SUPABASE_URL, LOCAL_ANON_KEY).auth.signUp({ email,
password })` against the local stack (immediately confirmed —
`enable_confirmations = false` — and returns a usable session directly); (2)
using *that account's own authenticated client* (not a service-role client),
`.from("profiles").insert({ user_id: userId, sex: "male" })`, relying on the
`profiles_insert_own` RLS policy. `LOCAL_SUPABASE_URL`/`LOCAL_ANON_KEY` are the
local stack's well-known, deterministic local-dev values (obtain via
`npx supabase status`) — not secrets, and distinct from the
`SUPABASE_URL`/`SUPABASE_KEY` GitHub secrets used for the production build.

#### 2. Auth-flow integration test

**File**: `src/test/auth-flow.test.ts` (new)

**Intent**: Two cases sharing the harness and fixture helper:
- **Happy path**: seed an account; build a context for `POST /api/auth/signin`
  with its credentials as form data; invoke `signin.ts`'s `POST`; assert the
  response redirects to `/donations` *and* carries `Set-Cookie` headers; chain
  those cookies into a second context for `GET /donations`; invoke the real
  `onRequest`; assert it does **not** redirect (calls `next`) and that the
  captured `context.locals.user` is non-null and matches the seeded account's
  `userId`. This is the chain's "observable, assertable signal of logged in"
  named in `research.md:72-74` — proven without rendering any page.
- **Wrong-credentials edge case**: build a context for `POST /api/auth/signin`
  with the seeded account's email but a wrong password; invoke `signin.ts`'s
  `POST`; assert it redirects back to `/auth/signin?error=…` *and* carries no
  session-setting `Set-Cookie`; chain whatever cookies *are* present (there
  should be none session-bearing) into a second context for `GET /donations`;
  invoke `onRequest`; assert it redirects to `/auth/signin` and the captured
  `context.locals.user` is `null` — proving a rejected login can never reach a
  protected page, not merely that the first response "looked like" a rejection.

**Contract**: Both cases assert on the *captured* `context.locals.user` from
the middleware invocation (the real, observable proof) — never on page output,
and never by re-deriving "what `locals.user` should be" from the same
`getUser()` call the code under test makes (that would be the mirror-implementation
anti-pattern; the independent oracle here is the seeded account's own known
`userId`/credentials).

### Success Criteria:

#### Automated Verification:

- [ ] `npx vitest run src/test/auth-flow.test.ts` passes
- [ ] `npm run lint` passes
- [ ] Full suite passes: `npm test`

#### Manual Verification:

- [ ] Run the suite twice in a row locally and confirm both runs pass — each
      run creates a fresh throwaway account with a unique email, so a pass on
      run 2 (not just run 1) confirms the "no explicit cleanup" lifecycle
      choice doesn't cause cross-run interference
- [ ] Open Supabase Studio (`http://127.0.0.1:54323`) after a run and spot-check
      that the seeded accounts' `profiles` rows show `sex = 'male'` — confirming
      the fixture helper's RLS-respecting insert actually persisted, not just
      that the call didn't throw

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: CI wiring + cookbook close-out

### Overview

Wire `npm test` into CI against a freshly started local Supabase instance —
closing the standing "green CI doesn't prove tests run" gap this phase's tests
would otherwise inherit — and update `test-plan.md`'s cookbook and rollout
status to reflect the now-established pattern.

### Changes Required:

#### 1. CI workflow

**File**: `.github/workflows/ci.yml`

**Intent**: Add steps to the existing `ci` job (after `npm ci`, before or
alongside the existing `lint`/`build` steps) that start a local Supabase
instance via the already-present `supabase` devDependency and run the test
suite against it — using the local stack's deterministic URL/keys, **not**
the `secrets.SUPABASE_URL`/`secrets.SUPABASE_KEY` GitHub secrets (those point
at the production instance used only for the `build`/`deploy` jobs).

**Contract**: New steps run `npx supabase start` (applies
`supabase/migrations/*.sql` automatically; GitHub's `ubuntu-latest` runners
have Docker preinstalled, so no new runner setup is needed) and then
`npm run test`, with `SUPABASE_URL`/`SUPABASE_KEY` env vars set to the local
stack's values (`http://127.0.0.1:54321` + the deterministic local anon key —
the same values `.dev.vars` carries locally, obtainable in the workflow via
`npx supabase status -o env` or hardcoded as the well-known local-dev
defaults). Place the test step before `build` so a broken safety net fails
fast, before spending the build step's time.

#### 2. Cookbook + rollout status sync

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the `TBD` placeholders this phase resolves with the
pattern it established, so the next rollout phase (#2, cross-account RLS
isolation) can reuse it without rediscovery.

**Contract**:
- §6.2 ("Adding an integration test"): describe the `createContext` +
  harness-invocation pattern from Phase 1 — location (`src/test/`), how to
  invoke a route handler vs. middleware, and the cookie-chaining mechanism —
  replacing the "TBD — see §3 Phase 1" placeholder.
- §6.4 ("Adding a test for a new data-bearing route"): describe how to extend
  `route-protection.test.ts`'s parameterized list for a newly-added route —
  which tier it falls into (page vs. API) and which oracle applies —
  replacing its "TBD" placeholder.
- §6.6 ("Per-rollout-phase notes"): append a 2-3 line note capturing what this
  phase taught (e.g. the two-shape harness requirement, the
  `astro:env/server`-in-Vitest gate, or whatever surprised the implementer most
  in practice).
- §3 (Phased Rollout table): change Phase 1's `Status` cell from
  `change opened` to `complete`.

### Success Criteria:

#### Automated Verification:

- [ ] CI workflow YAML is syntactically valid (e.g. `npx actionlint
      .github/workflows/ci.yml` if available, or a dry-run via `act`/inspection)
- [ ] `npm run lint` passes (covers the `test-plan.md` markdown only insofar
      as the repo's lint config touches it — otherwise this is a no-op
      sanity check that the phase didn't break anything else)

#### Manual Verification:

- [ ] Push the branch (or open a PR) and confirm the CI run shows a new test
      step that starts the local Supabase instance and runs `npm test`
      successfully — green for the right reason, not skipped or silently
      passing zero tests
- [ ] Confirm a deliberately-broken assertion (temporarily, e.g. asserting the
      wrong redirect target) makes the CI run fail at the test step — proving
      the gate actually gates, not merely runs
- [ ] Read back `test-plan.md` §6.2/§6.4/§6.6/§3 and confirm the placeholders
      are gone and the new text accurately describes what was actually built
      (not an aspirational restatement of this plan)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- None added by this phase — `eligibility.test.ts` remains the project's only
  pure-unit suite; this phase is entirely integration-layer by design (the
  risks it covers require real middleware/Supabase wiring, which a unit test
  would have to mock — exactly what cost×signal rules out here).

### Integration Tests:

- Route-protection contract test (Phase 2) — both protection tiers, current
  route inventory.
- Auth-flow handshake test (Phase 3) — happy path + wrong-credentials
  rejection, both ending in an assertion on the real, captured
  `context.locals.user`.

### Manual Testing Steps:

1. After Phase 1: confirm `createClient()` returns a real client inside a
   Vitest run (not `null`) — see Phase 1 manual verification.
2. After Phase 2: re-derive the route inventory from the filesystem by hand
   and cross-check it against the test's parameterized list.
3. After Phase 3: run the suite twice consecutively and inspect Supabase
   Studio to confirm seeded profile rows persisted with `sex` set.
4. After Phase 4: push and watch CI run the new test step against a freshly
   started local Supabase instance; deliberately break an assertion to prove
   the gate fails loudly.

## Performance Considerations

None — this is a local/CI test suite against a local Supabase instance with a
handful of cases; no production code paths or runtime performance budgets are
touched.

## Migration Notes

Not applicable — no schema or data migrations. The suite creates and discards
its own throwaway accounts on the disposable local instance (no cleanup step,
per the agreed test-data lifecycle).

## References

- Related research: `context/changes/testing-auth-shared-ui-safety-net/research.md`
- Test-plan rollout entry: `context/foundation/test-plan.md` §3 row 1, §6.2/§6.4/§6.6
- Reference unit test (existing pattern to extend, not replicate): `src/lib/eligibility.test.ts`
- Documented two-tier protection precedent: `context/archive/2026-06-06-calendar-ics-export/plan.md:82-86`
- Prior `startsWith` prefix-match near-miss: `context/changes/donation-history-management/reviews/impl-review.md:53-61`
- Only prior full-chain verification (manual smoke script): `context/changes/authenticated-area-redesign/plan.md:136`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Test-harness infrastructure

#### Automated

- [x] 1.1 Lint passes: `npm run lint` — aeed469
- [x] 1.2 `npx vitest run` completes without module-resolution errors; existing `eligibility.test.ts` suite still passes — aeed469

#### Manual

- [x] 1.3 Confirm `createClient()` returns a real client (not `null`) inside a Vitest run — aeed469

### Phase 2: Risk #5 — route-protection contract test

#### Automated

- [x] 2.1 `npx vitest run src/test/route-protection.test.ts` passes
- [x] 2.2 `npm run lint` passes

#### Manual

- [x] 2.3 Re-derive the route inventory from `find src/pages -type f` and confirm every data-bearing route is covered by the test's parameterized list

### Phase 3: Risk #2 — auth-flow integration tests

#### Automated

- [ ] 3.1 `npx vitest run src/test/auth-flow.test.ts` passes
- [ ] 3.2 `npm run lint` passes
- [ ] 3.3 Full suite passes: `npm test`

#### Manual

- [ ] 3.4 Run the suite twice consecutively and confirm both runs pass (no cross-run interference from unique-email accounts)
- [ ] 3.5 Inspect Supabase Studio and confirm seeded `profiles` rows show `sex = 'male'`

### Phase 4: CI wiring + cookbook close-out

#### Automated

- [ ] 4.1 CI workflow YAML is syntactically valid
- [ ] 4.2 `npm run lint` passes

#### Manual

- [ ] 4.3 CI run shows the new test step starting local Supabase and running `npm test` successfully
- [ ] 4.4 A deliberately-broken assertion makes the CI run fail at the test step
- [ ] 4.5 `test-plan.md` §6.2/§6.4/§6.6/§3 read back accurately and placeholders are gone
