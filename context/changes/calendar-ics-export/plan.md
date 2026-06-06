# Calendar ICS Export Implementation Plan

## Overview

Add a one-click `.ics` calendar export for the donor's next eligible donation date. When the donor selects a donation type card on `/donations`, the selected type is already stored in the `?type=` URL param by `EligibilityCards`. This plan adds the ICS generation helper, a GET API route that computes and returns the calendar file, and an export button inside `EligibilityCards` that links directly to it.

## Current State Analysis

S-02 (eligibility calculator) and S-03 (donation history management) are fully shipped. The `/donations` page already:
- Computes `EligibilityResult` server-side via `calculateEligibility()` from `src/lib/eligibility.ts`
- Renders `EligibilityCards` with `initialSelectedType` from `?type=`
- Stores the card selection in `?type=` via `window.history.replaceState`

No ICS library is installed. All existing API routes are POST → redirect; the export route is a deliberate GET → file-download exception.

## Desired End State

The donor clicks "Eksportuj do kalendarza" below the eligibility cards. The browser downloads `vena-donacja.ics`. Importing the file into Google Calendar, Apple Calendar, or Outlook creates an all-day event on the correct eligibility date, titled per donation type in Polish. No manual editing required.

Verification: import the downloaded file into at least one real calendar client and confirm the event appears on the correct date.

### Key Discoveries

- `EligibilityResult` is `Record<DonationType, string | null>` where the string is `YYYY-MM-DD` — `src/lib/eligibility.ts:5`
- `EligibilityCards.tsx:26` sets `?type=` via `window.history.replaceState` on card click — the export button reads the same URL param
- `/api/donations/export` does NOT fall under `PROTECTED_ROUTES = ["/profile", "/donations"]` in `src/middleware.ts:5` — the route must handle its own auth guard (same pattern as all `/api/` routes)
- All API routes read `context.locals.user` (set by middleware) and call `context.redirect()` on error — `src/pages/api/donations.ts:13`
- `donations.astro:30` fetches profile + donations in parallel with `Promise.all` — export route follows the same pattern

## What We're NOT Doing

- No ICS library dependency — manual RFC 5545 string generation only
- No export of all three eligibility dates as three VEVENT blocks — one event per export, for the selected type
- No DESCRIPTION field in the VEVENT — SUMMARY alone is sufficient and avoids line-folding complexity
- No changes to `src/middleware.ts` — route handles its own auth
- No VALARM / reminder block — the export is for the calendar's own notification system to handle

## Implementation Approach

Two phases. Phase 1 adds the backend: a `generateIcs()` helper in `src/lib/ics.ts` and a GET route at `src/pages/api/donations/export.ts` that validates auth, resolves the type, computes eligibility, and streams the file. Phase 2 adds the frontend: an export `<a>` styled as a button inside `EligibilityCards.tsx`, rendered when the resolved type has a non-null eligibility date.

## Critical Implementation Details

**CRLF line endings** — RFC 5545 requires `\r\n` at the end of every iCalendar line. Using `\n` only will cause silent import failures in some clients (Outlook is strict). Every line in the generated string must end with `\r\n`.

**DATE-only DTSTART** — Use `DTSTART;VALUE=DATE:YYYYMMDD` (no time, no timezone). This renders as an all-day event in every major client and avoids DST/timezone ambiguity for a date that represents "from this day onward." The date string `2026-08-14` → `20260814` (strip the hyphens).

**No line-folding needed** — All generated lines for this feature are under 75 octets in UTF-8. Do not add folding logic; it would be dead code and a source of future bugs.

---

## Phase 1: ICS generation and API route

### Overview

Add the pure ICS text generator and the GET API endpoint that produces the downloadable file. This phase is entirely backend; no UI changes yet.

### Changes Required

#### 1. ICS helper module

**File**: `src/lib/ics.ts`

**Intent**: Centralise the iCalendar format constants and the `generateIcs` function so the route stays clean and the format logic is independently testable.

**Contract**:
- `DONATION_TYPE_SUMMARIES: Record<DonationType, string>` — maps each type to its Polish VEVENT SUMMARY:
  - `whole_blood` → `"Krew pełna — najwcześniejszy termin oddania"`
  - `plasma` → `"Osocze — najwcześniejszy termin oddania"`
  - `platelets` → `"Płytki krwi — najwcześniejszy termin oddania"`
- `generateIcs(type: DonationType, dateStr: string): string` — accepts a type and a `YYYY-MM-DD` eligibility date, returns a complete iCalendar string (VCALENDAR wrapping one VEVENT) with CRLF line endings. The UID is deterministic: `${type}-${dateStr}@vena`. The DTSTAMP is derived from `new Date()` at call time.

#### 2. Export API route

**File**: `src/pages/api/donations/export.ts`

**Intent**: GET handler that authenticates the donor, resolves the donation type, computes the eligibility date server-side, and returns a file-download response.

**Contract**:
- Exports `GET: APIRoute` (not `POST` — deliberate exception to the form-action pattern)
- Query param `type` is read from `context.url.searchParams.get("type")`, validated against `Constants.public.Enums.donation_type`, and defaults to `"whole_blood"` when absent or invalid
- Auth and config guards follow the existing API route pattern (`createClient` null check → config error redirect; `context.locals.user` null check → `/auth/signin` redirect)
- Fetches profile and donations in parallel with `Promise.all`, same as `donations.astro:30`
- Profile sex guard: if `profile?.sex` is falsy, redirect to `/donations?error=…` (profile incomplete)
- Null-date guard: if `eligibility[type]` is `null`, redirect to `/donations?error=Brak+danych+dla+tego+typu+donacji`
- Success: returns `new Response(generateIcs(type, eligibility[type]), { status: 200, headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'attachment; filename="vena-donacja.ics"' } })`

### Success Criteria

#### Automated Verification

- Type-checking passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`

#### Manual Verification

- GET `/api/donations/export?type=whole_blood` (authenticated, WB donation exists) returns HTTP 200 with `Content-Type: text/calendar` and triggers a file download named `vena-donacja.ics`
- The downloaded file begins with `BEGIN:VCALENDAR` and contains `DTSTART;VALUE=DATE:` on a valid date
- GET with a type whose eligibility is null returns a redirect to `/donations?error=Brak danych dla tego typu donacji`
- Unauthenticated GET redirects to `/auth/signin`
- Importing the `.ics` file into Google Calendar creates an all-day event on the correct date with a Polish title

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Export button in EligibilityCards

### Overview

Add the "Eksportuj do kalendarza" button below the three eligibility cards inside `EligibilityCards.tsx`. The button is an `<a>` element (native browser file-download trigger) pointing at the Phase 1 GET route.

### Changes Required

#### 1. Export button

**File**: `src/components/donations/EligibilityCards.tsx`

**Intent**: Render an export link below the cards that downloads the `.ics` file for the currently selected (or defaulted) donation type. The button must not be shown when the resolved type has no eligibility date — exporting a null date is semantically wrong and the route would redirect with an error anyway.

**Contract**:
- The resolved type for the export is `selectedType ?? "whole_blood"` (mirrors the API route default)
- Render the `<a>` element only when `eligibility[resolvedType]` is non-null
- `href={/api/donations/export?type=${resolvedType}}`
- Use a calendar-related icon from `lucide-react` (e.g. `CalendarPlus` or `CalendarCheck`) inline with the button label "Eksportuj do kalendarza"
- Styled with the app's glass/blur aesthetic consistent with the existing cards (`border-white/10 bg-white/10 backdrop-blur-xl rounded-xl`)

### Success Criteria

#### Automated Verification

- Type-checking passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`

#### Manual Verification

- Export button is visible below the cards when at least one eligibility card has a date
- Clicking the button downloads `vena-donacja.ics`
- Changing the selected card updates the exported type (verified by inspecting the href or re-importing)
- When no eligibility dates exist for the default type (whole_blood null, no card selected), the button is absent
- Card selection behavior is unchanged (highlight, URL update) — no regression from S-02
- Delete/edit flows continue to work — no regression from S-03

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding.

---

## Testing Strategy

### Unit Tests

- `generateIcs("whole_blood", "2026-08-14")` returns a string containing `BEGIN:VCALENDAR`, `DTSTART;VALUE=DATE:20260814`, `SUMMARY:Krew pełna — najwcześniejszy termin oddania`, and `END:VCALENDAR`
- All line endings are `\r\n` (test by splitting on `\r\n` and checking no bare `\n` remains)
- All three donation types produce correctly typed SUMMARY strings

### Integration Tests

- GET `/api/donations/export` with valid session + WB donation → 200 + `text/calendar`
- GET `/api/donations/export?type=plasma` with valid session + no plasma donation → redirect to `/donations`
- GET `/api/donations/export` with no session → redirect to `/auth/signin`

### Manual Testing Steps

1. Log in, add a whole blood donation, navigate to `/donations`
2. Click the whole blood card (or leave unselected) → click export button → confirm download
3. Import `vena-donacja.ics` into Google Calendar — confirm all-day event on correct date with Polish title
4. Import into Apple Calendar (or Outlook if available) — confirm no manual editing required
5. Click a plasma card (with no plasma donation recorded) → confirm export button is hidden
6. Add a plasma donation, return to `/donations`, click plasma card → export → confirm correct plasma date in the downloaded file

## References

- PRD FR-010: `context/foundation/prd.md`
- ICS RFC: RFC 5545 (iCalendar) — especially §3.3.4 (DATE value type) and §3.8.5.2 (DTSTART)
- Eligibility calculation: `src/lib/eligibility.ts`
- Existing API route pattern: `src/pages/api/donations.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: ICS generation and API route

#### Automated

- [x] 1.1 Type-checking passes: `npx tsc --noEmit` — 8392ef7
- [x] 1.2 Linting passes: `npm run lint` — 8392ef7

#### Manual

- [ ] 1.3 GET export route returns HTTP 200 with `Content-Type: text/calendar` for authenticated donor with donation
- [ ] 1.4 Downloaded `.ics` contains valid VCALENDAR structure with correct DTSTART date
- [ ] 1.5 Null-date case redirects to `/donations?error=…`
- [ ] 1.6 Unauthenticated GET redirects to `/auth/signin`
- [ ] 1.7 Imported `.ics` creates all-day event on correct date in Google Calendar with Polish title

### Phase 2: Export button in EligibilityCards

#### Automated

- [x] 2.1 Type-checking passes: `npx tsc --noEmit` — 39a7871
- [x] 2.2 Linting passes: `npm run lint` — 39a7871

#### Manual

- [ ] 2.3 Export button visible when eligibility date exists for resolved type
- [ ] 2.4 Clicking export button downloads `vena-donacja.ics`
- [ ] 2.5 Changing selected card updates exported type
- [ ] 2.6 Button absent when resolved type has no eligibility date
- [ ] 2.7 No regression in card selection or donation history flows
