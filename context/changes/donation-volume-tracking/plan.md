# Donation Volume Tracking Implementation Plan

## Overview

Add a per-donation `volume_ml` field that the donor enters, and surface a running
total of blood donated — headline in liters plus a per-type breakdown in ml — on
the `/donations` view. This converts Vena from a pure eligibility calculator into
a calculator that also tracks cumulative output, which requires promoting "liters
donated" from a PRD Non-Goal to a new functional requirement (FR-012).

## Current State Analysis

- **Schema** (`supabase/migrations/20260603163127_init_profiles_donations.sql`):
  `public.donations` has `id, user_id, type, donated_at, created_at` — no volume
  column. RLS is enabled with per-command owner policies scoped to the whole row,
  so a new column inherits protection automatically (no policy edit needed).
- **Generated types** (`src/db/database.types.ts`): hand-edited file is forbidden;
  regenerated via `npm run gen-types` from the local Supabase stack. The
  `donations` Row/Insert/Update shapes must be regenerated, not patched.
- **Domain layer** (`src/lib/donations.ts`): pure helpers (`getLatestPerType`,
  `getLatestIds`) plus `getDonations`, `updateDonation`, `deleteDonation`, and a
  `DONATION_TYPE_LABELS` map. This is the established home for new pure functions.
- **API routes**: `src/pages/api/donations.ts` (insert) and
  `src/pages/api/donations/[id].ts` (update) both parse `formData`, validate, and
  on any failure `context.redirect('/donations?error=…')` — never JSON (hard rule).
  Insert writes directly; update delegates to `updateDonation`.
- **Forms**: `DonationForm.tsx` (add) and `DonationEditForm.tsx` (edit) are React
  islands using `SelectField`, a styled native `<input type="date">`,
  `SubmitButton`, and `ServerError`. The add form derives a `today` default.
- **View** (`src/pages/donations.astro`): server-loads profile + donations,
  computes eligibility, and conditionally renders `EligibilityCards`,
  `DonationForm`, and `DonationHistory` behind a `hasDonations` guard.
- **History** (`DonationHistory.tsx`): renders each row's type label + formatted
  date with a delete-confirm flow.
- **Test convention**: pure logic gets a sibling unit test
  (`src/lib/eligibility.test.ts` next to `eligibility.ts`).
- **PRD** (`context/foundation/prd.md`): Non-Goals explicitly lists
  *"No donation statistics or gamification (liters donated, badges, streaks)"* —
  this change deliberately reverses that one line.

## Desired End State

A donor adding or editing a donation sees a required "Ilość (ml)" field
pre-filled with a per-type default (450 whole blood / 600 plasma / 220 platelets)
they can override. The `/donations` view shows, whenever at least one donation
exists, a summary card: a headline total in liters and a per-type breakdown in ml.
Each history row shows its volume. Existing donations are backfilled with the
per-type standard so the total is meaningful immediately. PRD records the feature
as FR-012.

Verify: add a donation with a custom volume → it appears in history with that
volume and the total updates; edit it → total reflects the edit;
`npm run lint && npm run build` pass; `npm run test` (donations unit test) passes.

### Key Discoveries:

- RLS policies are row-scoped (`auth.uid() = user_id`), so `volume_ml` needs no
  new policy — `supabase/migrations/20260603163127_*.sql:91-107`.
- The insert route writes the row inline; the update route goes through
  `updateDonation` in `src/lib/donations.ts:37` — both must learn `volume_ml`.
- `donations.astro:37` already computes `hasDonations`; the summary card hangs off
  the same guard, matching the existing empty-state contract.
- `Constants.public.Enums.donation_type` (`src/db/database.types.ts:218`) is the
  validation source already used by the API routes — reuse for the type→default map.

## What We're NOT Doing

- No gamification beyond a raw total — no badges, streaks, goals, or charts.
- No change to the eligibility calculator, `.ics` export, or RLS policies.
- No volume on the `profiles` table; volume is per-donation only.
- No unit toggle / user preference — liters headline + ml detail is fixed.
- No historical "real" volumes for old rows — backfill uses the per-type standard.
- No summary card when the donor has zero donations (matches current empty state).

## Implementation Approach

Follow the codebase's standard vertical slice: schema/migration → regenerate types
→ pure domain helpers (+ unit test) → API validation → form inputs → display +
docs. Make `volume_ml` `NOT NULL` (after backfilling existing rows) so new and old
data are uniformly summable; enforce sane bounds with a `CHECK`. Keep all new pure
logic in `lib/donations.ts` so the view and API stay thin.

## Phase 1: Schema + Types

### Overview

Add `volume_ml` to `donations`, backfill existing rows with the per-type standard,
then enforce `NOT NULL` + a bounds `CHECK`. Regenerate the TypeScript types.

### Changes Required:

#### 1. New migration

**File**: `supabase/migrations/<timestamp>_add_donation_volume.sql` (new)

**Intent**: Add the volume column, backfill historical rows so the total is
correct from day one, then lock the column to `NOT NULL` with a sanity bound.
Order is load-bearing: add nullable → backfill → set NOT NULL + CHECK.

**Contract**: `alter table public.donations add column volume_ml integer;` then
three `update … set volume_ml = <default> where type = '<type>' and volume_ml is
null;` (450 `whole_blood`, 600 `plasma`, 220 `platelets`), then
`alter table … alter column volume_ml set not null;` and
`add constraint donations_volume_ml_check check (volume_ml > 0 and volume_ml <= 2000);`.
Follow the existing migration's comment style. No RLS changes.

#### 2. Regenerate generated types

**File**: `src/db/database.types.ts` (regenerated, not hand-edited)

**Intent**: Reflect the new column in `donations` Row/Insert/Update.

**Contract**: Run `npm run gen-types` against the local stack. Resulting
`donations.Row.volume_ml: number`, `Insert.volume_ml: number`,
`Update.volume_ml?: number`. Do not hand-patch.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly on a fresh local DB: `npx supabase db reset`
- Types regenerate without diff drift beyond the new column: `npm run gen-types`
- Type checking / lint passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification:

- Existing donation rows show the per-type backfilled volume after reset.
- Inserting a row without `volume_ml` is rejected by the DB (NOT NULL holds).
- A row with `volume_ml = 0` or `> 2000` is rejected by the CHECK.

**Implementation Note**: After automated verification passes, pause for manual
confirmation before Phase 2.

---

## Phase 2: Domain Layer + Tests

### Overview

Add the per-type default map, the aggregation helpers, an ml→liters formatter, and
extend `updateDonation` to carry volume. Cover the pure logic with a unit test.

### Changes Required:

#### 1. Volume helpers

**File**: `src/lib/donations.ts`

**Intent**: Centralize all volume logic so API and view stay thin. Add the
per-type default map (form defaults + backfill values in one place), a total-sum
function, a per-type sum function, and a display formatter for liters.

**Contract**:
- `DEFAULT_VOLUME_ML: Record<DonationType, number>` = `{ whole_blood: 450, plasma: 600, platelets: 220 }`.
- `sumVolume(donations: DonationRow[]): number` — total ml.
- `sumVolumeByType(donations: DonationRow[]): Record<DonationType, number>` — ml per type, every type present (0 when none).
- `formatLiters(ml: number): string` — ml→liters, Polish decimal comma, 1–2 decimals (e.g. `5400` → `"5,4 l"`). Pure, no locale surprises.
- Extend `updateDonation(...)` signature with a `volumeMl: number` param and include `volume_ml` in the `.update({...})`.

#### 2. Unit test

**File**: `src/lib/donations.test.ts` (new, sibling of `donations.ts`)

**Intent**: Lock the aggregation + formatting behavior, mirroring
`eligibility.test.ts`.

**Contract**: Cover `sumVolume` (empty → 0, mixed rows), `sumVolumeByType`
(all types keyed, zeros for absent types), and `formatLiters` (comma decimal,
rounding, whole-liter case). Use the existing test runner/conventions.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test`
- Type checking / lint passes: `npm run lint`

#### Manual Verification:

- `formatLiters` output reads naturally in Polish (`"5,4 l"`, `"1 l"`, `"0,45 l"`).

**Implementation Note**: Pause for manual confirmation before Phase 3.

---

## Phase 3: API + Forms

### Overview

Parse and validate `volume_ml` on insert and update; add a required, per-type
pre-filled number input to both forms.

### Changes Required:

#### 1. Insert route

**File**: `src/pages/api/donations.ts`

**Intent**: Accept and validate `volume_ml`, then persist it.

**Contract**: Read `form.get("volume_ml")`, coerce to integer, validate
`> 0 && <= 2000`; on failure `context.redirect('/donations?error=…')` with a
Polish message (e.g. "Nieprawidłowa ilość krwi"). Include `volume_ml` in the
`insert({...})`. Keep existing type/date validation order.

#### 2. Update route

**File**: `src/pages/api/donations/[id].ts`

**Intent**: Same volume parse/validate, then pass to `updateDonation`.

**Contract**: Mirror the insert validation; call
`updateDonation(supabase, user.id, id, type, donatedAt, volumeMl)`.

#### 3. Add form

**File**: `src/components/donations/DonationForm.tsx`

**Intent**: Add a required "Ilość (ml)" number field whose default follows the
selected type via `DEFAULT_VOLUME_ML`.

**Contract**: `<input type="number" name="volume_ml" inputMode="numeric" min={1}
max={2000} step={50} required>` styled like the existing date input. Default value
tracks the `type` state through `DEFAULT_VOLUME_ML[type]` (React-controlled so it
updates when the type changes; respect react-compiler rules — no lint suppression).

#### 4. Edit form

**File**: `src/components/donations/DonationEditForm.tsx`

**Intent**: Same field, pre-filled from the existing donation's volume.

**Contract**: Same input contract; `defaultValue={donation.volume_ml}`.

### Success Criteria:

#### Automated Verification:

- Lint passes (incl. react-compiler at error level): `npm run lint`
- Build passes: `npm run build`

#### Manual Verification:

- Adding a donation with a custom volume persists that value.
- Changing the type in the add form updates the default volume.
- Submitting volume `0`, blank, or `> 2000` redirects back with the Polish error.
- Editing a donation's volume saves the new value.

**Implementation Note**: Pause for manual confirmation before Phase 4.

---

## Phase 4: Presentation + PRD

### Overview

Show each row's volume in history, add the summary card to `/donations` behind the
`hasDonations` guard, and update the PRD.

### Changes Required:

#### 1. History row volume

**File**: `src/components/donations/DonationHistory.tsx`

**Intent**: Surface each donation's volume next to its date.

**Contract**: Render `{row.volume_ml} ml` in the existing row layout, styled like
the date subtext. No layout restructure.

#### 2. Summary card

**File**: `src/pages/donations.astro` (and a small presentational component if it
keeps the page clean, e.g. `src/components/donations/VolumeSummary.tsx`)

**Intent**: Show total donated volume — liters headline + per-type ml breakdown —
whenever donations exist.

**Contract**: Compute `sumVolume(donations)` and `sumVolumeByType(donations)`
server-side; render headline `formatLiters(total)` plus a per-type list in ml using
`DONATION_TYPE_LABELS`. Place inside the existing `hasDonations` block, above or
beside `EligibilityCards`, styled with the page's card idiom (border/blur). Types
with 0 ml may be omitted from the breakdown.

#### 3. PRD update

**File**: `context/foundation/prd.md`

**Intent**: Record the scope change — remove the contradicting Non-Goal line and
add FR-012.

**Contract**: Delete the "No donation statistics or gamification (liters donated…)"
bullet from Non-Goals (or narrow it to badges/streaks only); add under "### Donations"
an `FR-012: Donor can record the volume (ml) of each donation and see their total
donated volume. Priority: should-have` with a one-line Socratic note explaining the
reversal.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Build passes: `npm run build`
- Unit tests still pass: `npm run test`

#### Manual Verification:

- With donations present, the summary card shows correct liters + per-type ml.
- With zero donations, no summary card renders (empty state unchanged).
- History rows show each volume; totals reconcile with the listed rows.
- PRD reads coherently with FR-012 and no contradictory Non-Goal.

**Implementation Note**: Final phase — confirm the full add→see-total→edit loop
manually.

---

## Testing Strategy

### Unit Tests:

- `sumVolume`: empty list → 0; mixed rows → correct sum.
- `sumVolumeByType`: all types keyed; absent types → 0.
- `formatLiters`: comma decimal, rounding, whole-liter and sub-liter cases.

### Integration Tests:

- None added in this change (no integration harness for API routes yet); covered
  by manual verification of the add/edit/redirect-on-invalid flows.

### Manual Testing Steps:

1. Reset local DB; confirm old rows backfilled per type.
2. Add a donation, change type, observe default volume shift; submit a custom ml.
3. Confirm history row shows the volume and the summary total updates.
4. Edit the donation's volume; confirm total reflects it.
5. Submit invalid volume (0 / blank / >2000); confirm redirect + Polish error.
6. Delete all donations; confirm summary card disappears.

## Performance Considerations

Aggregation is O(n) over a donor's own donations (small data volume per PRD), done
server-side in the existing single load — negligible cost.

## Migration Notes

Existing rows are backfilled with per-type standards (450/600/220 ml) before the
`NOT NULL` constraint is applied; these are estimates, not real measured volumes.
Rollback = drop the column (and constraint); no data dependency elsewhere.

## References

- Change identity: `context/changes/donation-volume-tracking/change.md`
- Schema baseline: `supabase/migrations/20260603163127_init_profiles_donations.sql`
- Domain layer: `src/lib/donations.ts:37`
- Insert route: `src/pages/api/donations.ts:33`
- Update route: `src/pages/api/donations/[id].ts:37`
- View guard: `src/pages/donations.astro:37`
- Test pattern: `src/lib/eligibility.test.ts`
- PRD Non-Goal being reversed: `context/foundation/prd.md` (Non-Goals)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema + Types

#### Automated

- [x] 1.1 Migration applies cleanly on a fresh local DB (`npx supabase db reset`)
- [x] 1.2 Types regenerate without drift beyond the new column (`npm run gen-types`)
- [x] 1.3 Type checking / lint passes (`npm run lint`)
- [x] 1.4 Build passes (`npm run build`)

#### Manual

- [x] 1.5 Existing rows show per-type backfilled volume after reset
- [x] 1.6 Insert without volume_ml rejected by NOT NULL
- [x] 1.7 volume_ml = 0 or > 2000 rejected by CHECK

### Phase 2: Domain Layer + Tests

#### Automated

- [ ] 2.1 Unit tests pass (`npm run test`)
- [ ] 2.2 Type checking / lint passes (`npm run lint`)

#### Manual

- [ ] 2.3 formatLiters output reads naturally in Polish

### Phase 3: API + Forms

#### Automated

- [ ] 3.1 Lint passes incl. react-compiler (`npm run lint`)
- [ ] 3.2 Build passes (`npm run build`)

#### Manual

- [ ] 3.3 Adding a donation with custom volume persists it
- [ ] 3.4 Changing type in add form updates default volume
- [ ] 3.5 Invalid volume (0 / blank / >2000) redirects with Polish error
- [ ] 3.6 Editing a donation's volume saves the new value

### Phase 4: Presentation + PRD

#### Automated

- [ ] 4.1 Lint passes (`npm run lint`)
- [ ] 4.2 Build passes (`npm run build`)
- [ ] 4.3 Unit tests still pass (`npm run test`)

#### Manual

- [ ] 4.4 Summary card shows correct liters + per-type ml when donations exist
- [ ] 4.5 No summary card renders with zero donations
- [ ] 4.6 History rows show each volume; totals reconcile
- [ ] 4.7 PRD reads coherently with FR-012 and no contradictory Non-Goal
