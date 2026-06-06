<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Eligibility Calculator View

- **Plan**: context/changes/eligibility-calculator-view/plan.md
- **Scope**: All phases (1–3 of 3)
- **Date**: 2026-06-04
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical · 4 warnings · 4 observations

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

### F1 — No date-format validation before DB insert

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/donations.ts:29–33
- **Detail**: `donated_at` is validated as non-empty and `<= today` via string comparison, but its format is never checked. A string like `"1000-00-00"` passes (month/day 00 is invalid SQL) and reaches the DB, returning the generic error. Not a SQL injection risk (Supabase uses parameterized queries), but application-layer rejection is cleaner than relying on Postgres to reject malformed input.
- **Fix**: Add `const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;` and include `!DATE_RE.test(donatedAt)` in the validation condition.
- **Decision**: PENDING

### F2 — getDonations silently swallows Supabase errors

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/donations.ts:8–14
- **Detail**: `const { data } = await supabase.from("donations")...` discards the error field. A DB failure silently returns `[]` — the page renders as "no donations yet" with no error banner. Consistent with `getProfile` pattern but has higher UX consequence: a donor with 10 donations sees an empty state and may re-submit.
- **Fix A ⭐ Recommended**: Propagate error to the page — return `{ data: data ?? [], error }`, have `donations.astro` pass it to `DonationForm`'s `serverError`.
  - Strength: Donor sees "couldn't load donations" rather than misleading empty state. Matches spirit of redirect-on-error pattern.
  - Tradeoff: Return-type change touches donations.astro and requires ~10-line edit across 2 files.
  - Confidence: HIGH — additive change, no existing callers break.
  - Blind spot: None significant.
- **Fix B**: Add `console.error(error)` log, keep returning `[]`.
  - Strength: One-line, zero surface-area change.
  - Tradeoff: Doesn't fix the misleading UI; only helps via Cloudflare logs.
  - Confidence: HIGH — safe, minimal change.
  - Blind spot: Silent fail stays silent to the user.
- **Decision**: PENDING

### F3 — getDonations fetches all columns and all rows unbounded

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/donations.ts:9
- **Detail**: `.select("*")` with no `.limit()`. The plan consciously accepted this as an MVP tradeoff. However, `getLatestPerType` only needs `type` and `donated_at` — never `id`, `created_at`, or `user_id`. A targeted select costs nothing to write and future-proofs the code.
- **Fix**: Change to `.select("type, donated_at")`. Update the function's return type or use a narrower local type.
- **Decision**: PENDING

### F4 — DONATION_TYPES has two canonical import paths

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/donations.ts:31 vs src/components/donations/EligibilityCards.tsx:3
- **Detail**: The plan says "re-exports DONATION_TYPES from @/lib/eligibility so consumers import from one place." But `EligibilityCards` imports `DONATION_TYPES` directly from `@/lib/eligibility`, while `DonationForm` imports it from `@/lib/donations`. Two paths exist for the same symbol. If the re-export is removed, `DonationForm` silently breaks.
- **Fix**: Pick one canonical path and update both components. Recommended: import from `@/lib/donations` (as the plan intended) — update `EligibilityCards.tsx` line 3.
- **Decision**: PENDING

### F5 — window.history.replaceState without typeof guard

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/donations/EligibilityCards.tsx:26
- **Detail**: Direct `window.history.replaceState` call in the click handler. Safe today because of `client:load`, but no SSR guard. If the component directive ever changes, this will throw. Sibling `ProfileForm.tsx` has no browser globals.
- **Fix**: Wrap in `typeof window !== "undefined"` or leave as-is with a comment noting `client:load` dependency.
- **Decision**: PENDING

### F6 — EligibilityCards date display deviates from plan spec (beneficial drift)

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Detail**: Plan says `toLocaleDateString("pl-PL")`. Implementation uses `new Date(date + "T00:00:00Z").toLocaleDateString("pl-PL", { timeZone: "UTC" })`. The UTC parse + display guards against dates showing one day earlier in timezones east of UTC — consistent with the plan's Critical Implementation Details section. Protective drift, not an error.
- **Fix**: No code change needed. Optionally update plan spec to document the UTC display pattern.
- **Decision**: PENDING

### F7 — getProfile fetched twice per /donations request

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: src/pages/donations.astro:26 + src/middleware.ts:27
- **Detail**: Middleware already calls `getProfile` for the completeness check on every protected route. `donations.astro` calls it again to get `profile.sex`. Two DB round-trips per page load. Could be eliminated by storing profile in `context.locals` in middleware.
- **Fix**: Store profile in `context.locals` in middleware; read it in `donations.astro`. Candidate for a follow-up task.
- **Decision**: PENDING

### F8 — DonationForm has no client-side type-selection guard

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/donations/DonationForm.tsx
- **Detail**: `ProfileForm.tsx` guards the required `sex` field client-side in `handleSubmit`. `DonationForm` has no equivalent guard for the `type` select — only server-side validation. Browser will catch the native `required` attribute, but the pattern is inconsistent.
- **Fix**: Add a `handleSubmit` handler that checks `type !== ""` and sets a local error state, mirroring the `ProfileForm` pattern.
- **Decision**: PENDING
