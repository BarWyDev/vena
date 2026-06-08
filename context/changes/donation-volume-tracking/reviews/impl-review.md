<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Donation Volume Tracking

- **Plan**: context/changes/donation-volume-tracking/plan.md
- **Scope**: All 4 phases
- **Date**: 2026-06-08
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

All 11 planned changes MATCH plan intent (no DRIFT/MISSING/EXTRA/scope creep).
Automated criteria re-run on final state: `npm run lint` clean, `npm run test`
26 passed, `npm run build` complete.

## Findings

### F1 — Volume validation logic is inline + untested

- **Severity**: 🟢 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/donations.ts:34-37 + src/pages/api/donations/[id].ts:38-41
- **Detail**: The `Number.isInteger(v) && v>0 && v<=2000` guard is duplicated inline in both routes and is the highest-risk logic in the change, yet it is the one piece without a unit test (the lib helpers are tested). `Number()` also leniently accepts `"1e3"`, `" 450 "`, `"0450"` — all benign (every accepted value is a bounded integer, and the DB CHECK backstops it), but untested.
- **Fix**: Extract `parseVolumeMl(raw): number | null` into src/lib/donations.ts, call from both routes, and cover it in src/lib/donations.test.ts.
- **Decision**: PENDING

### F2 — Backfill constants duplicated SQL ↔ TS

- **Severity**: 🟢 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: supabase/migrations/20260608160614_add_donation_volume.sql:18-20 vs src/lib/donations.ts (DEFAULT_VOLUME_ML)
- **Detail**: 450/600/220 live in both the migration and DEFAULT_VOLUME_ML. Both carry "keep in sync" comments, but it is a drift risk inherent to migrations being frozen snapshots (cannot import TS into SQL).
- **Fix**: None needed; the sync comments are the right call. Accept as-is.
- **Decision**: PENDING

### F3 — Summary card inlined instead of a VolumeSummary component

- **Severity**: 🟢 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: src/pages/donations.astro:80-105
- **Detail**: Plan offered a VolumeSummary.tsx "if it keeps the page clean"; it was inlined as static Astro (no JS island). Within plan intent — arguably the better call (zero client JS for a static readout). Not drift.
- **Fix**: None — accept as-is.
- **Decision**: PENDING
