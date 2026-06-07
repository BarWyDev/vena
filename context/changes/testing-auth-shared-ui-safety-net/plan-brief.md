# Auth & Shared-UI Regression Safety Net — Plan Brief

> Full plan: `context/changes/testing-auth-shared-ui-safety-net/plan.md`
> Research: `context/changes/testing-auth-shared-ui-safety-net/research.md`

## What & Why

Build the project's first integration-test layer to close two top-ranked
risks from `test-plan.md` §2: **#2** — a shared-UI/auth-form refactor silently
breaks login, registration, or reaching a protected page, with nothing
catching it; and **#5** — a new data-bearing route ships without being added
to the hand-maintained `PROTECTED_ROUTES` list, leaving it reachable while
unauthenticated. Both have already nearly bitten this project once
(`/donations/[id]/edit` was protected only by prefix-match accident; the only
existing full-chain check is a manual smoke script that's never been
automated).

## Starting Point

One existing test file (`eligibility.test.ts`, pure-function only). Vitest is
configured with a bare `@` alias that **cannot** resolve `astro:env/server` —
the module every auth-touching file imports transitively, so nothing beyond
pure functions is currently testable. No mocks are installed (by design — a
mock would lie about RLS and session state). CI runs `lint` + `build` only;
`npm test` has never executed there.

## Desired End State

`npm test` runs two real integration suites against a local Supabase
instance with nothing mocked: a route-protection contract test proving every
current data-bearing route (page and API tiers) redirects an unauthenticated
visitor, and an auth-flow test proving the real two-request handshake
(signin → cookie → `locals.user` populated) survives — both for valid
credentials and for a rejected wrong-credentials attempt. The same suite runs
in CI on every push/PR against a freshly started local Supabase instance, so
the safety net can't silently rot.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Integration approach | Direct `createContext`/handler invocation (research's "approach C") | Avoids building new server-process + Docker CI infrastructure from scratch; `createContext` derives `url` from the real `Request`, closing the "hand-typed `context.url` could mask a routing bug" concern research raised | Plan |
| Route-protection scope | Cover both tiers (page via `PROTECTED_ROUTES`, API via inline checks) with two separate oracles | Conflating them would test the wrong thing for one tier — they're independently maintained, different mechanisms | Plan |
| Auth-chain assertion | Seed a complete profile, assert the deterministic 2-hop chain (signin → `/donations`) | Isolates the auth-handshake signal from the separate profile-completeness redirect — a different code path and a different risk | Plan |
| Test-data lifecycle | Fresh throwaway accounts per run, unique emails, no explicit cleanup | Simplest; matches "local Supabase is disposable"; avoids teardown code that can itself leak on a crashed run | Plan |
| CI wiring | Add `npm test` to CI now, against a freshly-started local Supabase | This phase ships the project's first non-pure-function tests — shipping without CI wiring repeats a gap a prior review already flagged | Plan |
| Risk #2 edge case | Wrong-credentials login is rejected and `locals.user` stays null | Directly tests the failure side of the exact handshake risk #2 cares about — a refactor that lets bad creds "succeed" would be silent and severe | Plan |

## Scope

**In scope:**
- Vitest infrastructure to resolve `astro:env/server` and run real
  middleware/route-handler code against a local Supabase backend
- A reusable harness (`src/test/middleware-harness.ts`) for invoking route
  handlers and middleware without rendering pages
- Route-protection contract test covering both protection tiers
- Auth-flow integration test (happy path + wrong-credentials edge case)
- CI wiring for `npm test` against a local Supabase instance
- `test-plan.md` cookbook (§6.2, §6.4, §6.6) and rollout-status (§3) updates

**Out of scope:**
- Risks #1, #3, #4, #6 (separate rollout phases)
- E2E/Playwright (roadmap OQ-2 still open)
- Visual/snapshot tests on shared layout (test-plan §7 explicit exclusion)
- Spinning up a real HTTP server (`astro preview` + `fetch`) — research's
  "approach B," rejected for its CI-infrastructure cost
- The "already-authenticated visitor revisits `/auth/signin`" edge case — no
  documented contract exists to assert against
- A service-role Supabase client for fixture seeding — RLS already permits an
  authenticated account to seed its own profile row

## Architecture / Approach

A single harness module wraps Astro's `createContext` to build real
`APIContext`s, plus two thin invokers: one for calling an API route's exported
HTTP handler directly, one for calling the real `onRequest` middleware with a
non-rendering `next` stub that captures `context.locals.user`. A
cookie-chaining helper threads `Set-Cookie` from one invocation's
`AstroCookies` into the next request's `Cookie` header — this is how the
two-request handshake gets exercised without an HTTP layer or browser. Two
test suites consume this harness; CI wiring runs it all against a freshly
started local Supabase instance.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Test-harness infrastructure | `getViteConfig()`-based Vitest config + `middleware-harness.ts` (route/middleware invokers, cookie-chaining) | `astro:env/server` might not evaluate to real local-stack values inside Vitest — must verify empirically before any later phase can produce a non-null Supabase client |
| 2. Risk #5 — route-protection contract test | Parameterized test covering both protection tiers against the current route inventory | Accidentally mirroring `PROTECTED_ROUTES` instead of the filesystem reality would prove nothing about omissions — manual re-derivation step guards against this |
| 3. Risk #2 — auth-flow integration tests | Throwaway-account fixture helper + happy-path and wrong-credentials handshake tests | Cookie-chaining is easy to get subtly wrong (reading from the wrong context, mis-parsing `Set-Cookie`) — produces a silent false negative (always-redirected) rather than a crash |
| 4. CI wiring + close-out | `npm test` in CI against a freshly started local Supabase; cookbook (§6.2/§6.4/§6.6) and rollout-status (§3) updated | CI test env vars must point at the local stack, not the production `secrets.SUPABASE_URL`/`KEY` used for the build/deploy jobs — easy to mix up |

**Prerequisites:** A local Supabase instance running (`npx supabase start`) for local development of Phases 1-3; Docker available in CI for Phase 4 (GitHub's `ubuntu-latest` runners have it preinstalled).
**Estimated effort:** ~4 sessions across 4 phases — Phase 1 (infrastructure) and Phase 3 (cookie-chaining) are the two with real surprise risk; Phases 2 and 4 are comparatively mechanical once their predecessors land.

## Open Risks & Assumptions

- `astro:env/server` may not evaluate to the local stack's real values inside
  a plain-Node Vitest process the way it does under the Cloudflare adapter in
  dev — Phase 1 must verify this empirically and add env-loading if it
  doesn't "just work."
- The local Supabase anon key is assumed to be a deterministic, well-known
  local-dev value (obtainable via `npx supabase status`) — if the project's
  `config.toml` ever customizes the JWT secret, this assumption breaks and
  the fixture helper's constant needs updating.
- CI's Docker-backed `npx supabase start` is assumed to run within
  `ubuntu-latest`'s default resource/time budget — if it's slow on a cold
  runner, Phase 4 may need a longer job timeout.

## Success Criteria (Summary)

- `npm test` proves, with nothing mocked, that the real signin→cookie→`locals.user`
  handshake survives (and that wrong credentials are rejected), and that every
  current data-bearing route — across both protection tiers — redirects an
  unauthenticated visitor.
- The same suite runs and gates CI on every push/PR against a real local
  Supabase instance — a deliberately broken assertion fails the build, proving
  the gate gates rather than merely runs.
- `test-plan.md`'s cookbook no longer says "TBD" for integration tests or
  new-route protection tests — the next rollout phase can follow the
  established pattern without rediscovery.
