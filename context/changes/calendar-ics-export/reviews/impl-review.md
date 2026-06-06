<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Calendar ICS Export

- **Plan**: context/changes/calendar-ics-export/plan.md
- **Scope**: All phases (Phase 1 + Phase 2 of 2)
- **Date**: 2026-06-06
- **Verdict**: APPROVED
- **Findings**: 0 critical  1 warning  4 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Plan Adherence Summary

24 planned items checked — 24 MATCH, 0 DRIFT, 0 MISSING.
1 EXTRA: PRODID / CALSCALE / METHOD in ics.ts (benign RFC 5545 metadata, no plan guardrail violated, improves client compatibility).

## Findings

### F1 — Invalid type silently falls back to whole_blood

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/donations/export.ts:24–26
- **Detail**: The plan explicitly specified "defaults to whole_blood when absent or invalid." Implementation follows the plan. However, the existing POST route (donations.ts:22–24) treats any invalid/missing type as a client error and redirects. The silent fallback means a manually crafted URL with ?type=garbage silently downloads a whole_blood .ics with no error indication — a confusing UX edge case absent from the UI-constructed happy path.
- **Fix A ⭐ Recommended**: Keep the current fallback, add a comment documenting the intentional deviation from the POST pattern. The UI always sends a valid type; the fallback only applies to manually crafted URLs where "give them something useful" is reasonable.
  - Strength: Zero code change; matches the plan; avoids a redirect the user would have to handle if they link directly.
  - Tradeoff: Pattern inconsistency persists; future devs may copy the pattern without understanding why.
  - Confidence: HIGH — the export is a GET download, not a form action; different semantics justify different error handling.
  - Blind spot: None significant.
- **Fix B**: Mirror donations.ts — redirect on invalid/missing type. Replace the fallback with context.redirect('/donations?error=…') when typeRaw is absent or not in DONATION_TYPE_VALUES.
  - Strength: Consistent with the existing API error-handling contract.
  - Tradeoff: Slight plan deviation; a bare /api/donations/export URL would now redirect rather than produce a useful download.
  - Confidence: MED — depends on whether any caller relies on the default.
  - Blind spot: No external callers identified, but not verified.
- **Decision**: PENDING

### F2 — No input validation on dateStr in generateIcs

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/ics.ts:10, 21
- **Detail**: generateIcs accepts dateStr without validating its shape. A malformed date (empty string, wrong format) silently produces an invalid DTSTART. An embedded \r\n in dateStr could inject extra ICS lines. In practice the only caller passes calculateEligibility's output — always a valid YYYY-MM-DD string — so risk is currently theoretical.
- **Fix**: Assert dateStr matches /^\d{4}-\d{2}-\d{2}$/ at the top of generateIcs and throw if not.
- **Decision**: PENDING

### F3 — No try/catch around Promise.all in export route

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/donations/export.ts:28
- **Detail**: If getProfile or getDonations throws (network timeout, Supabase outage), the exception propagates uncaught and produces an unformatted 500 rather than a clean redirect. The existing donations.ts POST route has the same gap, so this is not a regression.
- **Fix**: Wrap lines 28–39 in try/catch and redirect to /donations?error=… on any thrown exception.
- **Decision**: PENDING

### F4 — URL string concatenation in EligibilityCards (pre-existing)

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/donations/EligibilityCards.tsx:31
- **Detail**: window.history.replaceState uses "/donations?type=" + type (string concatenation). This line pre-existed this change and was not introduced here. type is DonationType — a TypeScript union of three safe ASCII strings — so there is no actual injection risk.
- **Fix**: Use new URLSearchParams({ type }).toString() or encodeURIComponent(type) for robustness if the enum ever expands.
- **Decision**: PENDING

### F5 — Null-fallback logic in EligibilityCards is non-obvious

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/donations/EligibilityCards.tsx:15–16
- **Detail**: resolvedType = selectedType ?? "whole_blood" then exportDate = eligibility[resolvedType]. When selectedType is null AND eligibility.whole_blood is also null, the export link is correctly hidden — but the double-null path is not immediately obvious to a future reader.
- **Fix**: One-line comment above resolvedType explaining the invariant.
- **Decision**: PENDING
