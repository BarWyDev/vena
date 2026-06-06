# Eligibility Calculator View — Plan Brief

> Full plan: `context/changes/eligibility-calculator-view/plan.md`

## What & Why

Build S-02 — the north star slice. Blood donors cannot reliably know when they are next permitted to donate; Vena's core value is computing that date per type from RCKiK rules. This slice delivers the minimal end-to-end flow that proves the product hypothesis: add a donation, see three per-type eligibility dates immediately. Calculator correctness is release-blocking per PRD NFR.

## Starting Point

Both prerequisites are shipped. F-01 created the `donations` table (typed, RLS-protected) and S-01 delivered the profile page, `sex` field, and middleware gating. The `/dashboard` is a stub with a profile link; no `/donations` route exists. No test runner is configured.

## Desired End State

A logged-in donor with a complete profile visits `/donations`, adds a donation record (type + date), and sees three glass cards — one per type — each showing the earliest permitted next-donation date per RCKiK rules. Clicking a card selects that type and stores `?type=` in the URL (S-04's ICS export reads it). Empty state shows explanatory text + the add form when no donations exist. Vitest unit tests prove every interval combination before any UI ships.

## Key Decisions Made

| Decision                | Choice                                                             | Why (1 sentence)                                                                     | Source |
| ----------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------ |
| Page location           | New `/donations` route                                             | S-03 will extend it into the full history view; dashboard stays a nav hub            | Plan   |
| Post-submit UX          | Redirect + server-rendered results                                 | Consistent with `api/profile.ts` pattern; no client-side fetch needed                | Plan   |
| Calculator display      | Three clickable glass cards                                        | Scannable per-type; natural click-to-select for FR-009                               | Plan   |
| Type selection (FR-009) | Card click → `?type=` URL param                                    | Zero extra UI; S-04 reads the param without re-touching the component                | Plan   |
| Unit testing            | Vitest added in Phase 1                                            | Release-blocking correctness criterion requires automated proof                      | Plan   |
| Test coverage           | All 6 sex×type combos + 2 edge cases                               | Covers the sex-specific whole-blood rule — the most common correctness bug           | Plan   |
| Empty state             | Explanatory text above always-visible form                         | Donor can act immediately; PRD US-01 AC requires explanatory empty state             | Plan   |
| History on this page    | None — defer to S-03                                               | Sharp S-02 scope; calculator result implies the last donation                        | Plan   |
| Date validation         | Server rejects future dates                                        | Prevents calculator from producing a "past eligible" date — a silent correctness bug | Plan   |
| Polish labels           | whole_blood→"Krew pełna", plasma→"Osocze", platelets→"Płytki krwi" | Standard RCKiK vocabulary                                                            | Plan   |
| S-04 integration        | `?type=` URL param via `history.replaceState`                      | S-04 adds an export button that reads the URL; no S-02 component rework needed       | Plan   |

## Scope

**In scope:** `/donations` page, `DonationForm` component, `EligibilityCards` component (with type selection), `src/lib/eligibility.ts` (pure calculator), `src/lib/donations.ts` (data layer), `src/pages/api/donations.ts` (POST route), Vitest + 8 unit tests, middleware update, dashboard link.

**Out of scope:** Donation history list/edit/delete (S-03), ICS calendar export (S-04), E2E test framework, confirmation dialogs, donation statistics or gamification.

## Architecture / Approach

The `/donations` Astro page server-fetches profile (`sex`) and all donations in parallel, calls `calculateEligibility` synchronously server-side, and passes results as props to two `client:load` React components. No client-side fetch needed — the result is ready on the initial server render and after every redirect. Card selection is the only client interaction: a `button` click sets React state + calls `history.replaceState`, updating `?type=` in the URL without a network round-trip. The pure `eligibility.ts` module has no Supabase or Astro imports, making it trivially importable by Vitest.

## Phases at a Glance

| Phase                                    | What it delivers                                                          | Key risk                                                                                |
| ---------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1. Calculator engine + Vitest            | Pure `calculateEligibility` + 8 unit tests prove all RCKiK rules          | UTC date arithmetic bug silently shifts dates by ±1 day — addressed in Critical Details |
| 2. Donation data layer + API             | `donations.ts`, POST route with server-side validation, middleware update | Future `donated_at` produces a stale eligibility date — rejected server-side            |
| 3. /donations page + UI + dashboard link | Full end-to-end flow: form → redirect → cards; dashboard entry point      | Three-card layout needs enough horizontal space — `max-w-2xl` container                 |

**Prerequisites:** F-01 (schema) ✓ and S-01 (profile + gating) ✓ — both fully shipped.
**Estimated effort:** ~2-3 sessions across 3 phases.

## Open Risks & Assumptions

- No E2E test framework — the primary success criterion in the PRD ("automated E2E test covering register → profile → donate → calculate → export passes") cannot be fully met until the E2E framework open question is resolved (roadmap OQ-2). Unit tests + manual verification substitute for this slice.
- `?type=` URL param written by card click and read by S-04: this is an implicit interface contract. S-04 must not change this param name without updating the EligibilityCards write path.

## Success Criteria (Summary)

- `npm test` passes 8/8: every RCKiK interval combination and edge case is correct.
- A logged-in donor adds a donation and sees the correct per-type eligibility dates within ~1 second.
- Unauthenticated or incomplete-profile access to `/donations` redirects appropriately.
