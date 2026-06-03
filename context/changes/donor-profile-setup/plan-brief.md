# Donor Profile Setup — Plan Brief

> Full plan: `context/changes/donor-profile-setup/plan.md`

## What & Why

Build the donor profile page (roadmap S-01, PRD FR-003): a logged-in donor sets and edits their sex, blood group, and Rh. `sex` is the field the S-02 eligibility calculator reads — so this change must force it to be set and block incomplete donors from progressing, otherwise the product's core calculation can't run.

## Starting Point

F-01 already shipped the schema: `profiles` has `user_id` (PK → `auth.users`) and three nullable enum columns (`sex`, `blood_group`, `rh`), with RLS confining each row to its owner. No profile UI, route, or row-creation path exists yet — the migration explicitly leaves the lazy first insert to this change. A clean auth-page pattern (page → React form → redirect-only API route) is established and mirrored here.

## Desired End State

A donor visits `/profile`, sees a Polish form prefilled with any saved values, picks their sex (required) plus optional blood group/Rh, saves, and gets a "Zapisano" confirmation. Any donor who hasn't set `sex` is redirected to `/profile` from protected routes and cannot save it blank. Data stays private per account via RLS.

## Key Decisions Made

| Decision                | Choice                                                        | Why (1 sentence)                                                           | Source |
| ----------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------- | ------ |
| Entry point             | New `/profile` page; dashboard links to it                   | Clean per-page separation; completeness enforced by gating, not redirect.  | Plan   |
| Sex gating scope        | Reusable completeness helper + redirect incomplete donors    | Delivers roadmap's gating intent now and hands S-02 a ready guard.         | Plan   |
| Enum input style        | Native styled `<select>` dropdowns                           | Zero new deps, accessible, fine for 2–4 options each.                      | Plan   |
| Required fields         | Only `sex` required; blood group + Rh optional               | Matches nullable schema and FR-003 — sex is the only calculator input.     | Plan   |
| Save shape              | Single upsert keyed on `user_id`; page prefills existing row | One code path matching the "lazy create" design; no create/edit branching. | Plan   |
| Validation              | Client guard + server redirect with `?error` (mirrors auth)  | Defense in depth, reuses `ServerError`, works without JS.                  | Plan   |
| Success UX              | Redirect to `/profile?saved=1` with a success banner         | Consistent with redirect-not-JSON rule; confirms saved state.             | Plan   |
| Verification            | `lint` + `build` + scripted manual checklist                 | Matches repo reality (no test runner); test framework deferred to S-02.    | Plan   |

## Scope

**In scope:** `/profile` page + form, `/api/profile` upsert route, shared `src/lib/profile.ts` (accessors + Polish labels), enum `SelectField` primitive, dashboard link, route protection, and completeness-redirect gating.

**Out of scope:** S-02 donation flow/calculator, any test framework, shadcn Select or new deps, schema changes, making blood group/Rh required, multi-language support.

## Architecture / Approach

Mirror the auth pattern exactly: a thin `profile.astro` page fetches the row and renders a `client:load` React form that POSTs to a redirect-only `/api/profile` route. A single `src/lib/profile.ts` module (typed `getProfile`, `isProfileComplete`, Polish label maps) is the shared source of truth for the page, the API route, and the middleware gate. Backend-first, then UI, then the app-wide gate that depends on both.

## Phases at a Glance

| Phase                          | What it delivers                                              | Key risk                                          |
| ------------------------------ | ------------------------------------------------------------ | ------------------------------------------------- |
| 1. Profile data layer + API    | `lib/profile.ts` + `/api/profile` upsert with sex validation | Upsert clobbers untouched columns if not prefilled |
| 2. Profile page + form UI      | `/profile` page, form, selects, banners, route protection    | Enum select styling / blank-optional → null handling |
| 3. Completeness gating         | Middleware redirect of incomplete donors to `/profile`       | Redirect loop if `/profile` not exempted          |

**Prerequisites:** F-01 (`database-schema-migrations`) complete — schema + RLS live. ✅
**Estimated effort:** ~1–2 sessions across 3 phases.

## Open Risks & Assumptions

- Gating adds one indexed `profiles` read per protected request — negligible at MVP scale, but it's a new query in the hot path.
- Behavioral correctness is manually verified until S-02 introduces a test framework (open roadmap question, user-owned).
- Upsert sends all three fields each save; the form must prefill so editing one doesn't null the others.

## Success Criteria (Summary)

- A donor can set and edit sex/blood group/Rh and see them persisted and prefilled on reload.
- A donor cannot leave `sex` unset — blocked in the form and redirected to `/profile` from protected routes.
- Profile data stays private per account (RLS isolation verified with a second account).
