# Database Schema Migrations (profiles + donations + RLS) Implementation Plan

## Overview

Create Vena's first Supabase schema migration. This establishes two owner-private tables — `profiles` (donor's `sex`, `blood_group`, `rh`) and `donations` (`type`, `donated_at`) — backed by Postgres native enum types and row-level security that confines every row to its owning account. It also generates typed TypeScript bindings from the schema and wires them into the existing Supabase client, so every downstream slice queries against a typed `Database`. This is roadmap foundation **F-01**, the prerequisite that unlocks S-01 (`donor-profile-setup`) and S-02 (`eligibility-calculator-view`).

## Current State Analysis

- **No migrations exist.** `supabase/migrations/` is absent. `supabase/config.toml` has `[db.migrations] enabled = true`, Postgres `major_version = 17`, `project_id = "10x-astro-starter"`, and `[db.seed] enabled = true` pointing at `./seed.sql` (which does not exist). The `supabase` CLI is a dev dependency (`^2.23.4`).
- **Auth is live and is the FK anchor.** `src/lib/supabase.ts:9` builds a `createServerClient` (from `@supabase/ssr`) with the anon `SUPABASE_KEY`; `src/middleware.ts:11` resolves the authenticated user via `supabase.auth.getUser()` and stores it on `context.locals.user`. RLS will key off the request JWT's `auth.uid()`. `user_id` columns must FK to `auth.users(id)`.
- **The client is untyped.** `createClient()` in `src/lib/supabase.ts` returns `createServerClient(...)` with no `Database` generic — queries currently return `any`-shaped data. There is no generated types file and no `gen-types` script in `package.json`.
- **The data contract is pinned by the PRD.** `sex` is the *only* field the eligibility calculator consumes (whole blood 8wk men / 12wk women, plasma 2wk, platelets 4wk — PRD §Business Logic). `blood_group`/`rh` are stored per FR-003 but unused by the MVP calc. `donations.type` ∈ {whole blood, plasma, platelets}. Interval logic lives app-side (tech-stack: "TypeScript with explicit Zod schemas at boundaries"), **not** in the DB.
- **Deploy is decoupled from migrations.** `context/foundation/infrastructure.md` states Cloudflare deploy does not run migrations and "Database migrations do NOT roll back automatically — coordinate with Supabase migration history." Schema changes are a deliberate manual `supabase db push`.

## Desired End State

After this plan:

1. A migration in `supabase/migrations/` creates four enum types and the `profiles` + `donations` tables, with RLS enabled and owner-only policies on both. Running `supabase db reset` applies it cleanly against a fresh local DB.
2. A two-user manual check confirms a donor cannot read or write another donor's `profiles`/`donations` rows.
3. `src/db/database.types.ts` exists, generated from the schema, and `src/lib/supabase.ts` constructs `createServerClient<Database>`, so `supabase.from("profiles")` / `.from("donations")` are fully typed. `npm run lint` and `npm run build` pass.
4. The migration is applied to the remote linked Supabase project via `supabase db push`, and the same isolation check passes against remote.

**Verification:** `supabase db reset` succeeds locally; the generated types file lists `profiles` and `donations` with the enum unions; `npm run build` type-checks the typed client; the manual two-user RLS check shows zero cross-account visibility.

### Key Discoveries:

- `src/lib/supabase.ts:9` — `createServerClient(SUPABASE_URL, SUPABASE_KEY, { cookies: {...} })` is the single client factory; adding the `<Database>` generic here types the whole app.
- `src/middleware.ts:11` — auth identity flows through `auth.getUser()`; the anon-key client carries the user JWT, so RLS `auth.uid()` policies apply automatically to every query.
- `supabase/config.toml:53-65` — migrations and seed are enabled; `major_version = 17` (enables `gen_random_uuid()` natively, no `pgcrypto` extension needed).
- `src/env.d.ts` — `App.Locals.user` is typed as the Supabase `User`; no DB types are imported anywhere yet.
- PRD §Business Logic + roadmap F-01 — fixed enum value sets; `sex` required by the calc but stored on `profiles`, which is created lazily by S-01.

## What We're NOT Doing

- **No interval/eligibility logic in the DB.** No computed columns, no functions for the 8/12/2/4-week rules — that is app-side (S-02).
- **No auto-create profile trigger.** Profiles are created lazily by S-01's profile page; we are not adding a signup trigger.
- **No `updated_at` / moddatetime trigger.** Not displayed in the MVP; can be added later if an audit need appears.
- **No seed data.** Seeding requires a real `auth.users` id to satisfy the FK; low payoff this early.
- **No CI automation of `supabase db push`.** Migrations reach remote as a deliberate manual step per `infrastructure.md`.
- **No pgTAP / test framework.** RLS is verified manually this cycle; the E2E framework choice is an open roadmap question.
- **No application of the data** (no profile page, no donation form, no calculator) — those are S-01/S-02.
- **No `blood_group`/`rh` UI or display** — columns are created and typed only.

## Implementation Approach

Local-first, migration-as-source-of-truth. Author one idempotent-ordered SQL migration covering enums → tables → RLS, validate it by destroying and rebuilding the local DB (`supabase db reset`), prove the privacy NFR with a two-session isolation check, then regenerate TypeScript types from that schema and bind them into the existing client factory. Only once local verification is green do we push to remote. Native Postgres enums give the strongest integrity and produce clean TS unions; RLS uses the canonical `auth.uid() = user_id` owner pattern with explicit per-command policies.

## Critical Implementation Details

- **Enum value naming is a contract.** The enum *labels* stored in Postgres become the TS union members and the values app code (S-01/S-02) must send. Pick stable machine values now — recommended: `donation_type` = `whole_blood | plasma | platelets`; `sex` = `male | female`; `blood_group` = `A | B | AB | O`; `rh` = `positive | negative`. Polish display strings are an app-layer mapping (PRD: UI is Polish-only), never stored. Renaming an enum label later requires `ALTER TYPE ... RENAME VALUE` coordinated across a migration + code change.
- **RLS policy completeness.** `auth.uid() = user_id` must appear in `USING` (for SELECT/UPDATE/DELETE) *and* `WITH CHECK` (for INSERT/UPDATE), otherwise a donor could insert rows owned by someone else or move a row to another owner. Enable RLS with `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` — without it, policies are inert and the table is wide open through the anon key.
- **`donated_at` vs `created_at`.** `donated_at` is a `date` (the real-world donation day the donor enters and edits); `created_at` is `timestamptz default now()` (insert audit). They are distinct and must not be conflated — S-02's calculator anchors on `donated_at`, not `created_at`.
- **Type regeneration discipline.** `src/db/database.types.ts` is generated output, not hand-edited. Any future schema migration must rerun `npm run gen-types`; note this in the file header so the next agent doesn't edit it by hand.

## Phase 1: Schema & RLS migration

### Overview

Author the initial migration creating the enum types, both tables, and owner-only RLS, then verify it against a fresh local database including a cross-user isolation check.

### Changes Required:

#### 1. Initial schema migration

**File**: `supabase/migrations/<timestamp>_init_profiles_donations.sql` (timestamp from `supabase migration new init_profiles_donations`)

**Intent**: Create the full data foundation in one ordered migration — enums first, then tables that reference them, then RLS. This is the single source of truth for the schema; the local DB and remote are both rebuilt from it.

**Contract**:
- Enum types: `sex` (`male`, `female`), `blood_group` (`A`, `B`, `AB`, `O`), `rh` (`positive`, `negative`), `donation_type` (`whole_blood`, `plasma`, `platelets`).
- `profiles`: `user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE`; `sex sex NULL`; `blood_group blood_group NULL`; `rh rh NULL`; `created_at timestamptz NOT NULL DEFAULT now()`. (1:1 with the account; created lazily by S-01.)
- `donations`: `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`; `user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`; `type donation_type NOT NULL`; `donated_at date NOT NULL`; `created_at timestamptz NOT NULL DEFAULT now()`. Index on `(user_id, donated_at desc)` to support the latest-per-type lookup S-02 needs.
- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` on both tables.
- Four policies per table (SELECT, INSERT, UPDATE, DELETE) restricted to `auth.uid() = user_id`, with `WITH CHECK (auth.uid() = user_id)` on INSERT/UPDATE. Policies scoped to the `authenticated` role.

#### 2. Local verification harness (no committed code — documented steps)

**File**: (verification procedure recorded in this plan's Manual Verification + the change folder; no source file)

**Intent**: Prove the privacy NFR before any feature consumes the tables.

**Contract**: After `supabase db reset`, in two contexts (two test users created via local auth, or `set_config('request.jwt.claims', '{"sub":"<uuid>","role":"authenticated"}', true)` in `psql`): user A inserts a profile + donation; user B's `select * from profiles` / `donations` returns zero of A's rows; user B's attempt to insert a row with A's `user_id` is rejected by the `WITH CHECK` policy.

### Success Criteria:

#### Automated Verification:

- Local DB rebuilds cleanly from the migration: `supabase db reset`
- Migration file is present: `ls supabase/migrations/*_init_profiles_donations.sql`
- Enums and tables exist after reset (e.g. `supabase db reset` output shows no errors; `\dt` lists `profiles`, `donations`)

#### Manual Verification:

- Two-user isolation: user B cannot SELECT user A's `profiles` or `donations` rows
- Cross-owner write is rejected: user B cannot INSERT a row carrying user A's `user_id`
- RLS is confirmed enabled on both tables (e.g. `select relrowsecurity from pg_class where relname in ('profiles','donations')` returns true for both)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the two-user RLS check passed before proceeding to Phase 2.

---

## Phase 2: Typed DB bindings

### Overview

Generate TypeScript types from the local schema and wire them into the Supabase client factory so the whole app queries a typed `Database`.

### Changes Required:

#### 1. Type-generation script

**File**: `package.json`

**Intent**: Add a repeatable command to regenerate DB types from the local schema, so type regeneration is a documented, rerunnable step after any future migration.

**Contract**: New `scripts` entry, e.g. `"gen-types": "supabase gen types typescript --local > src/db/database.types.ts"`. (Name/flags may follow the installed CLI's current syntax.)

#### 2. Generated types file

**File**: `src/db/database.types.ts`

**Intent**: The generated `Database` type describing `profiles`, `donations`, and the four enums. Generated output — not hand-edited.

**Contract**: Exports a `Database` type whose `public.Tables` includes `profiles` and `donations` and whose `public.Enums` includes `sex`, `blood_group`, `rh`, `donation_type`. Add a header comment marking it generated and naming `npm run gen-types` as the regeneration command.

#### 3. Type the client factory

**File**: `src/lib/supabase.ts`

**Intent**: Parameterize the client with the generated `Database` type so all `supabase.from(...)` calls are typed end-to-end. Preserve the existing null-return-when-env-absent behavior (AGENTS.md hard rule).

**Contract**: Import `Database` from `@/db/database.types` and call `createServerClient<Database>(SUPABASE_URL, SUPABASE_KEY, {...})`. No change to the function signature or the `null` guard.

### Success Criteria:

#### Automated Verification:

- Types file generated and non-empty: `test -s src/db/database.types.ts`
- Type-check / build passes with the typed client: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification:

- `src/db/database.types.ts` lists `profiles`, `donations`, and the four enum unions with the expected values
- A scratch `supabase.from("profiles").select("sex")` autocompletes/type-checks against the `sex` enum (spot check in editor)

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 3.

---

## Phase 3: Remote application

### Overview

Apply the verified migration to the remote linked Supabase project as a deliberate manual step, and confirm RLS isolation holds against remote.

### Changes Required:

#### 1. Push migration to remote

**File**: (operational — no repo file change)

**Intent**: Promote the locally-verified schema to the remote project so S-01 can build against it. Deploy stays decoupled (per `infrastructure.md`); this is a human-gated action.

**Contract**: Project linked (`supabase link --project-ref <ref>` if not already), then `supabase db push`. Confirm the migration appears in the remote migration history (`supabase migration list` shows it applied both locally and remotely).

### Success Criteria:

#### Automated Verification:

- Remote migration history shows the migration applied: `supabase migration list` (local and remote columns both populated for the new migration)

#### Manual Verification:

- The two-user isolation check (Phase 1) passes against the remote project
- `profiles` and `donations` are visible in the remote Supabase Studio with RLS enabled

**Implementation Note**: `supabase db push` mutates the production schema and does not auto-roll-back. Require explicit human confirmation of the linked project ref before running it.

---

## Testing Strategy

### Unit Tests:

- None this cycle — no application logic is added (no test framework configured yet; AGENTS.md).

### Integration Tests:

- Schema integrity is exercised by `supabase db reset` rebuilding from the migration.

### Manual Testing Steps:

1. Run `supabase db reset` — confirm enums + both tables build with no errors.
2. Create/simulate two authenticated users (A, B). As A, insert a `profiles` row and a `donations` row.
3. As B, `select` from `profiles` and `donations` — confirm none of A's rows are visible.
4. As B, attempt to `insert` a `donations`/`profiles` row with A's `user_id` — confirm the `WITH CHECK` policy rejects it.
5. Confirm `relrowsecurity` is true on both tables.
6. After Phase 3 push, repeat steps 2–5 against the remote project.

## Performance Considerations

Data volume is small (single-donor MVP). The `(user_id, donated_at desc)` index on `donations` keeps the latest-donation-per-type lookup (S-02) cheap as history grows. No other tuning needed at MVP scale.

## Migration Notes

- This is the first migration; it only creates objects (no data backfill, no destructive change).
- Remote application is manual `supabase db push` and is **not** reversible automatically — coordinate with Supabase migration history (`infrastructure.md`).
- Enum value labels are a forward contract: changing them later requires `ALTER TYPE ... RENAME VALUE` plus a coordinated app change.

## References

- Roadmap: `context/foundation/roadmap.md` (F-01)
- PRD business logic & access control: `context/foundation/prd.md`
- Infrastructure / migration coordination: `context/foundation/infrastructure.md`
- Client factory to type: `src/lib/supabase.ts:9`
- Auth identity flow (RLS anchor): `src/middleware.ts:11`
- Supabase config: `supabase/config.toml`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema & RLS migration

#### Automated

- [x] 1.1 Local DB rebuilds cleanly from the migration (`supabase db reset`) — 0ef3494
- [x] 1.2 Migration file present (`ls supabase/migrations/*_init_profiles_donations.sql`) — 0ef3494
- [x] 1.3 Enums and tables exist after reset (no errors; `profiles` + `donations` listed) — 0ef3494

#### Manual

- [x] 1.4 Two-user isolation: user B cannot SELECT user A's rows — 0ef3494
- [x] 1.5 Cross-owner write rejected by `WITH CHECK` — 0ef3494
- [x] 1.6 RLS confirmed enabled on both tables (`relrowsecurity` true) — 0ef3494

### Phase 2: Typed DB bindings

#### Automated

- [x] 2.1 Types file generated and non-empty (`test -s src/db/database.types.ts`)
- [x] 2.2 Build / type-check passes with typed client (`npm run build`)
- [x] 2.3 Lint passes (`npm run lint`)

#### Manual

- [x] 2.4 Types file lists `profiles`, `donations`, and the four enum unions
- [x] 2.5 `supabase.from("profiles").select("sex")` type-checks against the `sex` enum

### Phase 3: Remote application

#### Automated

- [ ] 3.1 Remote migration history shows the migration applied (`supabase migration list`)

#### Manual

- [ ] 3.2 Two-user isolation check passes against the remote project
- [ ] 3.3 `profiles` + `donations` visible in remote Studio with RLS enabled
