<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Eligibility Calculator View Implementation Plan

- **Plan**: `context/changes/eligibility-calculator-view/plan.md`
- **Mode**: Deep
- **Date**: 2026-06-04
- **Verdict**: REVISE
- **Findings**: 0 critical, 3 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding

Grounding: 8/8 template paths ✓, 6/6 symbols ✓, brief↔plan ✓

## Findings

### F1 — CI does not run `npm test`

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 — Success Criteria; Testing Strategy
- **Detail**: Roadmap S-02 marks RCKiK calculator correctness as release-blocking and requires unit tests before merge. Phase 1 adds `"test": "vitest run"` but `.github/workflows/ci.yml` only runs `lint` + `build` (lines 20–21). A green CI merge does not prove the 8/8 calculator tests ran.
- **Fix**: Add `- run: npm test` to the `ci` job after `npm ci` / `astro sync`, ideally in Phase 1 automated criteria and Progress step 1.5 (or extend 1.1 scope to “CI runs npm test”).
- **Decision**: PENDING

### F2 — `inputBase` is not importable

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 — DonationForm contract (`plan.md` ~201)
- **Detail**: Plan says the date `<input>` uses the `inputBase` class, but `inputBase` is a private const inside `SelectField.tsx` and `FormField.tsx` — not exported. DonationForm cannot import it as written.
- **Fix**: Specify duplicating the same Tailwind class string inline on the date input (matches `FormField.tsx` pattern), or extracting a shared `inputBase` to `src/lib/` / `src/components/ui/`.
- **Decision**: PENDING

### F3 — `getDonations` error handling → silent empty state

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 2 — `src/lib/donations.ts` contract
- **Detail**: Plan specifies returning `[]` on Supabase error “consistent with `getProfile`'s null-safe pattern,” but `getProfile` does not inspect `error` — it returns `data ?? null` only (`profile.ts:7–9`). On fetch failure, `[]` makes `/donations` look like an empty donor (no cards, misleading copy) instead of surfacing an error.
- **Fix A ⭐ Recommended**: On `getDonations` error, redirect from `donations.astro` with `?error=…` (mirror API pattern) or show `ServerError` via a page-level prop; do not treat errors as zero donations.
  - Strength: Matches redirect-only error UX elsewhere; avoids silent data loss.
  - Tradeoff: Slightly more page logic than `[]` swallow.
  - Confidence: HIGH — `profile.astro` already passes `error` from query string to the form.
  - Blind spot: None significant.
- **Fix B**: Return `[]` but log/monitor; accept MVP silent failure.
  - Strength: Minimal code in Phase 2.
  - Tradeoff: Donor sees wrong empty state on transient Supabase failures.
  - Confidence: MEDIUM — failure rate unknown in prod.
  - Blind spot: No logging infrastructure in plan.
- **Decision**: PENDING

### F4 — Unvalidated `?type=` query param

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 — `donations.astro` contract
- **Detail**: `initialSelectedType` is derived from URL `type` without a stated guard. An invalid value (typo, stale bookmark) can initialize React state outside `DONATION_TYPES`, so no card highlights until the user clicks.
- **Fix**: Parse `type` with `Constants.public.Enums.donation_type.includes(...)`; pass `null` when invalid (same pattern as API type validation in Phase 2).
- **Decision**: PENDING

### F5 — Vitest alias: prefer `fileURLToPath`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 1 — `vitest.config.ts` contract
- **Detail**: Plan uses `new URL("./src", import.meta.url).pathname`. On Windows, `.pathname` can produce `/C:/...` paths that break Vitest resolution. `fileURLToPath` is the usual fix; CI is `ubuntu-latest` today so this may not bite immediately.
- **Fix**: Use `fileURLToPath(new URL("./src", import.meta.url))` in the Vitest alias.
- **Decision**: PENDING

## Internal consistency (Step 1)

- **Contradiction scan**: No “What We're NOT Doing” items reappear in phases. UTC arithmetic is called out in Critical Details and reflected in test expectations (verified numerically).
- **Promise gap**: Top-level verification includes `npm test`; Phase 1 covers it locally; CI gap is F1.
- **Progress↔Phase**: One `## Progress` block; three phase headings match; all Success Criteria bullets have Progress steps; no checkboxes outside Progress. **PASS**

## Sub-agent verification summary

- UTC expected dates for all six sex×type combos: **correct**
- `SelectField` reuse: **viable** with ProfileForm-style `useState` (plan says “mirrors” — sufficient)
- `/donations` in `PROTECTED_ROUTES`: **works** with existing `isProfileComplete` gate
- Blast radius: no existing `/donations` routes or conflicts under `src/`
