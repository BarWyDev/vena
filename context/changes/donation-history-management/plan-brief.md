# Donation History Management — Plan Brief

> Full plan: `context/changes/donation-history-management/plan.md`

## What & Why

S-03 adds the remaining CRUD surface that makes donation records actually manageable. S-02 (the north-star slice) lets donors add a donation and see eligibility dates; S-03 lets them view their full history, fix mistakes via edit, and remove records via delete. FR-005, FR-006, FR-007 are all fully addressed here.

## Starting Point

The `donations` table (from F-01) has `id, user_id, type, donated_at, created_at`. The S-02 data layer (`src/lib/donations.ts`) provides `getDonations()` and display helpers. The `/donations` page shows eligibility cards and an add form; there is no history list, no edit endpoint, and no delete endpoint yet.

## Desired End State

The `/donations` page shows a "Historia donacji" section below the add form: a list of all donations (newest first), each with type, formatted date, an "Edytuj" link (→ `/donations/[id]/edit`), and a "Usuń" button. Clicking "Usuń" reveals an inline confirm in the row; if that donation is the most-recent of its type, an amber note warns the eligibility date will change. Editing or deleting redirects back to `/donations` with a success banner, and eligibility cards automatically reflect the updated data.

## Key Decisions Made

| Decision              | Choice                                                            | Why (1 sentence)                                                                                    | Source |
| --------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------ |
| History list location | Same `/donations` page, below add form                            | Keeps all donation state on one screen; matches PRD's implicit design                               | Plan   |
| Edit UX               | Separate `/donations/[id]/edit` page                              | Mirrors the profile edit pattern exactly; no inline-state complexity                                | Plan   |
| Delete confirmation   | Inline React state (not `window.confirm`)                         | Allows the amber recalculation warning to be styled and conditional; no new dialog component needed | Plan   |
| Warning scope         | Only for most-recent donation of its type                         | Warning is only accurate when the deletion actually changes the eligibility date                    | Plan   |
| API routing           | Two separate files — `[id].ts` (edit) + `[id]/delete.ts` (delete) | Single-responsibility; matches the existing file-per-resource pattern                               | Plan   |
| Post-action flow      | Redirect to `/donations?edited=1` / `?deleted=1`                  | Consistent with every other mutation in the app; eligibility cards recompute server-side on reload  | Plan   |
| Section heading       | "Historia donacji" `<h2>`                                         | Clear visual separation between add form and history list                                           | Plan   |

## Scope

**In scope:** History list on `/donations`; edit page + form; delete with inline confirm; `getLatestIds`, `updateDonation`, `deleteDonation` in the data layer; `edited` + `deleted` success banners.

**Out of scope:** Pagination/search/filter; "days since" per row; undo/restore; new dialog/modal component; unit tests for `getLatestIds` (pure function, minimal risk); E2E test framework (deferred per roadmap).

## Architecture / Approach

All mutations follow the existing POST→redirect pattern (no JSON API). The page is Astro SSR — any mutation triggers a full page reload, so eligibility cards recompute automatically. The history list is a `client:load` React component managing only one piece of state (`confirmDeleteId`). `latestIds` is passed as `string[]` (JSON-serializable) from the Astro page and converted to a `Set` inside the component via `useMemo`.

## Phases at a Glance

| Phase                         | What it delivers                                                                             | Key risk                                                                            |
| ----------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 1. Data layer + API routes    | `getLatestIds`, `updateDonation`, `deleteDonation` in lib; edit POST + delete POST endpoints | Ownership check must filter by `user_id` in query (not just RLS)                    |
| 2. Edit page + form           | `/donations/[id]/edit` page + `DonationEditForm` component                                   | Pre-fill must use `donation.donated_at` (already YYYY-MM-DD) — no date parse needed |
| 3. History list + page update | `DonationHistory` component + `donations.astro` wired up                                     | `latestIds` `Set` serialization — must pass as `string[]` not `Set<string>`         |

**Prerequisites:** S-02 fully shipped (confirmed: all 3.x progress items checked ✓)
**Estimated effort:** ~1-2 sessions across 3 phases

## Open Risks & Assumptions

- Deleting the most-recent donation of a type while another donation of the same type exists → eligibility recalculates from the next-most-recent. This is correct behaviour (PRD §Business Logic) and is tested in manual step 8.
- No guard prevents deleting all donations of all types — the resulting "Brak danych" empty state is the correct outcome (PRD US-01 empty state).

## Success Criteria (Summary)

- History list visible on `/donations` after any donation is added; edit and delete actions work end-to-end.
- Eligibility cards reflect updated dates immediately after edit or delete (server recomputes on redirect).
- Amber recalculation warning appears exactly when deleting the most-recent donation of a given type — and not otherwise.
