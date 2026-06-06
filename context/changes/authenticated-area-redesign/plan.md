# Authenticated Area Redesign Implementation Plan

## Overview

After login the donor currently lands back on the marketing landing page (`signin.ts` redirects to `/`), and every authenticated screen (`/profile`, `/donations`, donation edit, confirm-email, the `/dashboard` hub) still uses the old blue/purple `bg-cosmic` theme — visually disconnected from the new "blood-red" landing + auth redesign.

This change routes the donor straight into their data after login (`/donations` becomes the home of the authenticated area), removes the obsolete `/dashboard` hub, and migrates the whole authenticated surface onto the new red theme through a single shared `AuthShell` so profile and donations are seen and edited in a layout consistent with the landing.

This is an IA + visual-consistency change. No functional requirement changes — FR-003/005/006/007 already cover profile + donations + edit/delete.

## Current State Analysis

- **Post-auth routing:** `src/pages/api/auth/signin.ts:19` redirects to `/` (the marketing `Welcome.astro`). `signup.ts:19` → `/auth/confirm-email` (correct, keep). `middleware.ts:26-29` already bounces authenticated users with an incomplete profile to `/profile` — keep this gate.
- **Two themes coexist:**
  - New red theme: `Welcome.astro`, `auth/signin.astro` (+ `signup.astro`) — dark `#0d0a0a` background, three ambient red glows, dot-pattern overlay, `Topbar.astro`. Auth form primitives already migrated: `FormField.tsx`, `SubmitButton.tsx` (red gradient `linear-gradient(135deg, #dc2626, #b91c1c)`), `ServerError.tsx` (`focus:ring-red-700`, `rgba(254,202,202,…)` text).
  - Old cosmic theme: `bg-cosmic` utility (`global.css:113`) used by `dashboard.astro`, `profile.astro`, `donations.astro`, `donations/[id]/edit.astro`, `confirm-email.astro`; blue/purple accents in `SelectField.tsx`, `DonationForm.tsx`, `DonationEditForm.tsx`, `DonationHistory.tsx`, `EligibilityCards.tsx`.
- **Background markup is duplicated inline** in `Welcome.astro:5-31` and `auth/signin.astro:9-31` — no shared shell exists yet.
- **`Topbar.astro`** branches on `Astro.locals.user`; logged-in branch shows email + "Panel główny" → `/dashboard` + "Wyloguj". Used today only by `Welcome.astro`.
- **`dashboard.astro`** is only a hub of two links (Moje donacje / Twój profil) + sign-out. Not a PRD requirement.
- **`PROTECTED_ROUTES`** = `["/dashboard", "/profile", "/donations"]` (`middleware.ts:5`).
- **Shared primitive cascade:** `SelectField.tsx` is consumed by `ProfileForm`, `DonationForm`, `DonationEditForm` — restyling it once covers all three. The date `<input>` is inline-duplicated in `DonationForm.tsx:42-50` and `DonationEditForm.tsx:37-45` (both `focus:ring-purple-400`).
- **`confirm-email.astro`** copy is in English, inconsistent with the otherwise Polish UI.

## Desired End State

- Logging in lands the donor on `/donations` (or `/profile` if the profile is incomplete, via the existing middleware gate). The marketing landing is no longer the post-login destination.
- `/dashboard` no longer exists as a page; visiting it redirects to `/donations`.
- `/profile`, `/donations`, the donation edit page, and `/auth/confirm-email` render on the new red theme with a top `Topbar` (Donacje · Profil · Wyloguj) above a content card — structurally consistent with the landing.
- No blue/purple/`bg-cosmic` tokens remain in the authenticated surface; `bg-cosmic` is removed from `global.css`.
- `npm run lint` and `npm run build` pass.

### Key Discoveries:

- Red-theme convention is already established in `src/components/auth/` — restyle target is "match FormField/SubmitButton/ServerError", not invent new colors.
- `SelectField.tsx:55` is the single source for the three forms' select styling (`focus:ring-purple-400` → red).
- Background/glow/dot markup to extract lives verbatim in `Welcome.astro:5-31`.
- `middleware.ts` gate (`isProfileComplete`) means the signin redirect target only needs to be `/donations`; an incomplete profile is auto-redirected to `/profile`.

## What We're NOT Doing

- No changes to functional behavior: auth logic, profile/donation CRUD, eligibility calculation, RLS, API contracts — all untouched.
- Not redesigning the marketing landing (`Welcome.astro`) beyond the shared `Topbar` link update it already needs.
- Not touching `signup.ts` redirect (→ confirm-email stays).
- No new PRD content; no roadmap restructure (only a one-line factual correction).
- Not building a combined dashboard "home" widget — `/donations` is the home (per change decision).
- Not changing success-banner semantics (green stays for "saved/added"); only brand accents (blue/purple) move to red.

## Implementation Approach

Sequence delivers the user-visible outcome first (routing), then the visual migration. Phase 1 makes login land on the donor's data and removes the dashboard. Phase 2 extracts the shared `AuthShell` and moves the four pages onto it. Phase 3 finishes the token swap inside the React form components. Phase 4 cleans up docs and the now-dead `bg-cosmic` utility and verifies lint/build.

The restyle is mechanical: mirror the existing `src/components/auth/` red convention. Where a blue/purple Tailwind class appears, map it to its red counterpart (`purple-400`→`red-700`/`red-500`, `blue-100`→the `rgba(254,202,202,…)` rose used in `FormField`).

## Phase 1: Routing & Navigation Rewire

### Overview

Make login land on `/donations`, retire `/dashboard`, and repoint the shared Topbar nav — the IA outcome, independent of styling.

### Changes Required:

#### 1. Post-login redirect

**File**: `src/pages/api/auth/signin.ts`

**Intent**: Send a freshly authenticated donor to their data instead of the marketing landing.

**Contract**: Change the success `context.redirect("/")` (line 19) to `context.redirect("/donations")`. Middleware still redirects to `/profile` when the profile is incomplete, so no extra branching needed here.

#### 2. Retire the dashboard page

**File**: `src/pages/dashboard.astro`

**Intent**: Remove the obsolete hub; preserve old bookmarks/links by redirecting to the new home.

**Contract**: Replace the page's rendered output with a server redirect to `/donations` (frontmatter sets `Astro.response`/`redirect` — mirror the redirect pattern in `donations/[id]/edit.astro:18-20`, or return `Astro.redirect("/donations")`). Net effect: `/dashboard` 302s to `/donations`.

#### 3. Drop `/dashboard` from protection list

**File**: `src/middleware.ts`

**Intent**: `/dashboard` is now a thin redirect, not a protected data page; `/donations` (its target) is already protected.

**Contract**: Remove `"/dashboard"` from `PROTECTED_ROUTES` (line 5). Leave the `isProfileComplete` gate logic unchanged.

#### 4. Repoint Topbar navigation

**File**: `src/components/Topbar.astro`

**Intent**: Logged-in nav should point at the real destinations now that dashboard is gone, and expose both Donacje and Profil.

**Contract**: In the `user`-true branch (lines 20-31), replace the single "Panel główny" → `/dashboard` link with two nav links — "Donacje" → `/donations` and "Profil" → `/profile` — keeping the email span and the "Wyloguj" sign-out form. Styling unchanged in this phase (red restyle of Topbar lands in Phase 2 if needed; it already uses red tokens).

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Build passes: `npm run build`
- No remaining references to `/dashboard` as a destination: `grep -rn "/dashboard" src/` returns only the redirect file (or nothing).

#### Manual Verification:

- Logging in with a complete profile lands on `/donations`.
- Logging in with an incomplete profile lands on `/profile` (middleware gate still works).
- Visiting `/dashboard` redirects to `/donations`.
- Topbar (on landing, logged in) shows Donacje · Profil · Wyloguj and all links work.

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 2.

---

## Phase 2: AuthShell + Page Migration

### Overview

Extract the red-theme background/glow/dot + Topbar into a reusable `AuthShell`, and move the four authenticated pages onto it (Topbar on top, content card below), retiring `bg-cosmic` usage on those pages.

### Changes Required:

#### 1. Shared authenticated shell

**File**: `src/components/AuthShell.astro` (new)

**Intent**: One component owns the red background (dark gradient + three ambient glows + dot-pattern overlay), renders `Topbar` at the top, and slots page content below in a centered container — so every authenticated page is visually consistent and the theme lives in one place.

**Contract**: Astro component that renders the background wrapper markup currently inlined in `Welcome.astro:5-31` (the gradient `div`, three glow `div`s, the dot-pattern `div`), then `<Topbar />`, then a `<slot />` inside a centered `max-w-*` content wrapper. Exposes nothing beyond the default slot. Pages keep using `Layout.astro` for `<head>`/`<html>`; `AuthShell` is the inner body wrapper that replaces the per-page `bg-cosmic` div.

#### 2. Profile page

**File**: `src/pages/profile.astro`

**Intent**: Render the profile form inside `AuthShell` on the red theme.

**Contract**: Replace the `<div class="bg-cosmic …">` wrapper (line 23) with `<AuthShell>`; restyle the card + `<h1>` from blue/purple (`from-blue-200 to-purple-200`) to the red convention (rose card border `rgba(220,38,38,0.15)`, red gradient heading like `auth/signin.astro:48-53`). Keep `ProfileForm` usage and props unchanged.

#### 3. Donations page

**File**: `src/pages/donations.astro`

**Intent**: Render the donations home (eligibility + add form + history) inside `AuthShell` on the red theme.

**Contract**: Replace the `bg-cosmic` wrapper (line 41) with `<AuthShell>`; restyle the card, the `<h1>` gradient, the section subheadings (`text-blue-100/70` → rose), the empty-state hint, and the green success banners stay green. All data-loading frontmatter and child component props unchanged.

#### 4. Donation edit page

**File**: `src/pages/donations/[id]/edit.astro`

**Intent**: Render the edit form inside `AuthShell` on the red theme.

**Contract**: Replace the `bg-cosmic` wrapper (line 26) with `<AuthShell>`; restyle card + heading like the profile page. Keep the not-found redirect (lines 17-20) and `DonationEditForm` usage unchanged.

#### 5. Confirm-email page (restyle + translate)

**File**: `src/pages/auth/confirm-email.astro`

**Intent**: Match the red theme and bring copy in line with the rest of the Polish UI.

**Contract**: Replace the `bg-cosmic` wrapper (line 22) with the auth-style red background (this page is pre-auth, so it can reuse `AuthShell` without a logged-in Topbar, or the signin-style centered card — use `AuthShell` for consistency; Topbar will show the logged-out branch). Restyle card + heading to red convention. Translate the `content` strings (lines 6-18) to Polish: e.g. "Rejestracja zakończona sukcesem" / "Twoje konto zostało utworzone. Możesz się teraz zalogować." / "Przejdź do logowania" and the email-confirmation variant "Sprawdź swoją skrzynkę" / "Wysłaliśmy link aktywacyjny na Twój adres e-mail. Kliknij go, aby aktywować konto." / "Powrót do logowania". Restyle the link from `text-purple-300` to rose.

#### 6. Point landing at the shell (DRY follow-through)

**File**: `src/components/Welcome.astro`

**Intent**: Avoid two copies of the background markup now that `AuthShell` owns it.

**Contract**: Replace the inline background/glow/dot wrapper + `<Topbar />` (lines 5-34 down to the matching close) with `<AuthShell>` wrapping the hero + feature cards + footer. Purely structural — no visual change to the landing. (If the landing's content container differs from the authenticated card width, `AuthShell` keeps a neutral container and the landing supplies its own inner `max-w-*` wrappers, which it already does.)

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Build passes: `npm run build`
- No `bg-cosmic` left on these pages: `grep -rn "bg-cosmic" src/pages` returns nothing.

#### Manual Verification:

- `/profile`, `/donations`, `/donations/<id>/edit` render on the red theme with Topbar on top and content in a card below.
- `/auth/confirm-email` renders on the red theme with Polish copy (both DEV auto-confirm and email-confirm variants).
- Landing page (`/`) looks visually identical to before the `AuthShell` extraction.
- Topbar links navigate correctly from each authenticated page.

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 3.

---

## Phase 3: React Component Restyle

### Overview

Swap the remaining blue/purple brand accents to red inside the donation/profile React components, mirroring the `src/components/auth/` convention. Success banners stay green; error states stay red.

### Changes Required:

#### 1. Select field primitive

**File**: `src/components/profile/SelectField.tsx`

**Intent**: Bring the shared select (used by all three forms) onto the red theme.

**Contract**: In the `inputBase`/conditional classes, replace `focus:ring-purple-400` and `border-white/20` focus accents with the red convention (`focus:ring-red-700`, matching `FormField.tsx:53`); change the label `text-blue-100/80` (line 40) to the rose `rgba(254,202,202,0.7)` used in `FormField.tsx:37`. Keep error-state red and the `bg-slate-900` option background (or swap to a neutral dark consistent with the theme).

#### 2. Donation add form

**File**: `src/components/donations/DonationForm.tsx`

**Intent**: Red-theme the inline date input and label.

**Contract**: Date `<label>` `text-blue-100/80` → rose; date `<input>` `focus:ring-purple-400` → `focus:ring-red-700` (lines 39, 49). Success banner stays green. `SubmitButton` already red.

#### 3. Donation edit form

**File**: `src/components/donations/DonationEditForm.tsx`

**Intent**: Same date-input/label restyle as the add form.

**Contract**: Lines 34, 44 — `text-blue-100/80` → rose, `focus:ring-purple-400` → `focus:ring-red-700`.

#### 4. Donation history list

**File**: `src/components/donations/DonationHistory.tsx`

**Intent**: Red-theme the list item secondary text; keep destructive/amber semantics.

**Contract**: `text-blue-100/60` date text (line 31) → rose/neutral. Leave the amber recompute warning (line 55) and the `bg-destructive` confirm button as-is (semantic, already red). `Button` ghost/destructive variants come from the shared `button.tsx` and need no change.

#### 5. Eligibility cards

**File**: `src/components/donations/EligibilityCards.tsx`

**Intent**: Move the selected-state and label accents from purple to red.

**Contract**: Selected card classes (lines 28-32) `border-purple-400/50 bg-purple-500/20 ring-purple-400/60` → red equivalents (`border-red-500/50 bg-red-500/15 ring-red-500/60`); label `text-blue-100/70` (line 34) → rose. Keep the `window.history.replaceState` selection logic unchanged.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Build passes: `npm run build`
- React Compiler lint clean (no suppressions added): `npm run lint`
- No blue/purple tokens remain in these components: `grep -rn "blue-\|purple-" src/components/donations src/components/profile` returns nothing (or only intentional non-brand cases, reviewed).

#### Manual Verification:

- Profile form, donation add form, donation edit form, history list, and eligibility cards all render in the red theme with no leftover blue/purple.
- Selecting an eligibility card shows a red selected state and still updates the `?type=` URL.
- Success banners (profile saved, donation added/edited/deleted) still display green; error/validation still red.

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 4.

---

## Phase 4: Docs & Cleanup

### Overview

Remove the now-dead `bg-cosmic` utility, fix one stale roadmap line, and run final verification.

### Changes Required:

#### 1. Remove dead theme utility

**File**: `src/styles/global.css`

**Intent**: Drop the cosmic gradient utility now that nothing uses it.

**Contract**: Delete the `@utility bg-cosmic { … }` block (lines 113-115) after confirming `grep -rn "bg-cosmic" src/` returns nothing.

#### 2. Roadmap factual correction

**File**: `context/foundation/roadmap.md`

**Intent**: The baseline line claims middleware protects only `/dashboard`; correct it to reflect reality after this change.

**Contract**: Update line 56 — middleware protects `/profile` and `/donations` (post-change; `/dashboard` is now a redirect). One-line edit, no structural change.

### Success Criteria:

#### Automated Verification:

- `grep -rn "bg-cosmic" src/` returns nothing.
- Linting passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification:

- Full flow smoke test: register → confirm-email (PL) → signin → land on `/donations` → add a donation → edit it → open `/profile` → sign out, all on the red theme with working Topbar navigation.

**Implementation Note**: Final phase — confirm the end-to-end flow manually.

---

## Testing Strategy

No automated test suite is configured (AGENTS.md). Verification is `npm run lint` + `npm run build` plus manual smoke testing.

### Manual Testing Steps:

1. Sign in (complete profile) → expect `/donations` on red theme.
2. Sign in (incomplete profile) → expect `/profile` (middleware gate).
3. Visit `/dashboard` → expect redirect to `/donations`.
4. From `/donations`, use Topbar → Profil → Donacje; confirm navigation.
5. Add a donation, edit it, delete the latest → confirm green success banners, red theme, amber recompute warning intact.
6. Register a new account → confirm-email page is Polish + red theme.
7. Load `/` (landing) → visually unchanged after `AuthShell` extraction.

## Migration Notes

`/dashboard` keeps working as a 302 redirect to `/donations`, so existing bookmarks/links don't break.

## References

- Change identity & decisions: `context/changes/authenticated-area-redesign/change.md`
- Red-theme convention reference: `src/components/auth/FormField.tsx`, `src/components/auth/SubmitButton.tsx`, `src/pages/auth/signin.astro`
- Background markup to extract: `src/components/Welcome.astro:5-31`
- Middleware gate: `src/middleware.ts:19-32`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Routing & Navigation Rewire

#### Automated

- [x] 1.1 Linting passes: `npm run lint` — d2e8787
- [x] 1.2 Build passes: `npm run build` — d2e8787
- [x] 1.3 No remaining `/dashboard` destination references (`grep -rn "/dashboard" src/`) — d2e8787

#### Manual

- [x] 1.4 Login with complete profile lands on `/donations` — d2e8787
- [x] 1.5 Login with incomplete profile lands on `/profile` — d2e8787
- [x] 1.6 `/dashboard` redirects to `/donations` — d2e8787
- [x] 1.7 Topbar shows Donacje · Profil · Wyloguj and links work — d2e8787

### Phase 2: AuthShell + Page Migration

#### Automated

- [x] 2.1 Linting passes: `npm run lint` — 85e4918
- [x] 2.2 Build passes: `npm run build` — 85e4918
- [x] 2.3 No `bg-cosmic` in `src/pages` (`grep -rn "bg-cosmic" src/pages`) — 85e4918

#### Manual

- [x] 2.4 `/profile`, `/donations`, edit page render red theme with top Topbar + content card — 85e4918
- [x] 2.5 `/auth/confirm-email` renders red theme with Polish copy (both variants) — 85e4918
- [x] 2.6 Landing page visually unchanged after extraction — 85e4918
- [x] 2.7 Topbar navigation works from each authenticated page — 85e4918

### Phase 3: React Component Restyle

#### Automated

- [x] 3.1 Linting passes: `npm run lint`
- [x] 3.2 Build passes: `npm run build`
- [x] 3.3 No blue/purple tokens in donation/profile components (`grep -rn "blue-\|purple-" src/components/donations src/components/profile`)

#### Manual

- [x] 3.4 All forms/lists/cards render red theme with no leftover blue/purple
- [x] 3.5 Eligibility card selected-state is red and still updates `?type=` URL
- [x] 3.6 Success banners green, error/validation red

### Phase 4: Docs & Cleanup

#### Automated

- [ ] 4.1 `grep -rn "bg-cosmic" src/` returns nothing
- [ ] 4.2 Linting passes: `npm run lint`
- [ ] 4.3 Build passes: `npm run build`

#### Manual

- [ ] 4.4 End-to-end flow smoke test passes (register → confirm-email → signin → donations → add/edit → profile → signout)
