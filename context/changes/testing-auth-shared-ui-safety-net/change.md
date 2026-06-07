---
change_id: testing-auth-shared-ui-safety-net
title: Auth & shared-UI regression safety net (test-plan Phase 1)
status: implemented
created: 2026-06-07
updated: 2026-06-07
archived_at: null
---

## Notes

Open a change folder for rollout Phase 1 of context/foundation/test-plan.md: "Auth & shared-UI regression safety net".

Risks covered: #2 (a shared-UI refactor of layout/auth forms breaks an authenticated flow without any test catching it), #5 (a new data-bearing route ships without being added to PROTECTED_ROUTES, leaving it reachable while unauthenticated). Test types planned: integration (real form -> API route -> middleware chain), route-protection contract test.

Risk response intent:
- Risk #2: prove that register -> log in -> reach a protected page -> context.locals.user populated keeps working across shared layout/auth-form changes; challenge "the page renders, so it works"; avoid snapshot/visual diffs on layout or forms (the user named these as wasted budget).
- Risk #5: prove every data-bearing route (current and the ones S-01/S-02 are about to add) redirects an unauthenticated visitor to login; challenge "the middleware exists, so we are covered" (PROTECTED_ROUTES is a manually maintained list); avoid testing only routes already in the list.
