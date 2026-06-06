# Eligibility Calculator View Implementation Plan

## Overview

Build roadmap S-02 — the north star slice. A logged-in donor with a completed profile visits `/donations`, adds a donation record (type + date), and immediately sees the earliest permitted date per donation type (whole blood, plasma, platelets), computed by the RCKiK interval rules. Calculator correctness is a release-blocking requirement; Vitest unit tests lock it in before any UI or API code is written.

## Current State Analysis

- **Prerequisites done.** F-01 (schema) and S-01 (profile page + gating) are fully shipped. `donations(id, user_id, type: donation_type, donated_at: date, created_at)` table exists, typed, RLS-protected. The middleware redirects donors with `sex` unset to `/profile` before they can reach any protected route.
- **`donation_type` enum values:** `whole_blood | plasma | platelets` (underscored, machine values).
- **RCKiK intervals (PRD §Business Logic):** whole blood male 56 days / female 84 days; plasma 14 days; platelets 28 days.
- **Established patterns:** `src/lib/profile.ts` + `src/pages/api/profile.ts` + `src/pages/profile.astro` + `src/components/profile/ProfileForm.tsx` are the direct templates to mirror. Redirect-only API routes (AGENTS.md hard rule). `context.locals.user` via middleware, never `getUser()` in pages.
- **No test runner.** `package.json` has no test script; Vitest must be added in Phase 1.
- **UI primitives available.** `SelectField`, `SubmitButton`, `ServerError`, `lucide-react` icons — all reusable without modification.
- **Dashboard** (`src/pages/dashboard.astro`) is a stub with a `/profile` link — needs a `/donations` CTA.

## Desired End State

A logged-in donor with a complete profile visits `/donations`. They see explanatory Polish text (empty state) above an always-visible add-donation form. They pick a donation type and a date (native date picker, default today), submit, and land on `/donations?added=1&type=<type>` showing three glass cards — one per donation type — each displaying the earliest permitted date. Clicking a card highlights it and updates the URL to `?type=<value>` (S-04 reads this to drive ICS export). With no recorded donations only the empty-state text and form show; cards appear once at least one donation exists.

**Verification:** `npm test` passes (8/8 green); `npm run build` and `npm run lint` pass; a full round-trip adds a donation and produces a correctly-dated card; all three types produce correct dates after three donations; empty state shows for a fresh donor.

### Key Discoveries:

- `donations` table has an index on `(user_id, donated_at desc)` from F-01 — latest-per-type query is index-served.
- `SelectField` (`src/components/profile/SelectField.tsx`) takes `{ id, name, label, value, onChange, options, required?, error?, icon }` — reuse as-is for the donation type field.
- `SubmitButton` and `ServerError` are drop-in from `src/components/auth/`.
- `PROTECTED_ROUTES.some((r) => pathname.startsWith(r))` at `src/middleware.ts:5` — adding `"/donations"` is one entry.
- `astro:env/server` imports live only in `src/lib/supabase.ts`. `eligibility.ts` must stay pure (no Supabase or Astro imports) so Vitest can import it without env mocking.
- Vite is overridden to `^7.3.2` (package.json `overrides`); Vitest `^3` is compatible.
- Package uses `"type": "module"` — vitest config must use ESM (`import.meta.url` not `__dirname`).

## What We're NOT Doing

- Not building donation history list/edit/delete — that is S-03.
- Not building ICS export — that is S-04; S-02 only sets the `?type=` URL param S-04 will consume.
- Not showing any donation history on `/donations` — form + calculator results only.
- Not adding an E2E test framework — unit tests only; E2E decision deferred per roadmap open question.
- Not building a confirmation dialog for anything — no delete actions in this slice.

## Implementation Approach

Phase-first: the pure calculator function and its tests land in Phase 1 so correctness is proven before any integration code is written. Then the data layer and API route (mirroring the profile pattern exactly). Then the page and UI components. The `/donations` page fetches profile + donations server-side, computes eligibility synchronously via `calculateEligibility`, and passes results as props to `client:load` React components — no client-side fetch needed. Card type selection uses `history.replaceState` to update `?type=` in the URL without a page reload.

## Critical Implementation Details

- **UTC date arithmetic in the calculator.** `donated_at` is a `date` column (no time component). Parse it as UTC midnight (`new Date(dateStr + "T00:00:00Z")`), add days via `setUTCDate`, and serialize with `toISOString().split("T")[0]`. Using `new Date(dateStr)` (local-time parse) shifts the date by one day in timezones east of UTC — a silent correctness bug.
- **`?type=` + `?added=1` coexistence.** The API route on success redirects to `/donations?added=1&type=<submitted_type>`. When the donor clicks a different card, `history.replaceState` sets `/donations?type=<new_type>`, which replaces the full URL and removes `?added=1`. This is intentional — the success banner is ephemeral.

---

## Phase 1: Calculator engine + Vitest

### Overview

Add Vitest, write the pure `calculateEligibility` function, and prove all RCKiK interval rules with a deterministic test suite. No UI, no API, no DB queries — entirely self-contained and verifiable with `npm test` before any other code is written.

### Changes Required:

#### 1. Install Vitest and add test script

**File**: `package.json`

**Intent**: Add Vitest as a dev dependency and expose a `"test"` script.

**Contract**: New `devDependencies` entry `"vitest": "^3"`. New `scripts` entry `"test": "vitest run"`. Run `npm install` to lock the installed version.

#### 2. Vitest configuration

**File**: `vitest.config.ts`

**Intent**: Configure Vitest with the `@/` path alias so `eligibility.test.ts` can import from `@/lib/eligibility` without Astro's build system. Uses ESM `import.meta.url` (project is `"type": "module"`).

**Contract**: `defineConfig` from `vitest/config`. `resolve.alias` maps `"@"` to `new URL("./src", import.meta.url).pathname`. No additional plugins needed — tests are plain TypeScript.

#### 3. Calculator pure function

**File**: `src/lib/eligibility.ts`

**Intent**: Single source of truth for RCKiK eligibility interval logic. Pure function — no Supabase, no Astro, no side effects. Imported by the Astro page (server-side computation) and the test suite.

**Contract**:

- Imports `Database` from `@/db/database.types` for type derivation only.
- Exports `DonationType` = `Database["public"]["Enums"]["donation_type"]`, `Sex` = `Database["public"]["Enums"]["sex"]`, `EligibilityResult` = `Record<DonationType, string | null>`.
- Exports `DONATION_TYPES: DonationType[]` = `["whole_blood", "plasma", "platelets"]` — canonical display order.
- Internal `INTERVALS_DAYS: Record<DonationType, Record<Sex, number>>` = `{ whole_blood: { male: 56, female: 84 }, plasma: { male: 14, female: 14 }, platelets: { male: 28, female: 28 } }`.
- Exports `calculateEligibility(latestDonations: Partial<Record<DonationType, string>>, sex: Sex): EligibilityResult`. For each type: if absent from `latestDonations`, result is `null`; otherwise parse the date string as UTC midnight, add the sex-specific interval via `setUTCDate`, serialize to `YYYY-MM-DD` via `toISOString().split("T")[0]`.

#### 4. Calculator unit tests

**File**: `src/lib/eligibility.test.ts`

**Intent**: Prove all six RCKiK interval combinations and two edge cases using fixed input dates — deterministic and independent of system clock.

**Contract**: Eight `it` cases using fixed input `"2026-01-01"` and the following expected outputs (verified by hand and UTC arithmetic):

- `whole_blood` + `male` → `"2026-02-26"` (56 days)
- `whole_blood` + `female` → `"2026-03-26"` (84 days)
- `plasma` + `male` → `"2026-01-15"` (14 days)
- `plasma` + `female` → `"2026-01-15"` (14 days)
- `platelets` + `male` → `"2026-01-29"` (28 days)
- `platelets` + `female` → `"2026-01-29"` (28 days)
- Edge: empty `latestDonations {}` + `male` → all three results are `null`
- Edge: `{ whole_blood: "2026-01-01" }` + `male` → `plasma` and `platelets` results are `null`

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test` (8/8 green)
- Linting passes: `npm run lint`
- Type-checked build passes: `npm run build`

#### Manual Verification:

- `npm test` output explicitly lists 8 passing test names (confirm no skipped or pending tests).

**Implementation Note**: After this phase passes, `calculateEligibility` is the locked correctness baseline. Future phases must not alter its logic without updating the tests first. Pause for manual confirmation before proceeding.

---

## Phase 2: Donation data layer + add-donation API

### Overview

Build the typed data accessors for `donations`, the POST API route that inserts records with server-side validation, and extend middleware to protect `/donations`. Mirrors the profile data pattern exactly. Verifiable via direct POST before any UI exists.

### Changes Required:

#### 1. Donation data module

**File**: `src/lib/donations.ts`

**Intent**: Typed DB accessors and presentation helpers for the donations domain — consumed by the page, the API route, and the UI components.

**Contract**:

- `DonationRow` = `Database["public"]["Tables"]["donations"]["Row"]`.
- `getDonations(supabase: SupabaseClient<Database>, userId: string): Promise<DonationRow[]>` — selects all rows for the user ordered by `donated_at desc`. Returns `[]` on Supabase error (consistent with `getProfile`'s null-safe pattern).
- `getLatestPerType(donations: DonationRow[]): Partial<Record<DonationType, string>>` — pure function; for each type, picks the first (most recent, given `donated_at desc` ordering) `donated_at` string. Caller passes the already-sorted result of `getDonations`.
- `DONATION_TYPE_LABELS: Record<DonationType, string>` = `{ whole_blood: "Krew pełna", plasma: "Osocze", platelets: "Płytki krwi" }`.
- Re-exports `DONATION_TYPES` from `@/lib/eligibility` (so consumers import from one place).

#### 2. Add-donation API route

**File**: `src/pages/api/donations.ts`

**Intent**: Validate and persist a donation record, following the redirect-only API route pattern from `src/pages/api/profile.ts`.

**Contract**: `POST APIRoute`. Steps in order:

1. Null-check `createClient()` → redirect `/donations?error=…` if absent.
2. Read `context.locals.user` → redirect `/auth/signin` if absent.
3. Read `formData`: `type`, `donated_at`.
4. Validate `type` ∈ `Constants.public.Enums.donation_type` → redirect `/donations?error=Nieprawidłowy+typ+donacji` if invalid.
5. Validate `donated_at` is a non-empty string and `donated_at <= todayISO` (compare as YYYY-MM-DD strings; compute today as `new Date().toISOString().split("T")[0]`) → redirect `/donations?error=Nieprawidłowa+data+donacji` if invalid or future.
6. `supabase.from("donations").insert({ user_id: user.id, type, donated_at })`.
7. On Supabase error → redirect `/donations?error=Nie+udało+się+zapisać+donacji`.
8. On success → redirect `/donations?added=1&type=<submitted_type>`.

#### 3. Protect the /donations route

**File**: `src/middleware.ts`

**Intent**: Require auth (and profile completeness) for `/donations`.

**Contract**: Add `"/donations"` to `PROTECTED_ROUTES` at `src/middleware.ts:5`. No other changes — the existing profile-completeness check already handles all protected routes except `/profile`.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Type-checked build passes: `npm run build`

#### Manual Verification:

- POST to `/api/donations` with valid `type` + `donated_at` (today) while logged in → inserts row (confirm in Supabase Studio).
- POST with an unrecognized type → redirect to `/donations?error=…`.
- POST with a future `donated_at` → redirect to `/donations?error=…`.
- POST while unauthenticated → redirect to `/auth/signin`.
- Unauthenticated GET `/donations` → redirect to `/auth/signin`.

**Implementation Note**: Pause for manual confirmation of the POST verification steps before proceeding.

---

## Phase 3: /donations page + UI components + dashboard link

### Overview

Build the three UI layers — `DonationForm`, `EligibilityCards`, `donations.astro` — and add the dashboard entry point. The Astro page server-renders all calculator state; React components handle client interactivity (card selection, URL param update via `history.replaceState`).

### Changes Required:

#### 1. Donation form component

**File**: `src/components/donations/DonationForm.tsx`

**Intent**: The interactive add-donation form — mirrors `ProfileForm.tsx` in structure. Always visible on the page regardless of empty/populated state.

**Contract**: Props `{ serverError?: string | null, added?: boolean }`. Renders `method="POST" action="/api/donations"` form (`noValidate`) containing:

- `SelectField` for `type` (name="type", required, options from `DONATION_TYPE_LABELS` + `DONATION_TYPES`, Polish placeholder e.g. "Wybierz typ…", icon `Droplet` from lucide-react).
- Native `<input type="date" name="donated_at" required>` with `max` and `defaultValue` both set to today's ISO date (computed at render time as `new Date().toISOString().split("T")[0]`). Styled with `inputBase` class to match `SelectField`'s glass input.
- `ServerError` for `serverError` prop.
- Success banner (`<p>` with green styling) when `added` is `true` — Polish text e.g. "Donacja zapisana".
- `SubmitButton` with pending text "Zapisywanie…".
- No client-side validation beyond the date's `max` attribute — the server validates authoritatively.

#### 2. Eligibility cards component

**File**: `src/components/donations/EligibilityCards.tsx`

**Intent**: Render three clickable glass cards showing the earliest eligible date per donation type. Card click selects a type (highlights the card) and updates the URL `?type=` param so S-04's export button can read it without a page reload.

**Contract**: Props `{ eligibility: EligibilityResult, initialSelectedType: DonationType | null }`. State: `selectedType: DonationType | null` initialized from `initialSelectedType`. Renders one `<button type="button">` per entry in `DONATION_TYPES`:

- Card content: Polish type name (`DONATION_TYPE_LABELS[type]`), earliest date formatted with `toLocaleDateString("pl-PL")` or "Brak danych" when `null`.
- Selected card visual: additional ring/border (e.g. `ring-1 ring-purple-400/60 border-purple-400/50`) matching the existing glass-card aesthetic.
- Click handler: `setSelectedType(type)` + `window.history.replaceState(null, "", "/donations?type=" + type)`.

#### 3. /donations page

**File**: `src/pages/donations.astro`

**Intent**: Server-fetch profile + donations, compute eligibility, render empty or populated state and pass computed results to `client:load` React components.

**Contract**:

- Reads `Astro.locals.user` (never `getUser()`).
- Creates `supabase` client, calls `getProfile(supabase, user.id)` and `getDonations(supabase, user.id)` in parallel (`Promise.all`).
- Calls `getLatestPerType(donations)` then `calculateEligibility(latestPerType, profile.sex)` when `profile?.sex` is set.
- Reads URL params: `error`, `added`, `type` (initial card selection — passes as `initialSelectedType` to `EligibilityCards`).
- `hasDonations = donations.length > 0`.
- Layout: `bg-cosmic`, vertically centered, wide enough container (`max-w-2xl`) for three side-by-side cards on desktop.
- Polish page title "Moje donacje".
- When `!hasDonations`: explanatory Polish text (e.g. "Dodaj pierwszą donację, aby zobaczyć kiedy możesz oddać krew następnym razem") above `DonationForm client:load`.
- When `hasDonations`: `EligibilityCards client:load` with `eligibility` + `initialSelectedType` props, then `DonationForm client:load` below.
- Passes `serverError` and `added` to `DonationForm`.

#### 4. Dashboard entry point

**File**: `src/pages/dashboard.astro`

**Intent**: Give donors a primary path to the core feature.

**Contract**: Add a link to `/donations` above the existing `/profile` link, using the same glass-button style. Polish label e.g. "Moje donacje". Keep the existing `/profile` link.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Type-checked build passes: `npm run build`

#### Manual Verification:

- Logged-in donor with complete profile visits `/donations` — empty-state text + form visible, no calculator cards.
- Adding a donation (type: whole blood, date: today) → redirected to `?added=1&type=whole_blood`, success banner, whole blood card highlighted with correct date (today + 56 or 84 days per sex), plasma and platelets show "Brak danych".
- Adding plasma + platelets donations → all three cards show dates; last-added type auto-selected.
- Clicking a different card → card highlights, URL updates to `?type=<type>` without page reload, success banner gone.
- Unauthenticated GET `/donations` → redirect to `/auth/signin`.
- Donor with `sex` unset → redirect to `/profile` when visiting `/donations`.
- Dashboard link navigates to `/donations`.

**Implementation Note**: Cross-check the displayed date against the Vitest-proven expected outputs from Phase 1 — this is the primary acceptance criterion. Pause for manual confirmation before marking complete.

---

## Testing Strategy

### Unit Tests:

- `src/lib/eligibility.test.ts` — 8 deterministic cases covering all 6 RCKiK interval combinations + 2 edge cases. Run with `npm test`.

### Integration Tests:

- No integration test suite (no E2E framework configured — deferred roadmap open question). Manual verification substitutes.

### Manual Testing Steps:

1. `npm test` — confirm 8/8 passing, names visible.
2. Fresh donor with complete profile → `/donations` → empty-state text + form visible, no cards.
3. Add whole blood donation (today) → redirect to `?added=1&type=whole_blood` → success banner, whole blood card highlighted, correct date.
4. Verify date = today + 56 days (male) or + 84 days (female) — cross-check against Phase 1 test expectations.
5. Add plasma donation → plasma card shows correct date, plasma auto-selected.
6. Add platelets donation → all three cards populated.
7. Click whole blood card → highlighted, URL updated, no page reload.
8. Submit future date → server redirect with error message.
9. Sign out → GET `/donations` → redirect to `/auth/signin`.
10. Donor with `sex` unset → GET `/donations` → redirect to `/profile`.

## Performance Considerations

`getDonations` fetches all of the user's donations. At MVP scale (one user, handful of records) this is trivially fast. The `(user_id, donated_at desc)` index from F-01 keeps it cheap even as history grows. No caching needed.

## Migration Notes

No schema changes — F-01's migration provides the `donations` table with all required columns and the `donation_type` enum.

## References

- Roadmap item: `context/foundation/roadmap.md` (S-02, lines 89-100)
- PRD requirements: `context/foundation/prd.md` (FR-004, FR-008, FR-009, US-01)
- Pattern to mirror: `src/lib/profile.ts`, `src/pages/api/profile.ts`, `src/pages/profile.astro`, `src/components/profile/ProfileForm.tsx`
- Schema + enum values: `src/db/database.types.ts`
- Middleware: `src/middleware.ts`
- S-04 (ICS export) reads the `?type=` URL param set by this slice.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Calculator engine + Vitest

#### Automated

- [x] 1.1 Unit tests pass: `npm test` (8/8 green) — 6f9baa0
- [x] 1.2 Linting passes: `npm run lint` — 6f9baa0
- [x] 1.3 Type-checked build passes: `npm run build` — 6f9baa0

#### Manual

- [x] 1.4 `npm test` output lists 8 passing test names (no skipped or pending) — 6f9baa0

### Phase 2: Donation data layer + add-donation API

#### Automated

- [x] 2.1 Linting passes: `npm run lint` — 3c695fd
- [x] 2.2 Type-checked build passes: `npm run build` — 3c695fd

#### Manual

- [x] 2.3 POST with valid data inserts row (verified in Supabase Studio) — 3c695fd
- [x] 2.4 POST with invalid type redirects to `/donations?error=…` — 3c695fd
- [x] 2.5 POST with future donated_at redirects to `/donations?error=…` — 3c695fd
- [x] 2.6 Unauthenticated POST redirects to `/auth/signin` — 3c695fd
- [x] 2.7 Unauthenticated GET `/donations` redirects to `/auth/signin` — 3c695fd

### Phase 3: /donations page + UI components + dashboard link

#### Automated

- [x] 3.1 Linting passes: `npm run lint` — a255410
- [x] 3.2 Type-checked build passes: `npm run build` — a255410

#### Manual

- [x] 3.3 Empty-state text + form visible for donor with no donations — a255410
- [x] 3.4 Adding a donation redirects to `?added=1&type=<type>` with correct eligibility date — a255410
- [x] 3.5 All three cards populated after adding one donation of each type — a255410
- [x] 3.6 Card click highlights card + updates URL `?type=` without page reload — a255410
- [x] 3.7 Unauthenticated GET `/donations` redirects to `/auth/signin` — a255410
- [x] 3.8 Donor with `sex` unset redirected to `/profile` when visiting `/donations` — a255410
- [x] 3.9 Dashboard link navigates to `/donations` — a255410
