# Donation Volume Tracking — Plan Brief

> Full plan: `context/changes/donation-volume-tracking/plan.md`

## What & Why

Donors want to track how much blood they've cumulatively donated. We add a
per-donation `volume_ml` field (the donor enters it) and a running total on the
`/donations` view — headline in liters, breakdown in ml per type. This is a
deliberate scope expansion: the PRD currently lists "liters donated" as a
Non-Goal, which we reverse via a new FR-012.

## Starting Point

`donations` has `type` + `donated_at` but no volume. `/donations` already loads
donations server-side, computes eligibility, and renders history behind a
`hasDonations` guard. Pure logic lives in `src/lib/donations.ts` with a sibling
unit-test convention; API routes validate then redirect-on-error.

## Desired End State

Adding/editing a donation requires an "Ilość (ml)" field pre-filled with a
per-type default (450/600/220) the donor can override. When donations exist,
`/donations` shows a summary card: total in liters + per-type ml. History rows
show each volume. Existing rows are backfilled so the total is correct immediately.

## Key Decisions Made

| Decision              | Choice                                  | Why                                                      | Source |
| --------------------- | --------------------------------------- | ------------------------------------------------------- | ------ |
| Volume source         | User-entered per donation               | Matches the explicit request "user wpisuje ilość"       | Plan   |
| Field requiredness    | Required + editable per-type default    | Keeps the total complete; no NULLs in new rows          | Plan   |
| Column nullability    | `NOT NULL` + CHECK (1–2000) after backfill | Uniformly summable data; bounds guard typos          | Plan   |
| Existing rows         | Backfill per-type standard (450/600/220)| Total is meaningful from day one                        | Plan   |
| Presentation          | Liters headline + ml per type           | Liters read naturally as "ile oddałem"; ml gives detail | Plan   |
| Card visibility       | Only when donations exist               | Consistent with existing empty-state / `hasDonations`   | Plan   |
| PRD                   | Move Non-Goal → FR-012                   | Keep context as the single source of truth              | Plan   |

## Scope

**In scope:** `volume_ml` column + migration/backfill; type regen; domain helpers
(`DEFAULT_VOLUME_ML`, `sumVolume`, `sumVolumeByType`, `formatLiters`) + unit test;
insert/update API validation; volume input in both forms; per-row volume + summary
card; PRD FR-012.

**Out of scope:** badges/streaks/charts/goals; eligibility calc, `.ics`, RLS
changes; unit toggle; real historical volumes for old rows.

## Architecture / Approach

Standard vertical slice: migration (add → backfill → NOT NULL + CHECK) → regenerate
`database.types.ts` → pure helpers in `lib/donations.ts` (+ sibling test) → API
parse/validate → form number inputs with per-type defaults → display (history row +
summary card) → PRD. All aggregation is server-side O(n) over the donor's own rows.

## Phases at a Glance

| Phase                     | What it delivers                                  | Key risk                                            |
| ------------------------- | ------------------------------------------------- | --------------------------------------------------- |
| 1. Schema + Types         | `volume_ml` column, backfill, regenerated types   | Migration ordering (backfill before NOT NULL)       |
| 2. Domain Layer + Tests   | Defaults, sum/format helpers, unit test           | `formatLiters` Polish formatting edge cases         |
| 3. API + Forms            | Validated volume on insert/update; form inputs    | react-compiler rules on controlled default input    |
| 4. Presentation + PRD     | Per-row volume, summary card, FR-012              | Summary placement must respect `hasDonations` guard |

**Prerequisites:** Local Supabase stack running for migration + `gen-types`.
**Estimated effort:** ~1–2 sessions across 4 phases.

## Open Risks & Assumptions

- Backfilled volumes for old rows are estimates, not real measurements — accepted.
- Per-type defaults (450/600/220 ml) are reasonable RCKiK approximations; the donor
  can always override.
- No integration-test harness for API routes yet → invalid-volume paths verified
  manually.

## Success Criteria (Summary)

- Donor adds a donation with a volume and sees the total update in liters.
- Editing a donation's volume updates the total; history rows show each volume.
- `npm run lint`, `npm run build`, and `npm run test` pass; PRD records FR-012.
