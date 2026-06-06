<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Donation History Management

- **Plan**: context/changes/donation-history-management/plan.md
- **Scope**: All phases (1–3 of 3)
- **Date**: 2026-06-05
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical 3 warnings 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Findings

### F1 — edit.astro redirect doesn't halt execution

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/donations/[id]/edit.astro:17–20
- **Detail**: When data is null, the page sets Astro.response.status = 302 + Location header but does NOT halt frontmatter execution. The Layout still renders and returns a 302 with a full HTML body. Browsers follow the redirect and ignore the body (functionally correct), but the server wastes a full render pass on every 404 hit. This was a deliberate workaround: `return Astro.redirect()` crashes the `@typescript-eslint/no-misused-promises` rule in this project's ESLint setup (astro-eslint-parser bug — "Expected node to have a parent" on top-level frontmatter return).
- **Fix A ⭐ Recommended**: Disable the crashing rule for `**/*.astro` files in eslint.config.js, then use `return Astro.redirect("/donations")`.
  - Strength: Fixes the root cause; canonical Astro pattern; unblocks all future pages.
  - Tradeoff: Cross-cutting ESLint config change; needs audit to confirm rule doesn't catch real bugs in .astro files.
  - Confidence: MED
  - Blind spot: Haven't verified if no-misused-promises catches anything real in existing .astro files.
- **Fix B**: Keep workaround + wrap `<Layout>` in `{data && <Layout>…</Layout>}` to skip render on redirect.
  - Strength: No config change; stays in the page file.
  - Tradeoff: Non-idiomatic; future devs may copy the broken pattern.
  - Confidence: HIGH
  - Blind spot: Still returns a 302 with a small empty body.
- **Decision**: PENDING

### F2 — CSRF protection absent on mutation endpoints

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/donations/[id]/delete.ts (and siblings)
- **Detail**: Plain HTML form POSTs have no CSRF token. Supabase RLS enforces user_id ownership so cross-user data loss is prevented, but a malicious page could trick a logged-in user into deleting their own records. This gap pre-dates this change (the add endpoint has the same issue).
- **Fix**: Accept as known MVP risk; record as a lesson for the security hardening pass.
- **Decision**: PENDING

### F3 — PROTECTED_ROUTES covers edit route only by prefix

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/middleware.ts:5
- **Detail**: AGENTS.md hard rule says to add new route paths to PROTECTED_ROUTES explicitly. `/donations/[id]/edit` is covered by startsWith "/donations" but not listed. Fragile if middleware moves to exact matching.
- **Fix**: Add a comment in middleware.ts documenting that "/donations" covers all /donations/\* sub-routes by startsWith.
- **Decision**: PENDING

### F4 — getDonations silently swallows query errors

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/donations.ts:8–15
- **Detail**: getDonations discards the Supabase error field — a network error silently returns [] and the page renders as if the user has no donations. updateDonation and deleteDonation in the same file correctly return { error }. Pre-existing issue, not introduced by this change.
- **Fix**: Destructure and log/return the error before returning [].
- **Decision**: PENDING

### F5 — "added" banner lives inside React, "edited"/"deleted" live in Astro

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/donations.astro:44–56, src/components/donations/DonationForm.tsx:22–25
- **Detail**: Three post-action banners use the same visual style and query-param pattern but live in two different rendering layers. Pre-existing for "added"; not introduced here.
- **Fix**: Move "added" banner out of DonationForm into the page template, or accept the split.
- **Decision**: PENDING

### F6 — confirm-delete button duplicates Button component's Tailwind

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/donations/DonationHistory.tsx:59–64
- **Detail**: Plan explicitly specified `<button type="submit">` (not SubmitButton) — plan adherence is MATCH. However, the inline Tailwind classes manually replicate what `Button variant="destructive" size="sm"` already renders. If Button styling changes, this will drift visually.
- **Fix**: `<Button variant="destructive" size="sm" asChild><button type="submit">Potwierdź</button></Button>`
- **Decision**: PENDING
