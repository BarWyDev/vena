# Calendar ICS Export — Plan Brief

> Full plan: `context/changes/calendar-ics-export/plan.md`

## What & Why

A donor who wants to plan their next donation has no way to push the eligibility date into their calendar from within Vena. FR-010 closes this gap: a one-click export button downloads a `.ics` file the donor can import into Google, Apple, or Outlook Calendar. The calendar event marks the earliest allowed donation date for the type they selected.

## Starting Point

S-02 and S-03 are fully shipped. `EligibilityCards.tsx` already stores the selected type in `?type=` via `history.replaceState`. The `calculateEligibility()` function in `src/lib/eligibility.ts` returns per-type dates as `YYYY-MM-DD` strings. No ICS generation code exists yet.

## Desired End State

The donor clicks "Eksportuj do kalendarza" below the eligibility cards. The browser downloads `vena-donacja.ics`. Importing the file into any major calendar client creates an all-day event on the correct date with a Polish title matching the selected donation type — no manual editing required.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| ICS generation | Manual string, no library | Cloudflare Workers edge runtime — no Node.js API risk, and the format is ~15 lines |
| DTSTART format | `VALUE=DATE` (date-only, all-day) | Eliminates DST/timezone ambiguity across Google, Apple, Outlook |
| No-type-selected fallback | Default to `whole_blood` silently | Zero friction; the most common type; export route mirrors this default |
| Null-date guard | Redirect to `/donations?error=…` | Consistent with app-wide error pattern; exporting a null date is semantically wrong |
| Button host | Inside `EligibilityCards.tsx` | Component already owns `selectedType` state — no prop drilling needed |
| Route URL | `GET /api/donations/export?type=<type>` | Follows existing `/api/donations/` namespace; GET is justified for file download |

## Scope

**In scope:**
- `src/lib/ics.ts` — `generateIcs()` helper + `DONATION_TYPE_SUMMARIES`
- `src/pages/api/donations/export.ts` — GET route, auth guard, eligibility computation, file response
- `src/components/donations/EligibilityCards.tsx` — export `<a>` button below cards

**Out of scope:**
- ICS library dependency
- Exporting all three types as three VEVENT blocks
- VALARM / push reminders
- Changes to `src/middleware.ts`
- DESCRIPTION field in VEVENT

## Architecture / Approach

The button is an `<a href="/api/donations/export?type=…">` — a native browser file-download trigger. The server-side GET route recomputes eligibility fresh (same `Promise.all` pattern as `donations.astro`) and returns `Content-Disposition: attachment`. No new state, no new client-server protocol — just a link that triggers a download.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. ICS generation and API route | Backend: `src/lib/ics.ts` + `GET /api/donations/export` | CRLF vs LF line endings — wrong endings cause silent import failures in Outlook |
| 2. Export button in EligibilityCards | Frontend: export `<a>` styled as button inside `EligibilityCards.tsx` | Button condition must mirror route default (`whole_blood` fallback) to avoid confusing mismatches |

**Prerequisites:** S-02 and S-03 complete (both are)  
**Estimated effort:** ~1 session across 2 small phases

## Open Risks & Assumptions

- ICS interoperability is tested manually against real calendar clients before the change is merged — automated tests verify format structure but not client rendering
- `lucide-react@^1.14.0` includes a calendar-related icon suitable for the export button (verify icon name before implementing Phase 2)

## Success Criteria (Summary)

- Importing the downloaded `.ics` into Google Calendar and Apple Calendar creates an all-day event on the correct RCKiK-computed date with a Polish type-specific title — no manual editing
- The null-date and unauthenticated edge cases return the correct redirects
- No regression in card selection, donation add/edit/delete flows
