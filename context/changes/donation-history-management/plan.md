# Donation History Management Implementation Plan

## Overview

Build S-03: a donation history list on the `/donations` page with edit and delete flows. The history list appears below the add form, shows each donation's type and date, and lets the donor edit (via a dedicated edit page) or delete (with an inline confirm that warns about eligibility recalculation for the most-recent donation of its type).

## Current State Analysis

- `donations` table: `id, user_id, type, donated_at, created_at`; RLS-protected; index on `(user_id, donated_at desc)` from F-01.
- `src/lib/donations.ts`: `getDonations()`, `getLatestPerType()`, `DONATION_TYPE_LABELS`, `DONATION_TYPES`. No update or delete accessors.
- `src/pages/api/donations.ts`: POST-only (insert). No edit or delete endpoints.
- `src/pages/donations.astro`: eligibility cards + add form only; no history list.
- No dialog/modal primitive exists — only `Button` (with `destructive` variant) is in `src/components/ui/`.
- `PROTECTED_ROUTES = ["/dashboard", "/profile", "/donations"]` at `src/middleware.ts:5` — `/donations/[id]/edit` is already covered via `startsWith` check; no middleware change needed.

## Desired End State

The `/donations` page shows the eligibility cards and add form (unchanged), then a "Historia donacji" section heading and a list of all donations (most recent first). Each row shows the Polish type label, formatted date, and "Edytuj" + "Usuń" actions. Clicking "Edytuj" navigates to `/donations/[id]/edit` — a pre-filled form that updates the donation and redirects back to `/donations?edited=1`. Clicking "Usuń" expands an inline confirm in the row; if the donation is the most-recent of its type, an amber warning notes the eligibility date will change. Confirming deletes and redirects to `/donations?deleted=1`. Edit and delete success banners appear at the top of the page content.

**Verification:** `npm run lint` and `npm run build` pass; manual edit + delete flows verified; eligibility cards reflect updated dates after edit/delete; recalculation warning appears only for the most-recent donation of its type.

### Key Discoveries:

- `getDonations()` returns rows sorted by `donated_at desc` — `getLatestIds()` needs only a single pass to find the first occurrence per type.
- `Button` at `src/components/ui/button.tsx:34` supports `asChild` — use `Button variant="ghost" asChild` wrapping `<a>` for the "Edytuj" navigation link.
- `Set<string>` is not JSON-serializable and cannot be passed as a prop to `client:load` React components. Pass `latestIds` as `string[]`; convert to `Set` inside the component with `useMemo`.
- `src/pages/donations.astro` and `src/pages/donations/[id]/edit.astro` coexist in Astro's file-based routing (a `.astro` file and a same-name directory are distinct).
- Same coexistence applies to `src/pages/api/donations.ts`, `src/pages/api/donations/[id].ts`, and `src/pages/api/donations/[id]/delete.ts`.
- The delete route does not require a schema change — `DELETE WHERE id = ? AND user_id = ?` (belt-and-suspenders alongside RLS).

## What We're NOT Doing

- No pagination or search/filter — MVP scale is one personal user with a handful of records.
- No "days since" or relative time per row — type label + formatted date + actions only.
- No new dialog/modal component — inline React state handles the delete confirm.
- No undo/restore after deletion.
- No sorting controls — history is always `donated_at desc` (matches the existing DB query).
- No dedicated unit tests for `getLatestIds` (pure function, trivially correct — revisit in a follow-up if desired).

## Implementation Approach

Phase-first: the data layer and both API routes land in Phase 1 so the backend is complete and manually verifiable before any UI is written. Phase 2 adds the edit page and form component. Phase 3 adds the history list and wires everything into the donations page. Each phase ends with a lint + build gate and targeted manual verification.

---

## Phase 1: Data layer + edit/delete API routes

### Overview

Add `getLatestIds()`, `updateDonation()`, and `deleteDonation()` to the donations lib, then create two new API route files. No UI changes.

### Changes Required:

#### 1. Extend donations data module

**File**: `src/lib/donations.ts`

**Intent**: Add the three new domain operations needed by the UI phases. Keep all data access logic in one module.

**Contract**:

- `getLatestIds(donations: DonationRow[]): string[]` — pure function; single pass over the `donated_at desc`-sorted array; returns one `id` per donation type for the first occurrence of each type (at most 3 IDs). Used by `DonationHistory` to decide which rows show the recalculation warning.
- `updateDonation(supabase: SupabaseClient<Database>, userId: string, id: string, type: DonationType, donatedAt: string): Promise<{ error: PostgrestError | null }>` — updates `type` and `donated_at` for the row matching both `id` and `user_id`.
- `deleteDonation(supabase: SupabaseClient<Database>, userId: string, id: string): Promise<{ error: PostgrestError | null }>` — deletes the row matching both `id` and `user_id`.

Both write operations include `.eq("user_id", userId)` as an ownership constraint (belt-and-suspenders alongside RLS).

#### 2. Edit API route

**File**: `src/pages/api/donations/[id].ts`

**Intent**: Validate and persist the edited donation record, following the redirect-only API route pattern from `src/pages/api/donations.ts`.

**Contract**: `POST APIRoute`. `const { id } = context.params`. Steps in order:

1. Null-check `createClient()` → redirect `/donations?error=Błąd+konfiguracji+serwera`
2. `context.locals.user` guard → redirect `/auth/signin`
3. Read `formData`: `type`, `donated_at`
4. Validate `type` ∈ `Constants.public.Enums.donation_type` → redirect `/donations?error=Nieprawidłowy+typ+donacji`
5. Validate `donated_at` is non-empty and `≤ today` (same `toISOString().split("T")[0]` comparison as insert route) → redirect `/donations?error=Nieprawidłowa+data+donacji`
6. `updateDonation(supabase, user.id, id, type, donatedAt)`
7. On error → redirect `/donations?error=Nie+udało+się+zaktualizować+donacji`
8. On success → redirect `/donations?edited=1&type=${type}`

#### 3. Delete API route

**File**: `src/pages/api/donations/[id]/delete.ts`

**Intent**: Delete a single donation owned by the authenticated user. POST-only (HTML form constraint). Mirrors the redirect-only pattern.

**Contract**: `POST APIRoute`. `const { id } = context.params`. Steps:

1. Null-check `createClient()` → redirect `/donations?error=Błąd+konfiguracji+serwera`
2. `context.locals.user` guard → redirect `/auth/signin`
3. `deleteDonation(supabase, user.id, id)`
4. On error → redirect `/donations?error=Nie+udało+się+usunąć+donacji`
5. On success → redirect `/donations?deleted=1`

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Type-checked build passes: `npm run build`

#### Manual Verification:

- POST to `/api/donations/{valid-id}` with valid type + date → row updated (confirm in Supabase Studio)
- POST with invalid type → redirect to `/donations?error=…`
- POST with future `donated_at` → redirect to `/donations?error=…`
- POST to `/api/donations/{id-belonging-to-other-user}` → no row updated (ownership check holds)
- POST to `/api/donations/{valid-id}/delete` → row gone (confirm in Supabase Studio)
- POST to delete while unauthenticated → redirect to `/auth/signin`

**Implementation Note**: Pause for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Edit page + form component

### Overview

Build the `/donations/[id]/edit` page and its `DonationEditForm` React component. The page server-fetches the donation, verifies ownership, and pre-fills the form. Submitting POSTs to `/api/donations/[id]`.

### Changes Required:

#### 1. Edit form component

**File**: `src/components/donations/DonationEditForm.tsx`

**Intent**: A pre-filled version of `DonationForm` for editing an existing donation. Reuses `SelectField`, date input, `SubmitButton`, and `ServerError` — same structure, different initial values and form action.

**Contract**: Props `{ donation: DonationRow, serverError?: string | null }`. `useState` for `type` initialized from `donation.type`. Form: `method="POST"` `action={"/api/donations/" + donation.id}` (`noValidate`). Date input `defaultValue={donation.donated_at}` (`max` still set to today). `SubmitButton` label "Zapisz", pending text "Zapisywanie…". `ServerError` for `serverError` prop.

#### 2. Edit Astro page

**File**: `src/pages/donations/[id]/edit.astro`

**Intent**: Server-fetch the donation by ID, verify it belongs to the current user, and render the edit form. Redirects to `/donations` if the donation is not found or doesn't belong to the user.

**Contract**:

- `const { id } = Astro.params`.
- `const { user } = Astro.locals`.
- `createClient(...)` null-check → redirect `/donations`.
- `supabase.from("donations").select().eq("id", id).eq("user_id", user.id).maybeSingle()` — if `data` is null → redirect `/donations`.
- Read `error` URL param (passed through if the API ever redirects back here).
- Renders `DonationEditForm client:load` with `donation={data}` and `serverError={error}`.
- Page title "Edytuj donację". Layout: same glass-card container as `src/pages/profile.astro` (`max-w-sm`, centered, `bg-cosmic`).

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Type-checked build passes: `npm run build`

#### Manual Verification:

- Navigate to `/donations/{valid-id}/edit` → form pre-filled with correct type and date
- Submit valid edit → redirect to `/donations?edited=1`, eligibility card reflects updated date
- Navigate to `/donations/{nonexistent-id}/edit` → redirect to `/donations`
- Navigate to `/donations/{other-users-id}/edit` → redirect to `/donations`
- Navigate while unauthenticated → redirect to `/auth/signin` (middleware)

**Implementation Note**: Pause for manual confirmation before proceeding to Phase 3.

---

## Phase 3: History list component + donations page update

### Overview

Build `DonationHistory.tsx` with inline delete confirmation and update `donations.astro` to render the history section, `edited`/`deleted` banners, and the "Historia donacji" heading.

### Changes Required:

#### 1. History list component

**File**: `src/components/donations/DonationHistory.tsx`

**Intent**: Render the list of all donations with per-row edit navigation and inline delete confirmation. Shows a recalculation warning only for the most-recent donation of its type (identified via `latestIds`).

**Contract**: Props `{ donations: DonationRow[], latestIds: string[] }`. State: `confirmDeleteId: string | null`. Internal `latestIdSet = useMemo(() => new Set(latestIds), [latestIds])`.

For each `row` in `donations`:

- Display: `DONATION_TYPE_LABELS[row.type]` and `new Date(row.donated_at + "T00:00:00Z").toLocaleDateString("pl-PL", { timeZone: "UTC" })` — same UTC date rendering pattern as `EligibilityCards`.
- Normal state (`confirmDeleteId !== row.id`):
  - "Edytuj" — `Button variant="ghost" size="sm" asChild` wrapping `<a href={"/donations/" + row.id + "/edit"}>`.
  - "Usuń" — `Button variant="destructive" size="sm"` `onClick={() => setConfirmDeleteId(row.id)}`.
- Confirm state (`confirmDeleteId === row.id`):
  - When `latestIdSet.has(row.id)`: paragraph `text-xs text-amber-300/80` — "Usunięcie tej donacji zmieni datę kwalifikowalności."
  - Delete form: `method="POST" action={"/api/donations/" + row.id + "/delete"}` with `<button type="submit">` styled destructive/sm — "Potwierdź".
  - Cancel: `Button variant="ghost" size="sm"` `onClick={() => setConfirmDeleteId(null)}` — "Anuluj".

Returns `null` when `donations.length === 0` (parent guards this, but defensive).

#### 2. Update /donations page

**File**: `src/pages/donations.astro`

**Intent**: Wire in the history section — import `DonationHistory` and `getLatestIds`, handle new URL params (`edited`, `deleted`), render success banners and the history section below the add form.

**Contract**:

- Add imports: `DonationHistory` from `@/components/donations/DonationHistory`; `getLatestIds` from `@/lib/donations`.
- Add URL param reads: `edited = Astro.url.searchParams.get("edited") === "1"`, `deleted = Astro.url.searchParams.get("deleted") === "1"`.
- Compute `const latestIds = getLatestIds(donations)` after `donations` is populated.
- Render `edited` and `deleted` success banners as static Astro HTML above the page heading — same inline `<p>` style as `DonationForm`'s `added` banner (`border-green-500/30 bg-green-900/30 text-green-300`). Polish text: "Donacja zaktualizowana" / "Donacja usunięta".
- After `<DonationForm ...>`, when `hasDonations`, render:
  - `<h2>` — "Historia donacji" — styled `mt-8 mb-4 text-sm font-semibold text-blue-100/70`.
  - `<DonationHistory donations={donations} latestIds={latestIds} client:load />`.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Type-checked build passes: `npm run build`

#### Manual Verification:

- `/donations` shows history list below add form when donations exist
- Each row: type label, formatted date, "Edytuj" link, "Usuń" button
- "Edytuj" navigates to edit page; editing redirects back with "Donacja zaktualizowana" banner
- "Usuń" expands inline confirm; "Anuluj" collapses without action
- Deleting a non-latest donation: no recalculation warning shown
- Deleting the most-recent donation of a type: amber recalculation warning shown
- Confirming delete → `/donations?deleted=1` → "Donacja usunięta" banner; row removed; eligibility cards recalculated
- Deleting the only donation of a type → that type's card shows "Brak danych"
- History list absent when donor has zero donations

**Implementation Note**: Verify the "Brak danych" regression after deleting the last donation of a type — this is the core S-02 behaviour that S-03 must not break. Pause for manual confirmation before marking complete.

---

## Testing Strategy

### Unit Tests:

- `getLatestIds()` is a pure function; Vitest is already configured. Optionally add `src/lib/donations.test.ts` with 3 cases: empty input → `[]`, single donation → one-element array with its ID, mixed-type donations → correct 3 IDs (first occurrence per type).

### Integration Tests:

- No E2E framework configured (deferred roadmap open question). Manual verification substitutes.

### Manual Testing Steps:

1. Add a whole blood donation. Go to `/donations` — history list shows one row.
2. Click "Edytuj". Verify edit page opens pre-filled with correct type and date.
3. Change the date by 1 day. Submit. Verify redirect to `/donations?edited=1`, banner visible, eligibility card date updated.
4. Add a second whole blood donation. History shows 2 rows.
5. Click "Usuń" on the **older** whole blood row. Verify NO amber recalculation warning.
6. Click "Anuluj". Row returns to normal state.
7. Click "Usuń" on the **newer** (most-recent) whole blood row. Verify amber recalculation warning IS shown.
8. Confirm delete. Verify redirect, "Donacja usunięta" banner, older whole blood row is now the only whole blood entry, eligibility card recalculated from older date.
9. Delete the remaining whole blood donation. Verify whole blood card shows "Brak danych".

## Performance Considerations

`getDonations()` fetches all rows for the user. MVP scale is one personal user with a small number of donations per year. The `(user_id, donated_at desc)` index from F-01 keeps the query trivially fast. No pagination needed.

## Migration Notes

No schema changes. All required columns (`id`, `user_id`, `type`, `donated_at`) are present from F-01.

## References

- Roadmap item: `context/foundation/roadmap.md` (S-03, lines 102–113)
- PRD requirements: `context/foundation/prd.md` (FR-005, FR-006, FR-007)
- Pattern to mirror: `src/lib/donations.ts`, `src/pages/api/donations.ts`, `src/pages/donations.astro`
- Edit form mirrors: `src/components/donations/DonationForm.tsx`
- `Button` component (`asChild` for "Edytuj" link): `src/components/ui/button.tsx:34`
- UTC date rendering pattern: `src/components/donations/EligibilityCards.tsx:36`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data layer + edit/delete API routes

#### Automated

- [x] 1.1 Linting passes: `npm run lint` — accdae9
- [x] 1.2 Type-checked build passes: `npm run build` — accdae9

#### Manual

- [x] 1.3 POST to `/api/donations/{valid-id}` with valid type + date → row updated in Supabase Studio
- [x] 1.4 POST with invalid type → redirect to `/donations?error=…`
- [x] 1.5 POST with future `donated_at` → redirect to `/donations?error=…`
- [x] 1.6 POST to `/api/donations/{other-users-id}` → no row updated
- [x] 1.7 POST to `/api/donations/{valid-id}/delete` → row gone in Supabase Studio
- [x] 1.8 Unauthenticated delete POST → redirect to `/auth/signin`

### Phase 2: Edit page + form component

#### Automated

- [x] 2.1 Linting passes: `npm run lint` — aa35745
- [x] 2.2 Type-checked build passes: `npm run build` — aa35745

#### Manual

- [x] 2.3 `/donations/{valid-id}/edit` shows pre-filled form
- [x] 2.4 Submitting valid edit → `/donations?edited=1` with updated eligibility card
- [x] 2.5 `/donations/{nonexistent-id}/edit` → redirect to `/donations`
- [x] 2.6 `/donations/{other-users-id}/edit` → redirect to `/donations`
- [x] 2.7 Unauthenticated GET → redirect to `/auth/signin`

### Phase 3: History list component + donations page update

#### Automated

- [x] 3.1 Linting passes: `npm run lint` — e51c453
- [x] 3.2 Type-checked build passes: `npm run build` — e51c453

#### Manual

- [x] 3.3 History list visible below add form when donations exist
- [x] 3.4 "Edytuj" navigates to edit page; edit success shows "Donacja zaktualizowana" banner
- [x] 3.5 "Usuń" → inline confirm; "Anuluj" collapses without action
- [x] 3.6 No amber warning when deleting non-latest donation
- [x] 3.7 Amber warning shown when deleting most-recent donation of its type
- [x] 3.8 Confirmed delete → `/donations?deleted=1`, row removed, eligibility recalculated
- [x] 3.9 Deleting last donation of a type → card shows "Brak danych"
- [x] 3.10 History list absent with zero donations
