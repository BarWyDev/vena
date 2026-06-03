# Donor Profile Setup Implementation Plan

## Overview

Build the donor profile page (roadmap **S-01**, PRD **FR-003**): a logged-in donor can set and edit their `sex`, `blood_group`, and `rh`, persisted to the `profiles` table created in F-01. `sex` is the load-bearing field — the S-02 eligibility calculator reads it — so the UI forces it to be set, and a completeness check redirects donors with an unset `sex` to `/profile`, fulfilling the roadmap's "block the donation flow until `sex` is set" intent and handing S-02 a ready-made guard.

## Current State Analysis

- **Schema exists (F-01 complete).** `public.profiles` has `user_id` (PK → `auth.users`, `on delete cascade`), three **nullable** enum columns — `sex` (`male`/`female`), `blood_group` (`A`/`B`/`AB`/`O`), `rh` (`positive`/`negative`) — and `created_at`. RLS confines every row to its owner via `(select auth.uid()) = user_id` on all four commands. The migration comment states the row is *"created lazily by S-01"* — **this plan owns the first insert**. See `supabase/migrations/20260603163127_init_profiles_donations.sql:30-36`.
- **Typed bindings exist.** `src/db/database.types.ts` exports `Database`; enum unions and the `profiles` Row/Insert/Update shapes are generated. `Constants.public.Enums` (`database.types.ts:227-239`) lists the runtime enum values — usable to drive `<option>` lists.
- **Auth-page pattern to mirror.** `src/pages/auth/signin.astro` renders a React form `client:load` inside `Layout`; `SignInForm.tsx` validates client-side then POSTs (`method="POST" action="/api/auth/signin"`); `src/pages/api/auth/signin.ts` null-checks `createClient()`, runs the op, and **redirects on both error (`?error=…`) and success** (`signin.ts:11-19`). This is the exact shape `/profile` + `/api/profile` follow.
- **Middleware contract.** `src/middleware.ts` sets `context.locals.user` from `supabase.auth.getUser()` and gates any path in `PROTECTED_ROUTES` (currently `["/dashboard"]`), redirecting unauthenticated users to `/auth/signin`. Pages read `Astro.locals.user`; AGENTS.md forbids calling `getUser()` in pages.
- **Supabase client factory.** `createClient(requestHeaders, cookies)` in `src/lib/supabase.ts` returns `null` when env vars are absent — every caller must null-check. It is typed with `<Database>`, so `.from("profiles")` is fully typed.
- **Reusable primitives.** `SubmitButton` (`useFormStatus`-driven pending state) and `ServerError` (renders a `?error` message) are drop-in. `FormField` is **text-input only** — the three profile fields are enums and need select inputs that do not exist yet. `components/ui/` holds only `button.tsx` (no shadcn Select).
- **Entry-point gap.** `signin` redirects to `/` (marketing `Welcome`). `/dashboard` is a static stub with no profile link. No profile route exists.
- **Polish-only MVP** (PRD NFR). Enum values are English and stored as-is; Polish display strings are an app-layer mapping (migration comment, lines 13-15).
- **No test runner** (AGENTS.md: "No test suite is configured yet"). CI runs `npm run lint` + `npm run build` on push/PR.

## Desired End State

A logged-in donor visiting `/profile` sees a Polish-language form pre-filled with any values they previously saved. They pick their sex (required) and optionally blood group and Rh, save, and land back on `/profile` with a "Zapisano" confirmation showing the persisted values. A donor who has never set `sex` is redirected to `/profile` whenever they hit a protected route, and cannot leave it incomplete via the UI. Their data is private to their account (RLS). Verify by: completing the flow as a new donor, reloading to confirm prefill, attempting to save with no sex (blocked), and confirming a second account cannot read the first's row.

### Key Discoveries:

- Profile row is created lazily by this change — use `.upsert()` keyed on `user_id`, not a bare insert (`migration:24`, `database.types.ts:75-81`).
- `sex` is the only field the calculator consumes; `blood_group`/`rh` are stored per FR-003 but unused — drives the "only sex required" policy (`migration:26-27`).
- API routes redirect, never return JSON (AGENTS.md hard rule; `signin.ts:11-19`).
- `Constants.public.Enums` gives runtime enum arrays for building option lists without hardcoding (`database.types.ts:231-238`).
- Gating must run *after* `/profile` itself is exempt from the redirect, or it self-loops — handled by checking the target path in Phase 3.

## What We're NOT Doing

- Not building the S-02 donation flow or its routes — only the reusable completeness guard the flow will later consume.
- Not adding a test framework (Vitest/Playwright) — that decision is an open roadmap question owned by the user, deferred to S-02.
- Not adding shadcn Select or any new dependency — native styled `<select>` only.
- Not making `blood_group`/`rh` required, and not editing the schema (all three already nullable).
- Not adding multi-language support — Polish-only labels.
- Not implementing donation history, calculator, or .ics export (S-02/S-03/S-04).

## Implementation Approach

Follow the auth-page pattern exactly: a thin `.astro` page that fetches state and renders a `client:load` React form, posting to a redirect-only API route. Centralize profile data access and Polish label maps in one `src/lib/profile.ts` module so the page, the API route, and the middleware gate all share one source of truth. Build backend-first (Phase 1), then the UI that drives it (Phase 2), then the app-wide gate that depends on both (Phase 3).

## Critical Implementation Details

- **Gating order (Phase 3).** The completeness redirect must exempt `/profile` itself and the auth routes, otherwise an incomplete donor on `/profile` redirects to `/profile` forever. Gate only when the donor is authenticated, the path is protected, and the target is not already `/profile`.
- **Upsert clobbers columns.** `.upsert()` writes every column in the payload. The form must submit the current values of all three fields (prefilled from the existing row) so an edit to one field does not null the others. Optional fields submit as `null` when blank, never as empty string (enum columns reject `''`).

## Phase 1: Profile data layer + save API

### Overview

Create the shared profile module (typed accessors + Polish label maps) and the `/api/profile` upsert route with server-side sex validation. No UI yet — verifiable by lint, build, and a direct POST.

### Changes Required:

#### 1. Profile data module

**File**: `src/lib/profile.ts`

**Intent**: One source of truth for reading a donor's profile, deciding completeness, and mapping enum values to Polish display strings. Consumed by the page (Phase 2), the API route (below), and the middleware gate (Phase 3).

**Contract**:
- `getProfile(supabase, userId): Promise<ProfileRow | null>` — selects the single `profiles` row for the user (returns `null` when none exists). Typed against `Database["public"]["Tables"]["profiles"]["Row"]`.
- `isProfileComplete(profile): boolean` — true iff `profile?.sex` is set (the only calculator-required field).
- Polish label maps for each enum, keyed by the English value, e.g. `SEX_LABELS`, `BLOOD_GROUP_LABELS`, `RH_LABELS`. Source the keys from `Constants.public.Enums` (`database.types.ts:231-238`) so they stay in sync with the schema. Suggested Polish strings: sex `male→"Mężczyzna"`, `female→"Kobieta"`; rh `positive→"Rh+"`, `negative→"Rh−"`; blood group A/B/AB/O as-is.

#### 2. Profile save API route

**File**: `src/pages/api/profile.ts`

**Intent**: Persist the submitted profile via upsert, enforcing that `sex` is present, following the redirect-not-JSON rule.

**Contract**: `POST` `APIRoute`. Reads `formData` (`sex`, `blood_group`, `rh`). Null-checks `createClient()` → redirect `/profile?error=…` if absent. Reads `context.locals.user`; if absent redirect `/auth/signin`. Validates `sex` is one of the enum values → if missing/invalid redirect `/profile?error=<polish message>`. Normalizes blank optional fields to `null`. Calls `supabase.from("profiles").upsert({ user_id, sex, blood_group, rh }, { onConflict: "user_id" })`. On Supabase error → redirect `/profile?error=…`. On success → redirect `/profile?saved=1`.

### Success Criteria:

#### Automated Verification:

- [ ] Linting passes: `npm run lint`
- [ ] Type-checked build passes: `npm run build`

#### Manual Verification:

- [ ] A POST to `/api/profile` with a valid `sex` while logged in writes/updates the row (verify in Supabase).
- [ ] A POST with no `sex` redirects to `/profile?error=…` and writes nothing.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding.

---

## Phase 2: Profile page + form UI

### Overview

Build the user-facing `/profile` page and React form, register the route as protected, surface success/error banners, and link to it from the dashboard.

### Changes Required:

#### 1. Enum select form primitive

**File**: `src/components/profile/SelectField.tsx`

**Intent**: A styled native-`<select>` field mirroring `FormField`'s label/error/glass styling, for enum inputs. Reused for all three fields.

**Contract**: Props `{ id, name, label, value, onChange, options: {value,label}[], required?, placeholder?, error?, icon }`. Renders a `<select>` with a leading placeholder `<option value="">` (Polish, e.g. "Wybierz…"), styled to match `FormField`'s `inputBase`. Submits the raw enum value (or empty string when placeholder selected).

#### 2. Profile form

**File**: `src/components/profile/ProfileForm.tsx`

**Intent**: The interactive form: three selects, client-side guard that `sex` is chosen, success and server-error banners. Mirrors `SignInForm`'s validate/clearError/handleSubmit shape.

**Contract**: Props `{ initial: { sex, blood_group, rh }, serverError?, saved?: boolean }`. Local state seeded from `initial` (prefill). `method="POST" action="/api/profile"`, `noValidate`. `handleSubmit` blocks submit and sets an error if `sex` is empty. Renders three `SelectField`s (options + Polish labels from `src/lib/profile.ts`), a `ServerError` (`serverError`), a success banner when `saved`, and `SubmitButton` (pending text e.g. "Zapisywanie…"). Option lists come from the label maps in `profile.ts`.

#### 3. Profile page

**File**: `src/pages/profile.astro`

**Intent**: Fetch the donor's existing profile, render the form prefilled, pass through `?error`/`?saved` flags. Mirrors `signin.astro`.

**Contract**: Reads `Astro.locals.user` (never `getUser()`). Creates the Supabase client, calls `getProfile(...)`, passes the row (or empty defaults) as `initial`. Reads `error` and `saved` from `Astro.url.searchParams`. Renders `ProfileForm client:load` inside `Layout` with the established glass styling. Polish page heading (e.g. "Twój profil").

#### 4. Protect the route

**File**: `src/middleware.ts`

**Intent**: Require auth for `/profile`.

**Contract**: Add `"/profile"` to `PROTECTED_ROUTES` (line 4).

#### 5. Dashboard entry point

**File**: `src/pages/dashboard.astro`

**Intent**: Give donors a way to reach the profile.

**Contract**: Add a link/button to `/profile` (Polish label, e.g. "Twój profil") in the dashboard card.

### Success Criteria:

#### Automated Verification:

- [ ] Linting passes: `npm run lint`
- [ ] Type-checked build passes: `npm run build`

#### Manual Verification:

- [ ] Logged-in donor opens `/profile`, sets sex (+ optional fields), saves, lands on `/profile?saved=1` with a "Zapisano" banner.
- [ ] Reloading `/profile` shows the previously saved values prefilled.
- [ ] Submitting with no sex selected is blocked client-side with a Polish error; the dashboard link reaches `/profile`.
- [ ] Unauthenticated access to `/profile` redirects to `/auth/signin`.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding.

---

## Phase 3: Completeness gating

### Overview

Redirect logged-in donors whose `sex` is unset to `/profile` on any protected route, delivering the roadmap's gating intent and giving S-02 a ready guard. Ordered last so `/profile` exists as a non-looping target.

### Changes Required:

#### 1. Incomplete-profile redirect

**File**: `src/middleware.ts`

**Intent**: After auth resolves, send donors with no `sex` to `/profile` so they cannot enter the (future) donation flow incomplete — without creating a redirect loop on `/profile` itself.

**Contract**: When `context.locals.user` is set, the path is protected, and the target is **not** already `/profile`, call `getProfile(...)` + `isProfileComplete(...)`; if incomplete, `context.redirect("/profile")`. Reuse the `supabase` client already created at the top of `onRequest` (do not create a second). Skip the check for unauthenticated requests and for `/profile`.

### Success Criteria:

#### Automated Verification:

- [ ] Linting passes: `npm run lint`
- [ ] Type-checked build passes: `npm run build`

#### Manual Verification:

- [ ] A logged-in donor with no `sex` set is redirected to `/profile` when visiting `/dashboard`.
- [ ] After setting `sex`, the same donor can reach `/dashboard` without redirect.
- [ ] No redirect loop occurs while on `/profile` with an incomplete profile.
- [ ] A second account cannot read the first account's profile row (RLS isolation holds).

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation.

---

## Testing Strategy

### Unit Tests:

- None added — no test runner is configured (AGENTS.md), and introducing one is deferred to S-02 per the open roadmap question. Correctness rests on the manual checklist below plus the type-checked build.

### Integration Tests:

- Deferred to S-02 (E2E framework decision pending).

### Manual Testing Steps:

1. Log in as a fresh donor → land on `/` → open `/dashboard` → confirm redirect to `/profile` (Phase 3).
2. On `/profile`, attempt save with no sex → blocked with Polish error (Phase 2).
3. Select sex (+ optional blood group/Rh) → save → see "Zapisano" banner on `/profile?saved=1` (Phase 1+2).
4. Reload `/profile` → values prefilled (Phase 2).
5. Visit `/dashboard` → no redirect now that sex is set (Phase 3).
6. Edit one field, leaving others → save → confirm untouched fields not nulled (upsert prefill, Phase 1).
7. Sign out, hit `/profile` directly → redirected to `/auth/signin` (Phase 2).
8. With a second account, confirm it sees its own empty profile, not the first donor's data (RLS).

## Performance Considerations

Phase 3 adds one `profiles` read per protected request for authenticated donors. The table is 1 row per user keyed on PK `user_id`, so the lookup is index-served and negligible at MVP scale (PRD: small users / low QPS). No caching needed.

## Migration Notes

No schema changes — F-01's migration already provides every column. No data migration; existing accounts simply have no `profiles` row until they save (the lazy-create path).

## References

- Roadmap item: `context/foundation/roadmap.md` (S-01, lines 77-87)
- PRD requirement: `context/foundation/prd.md` (FR-003, line 65)
- Schema + RLS: `supabase/migrations/20260603163127_init_profiles_donations.sql`
- Typed bindings: `src/db/database.types.ts`
- Pattern to mirror: `src/pages/auth/signin.astro`, `src/components/auth/SignInForm.tsx`, `src/pages/api/auth/signin.ts`
- Middleware contract: `src/middleware.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Profile data layer + save API

#### Automated

- [ ] 1.1 Linting passes: `npm run lint`
- [ ] 1.2 Type-checked build passes: `npm run build`

#### Manual

- [ ] 1.3 POST with valid sex writes/updates the row
- [ ] 1.4 POST with no sex redirects to `/profile?error=…` and writes nothing

### Phase 2: Profile page + form UI

#### Automated

- [ ] 2.1 Linting passes: `npm run lint`
- [ ] 2.2 Type-checked build passes: `npm run build`

#### Manual

- [ ] 2.3 Set sex + save → `/profile?saved=1` with "Zapisano" banner
- [ ] 2.4 Reload `/profile` shows saved values prefilled
- [ ] 2.5 Submit with no sex blocked client-side; dashboard link reaches `/profile`
- [ ] 2.6 Unauthenticated `/profile` redirects to `/auth/signin`

### Phase 3: Completeness gating

#### Automated

- [ ] 3.1 Linting passes: `npm run lint`
- [ ] 3.2 Type-checked build passes: `npm run build`

#### Manual

- [ ] 3.3 Donor with no sex redirected to `/profile` from `/dashboard`
- [ ] 3.4 After setting sex, `/dashboard` reachable without redirect
- [ ] 3.5 No redirect loop on `/profile` with incomplete profile
- [ ] 3.6 Second account cannot read the first's profile row (RLS isolation)
