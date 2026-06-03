# Database Schema Migrations (profiles + donations + RLS) — Plan Brief

> Full plan: `context/changes/database-schema-migrations/plan.md`

## What & Why

Create Vena's first Supabase migration: two owner-private tables — `profiles` (donor's `sex`, `blood_group`, `rh`) and `donations` (`type`, `donated_at`) — with row-level security confining every row to its owning account, plus generated TypeScript bindings. This is roadmap foundation **F-01**, the prerequisite that unlocks S-01 (donor profile) and S-02 (eligibility calculator). The privacy guarantee ("a donor's health data is never visible to any other account") is a release-blocking NFR.

## Starting Point

The repo has live Supabase email/password auth (`src/lib/supabase.ts`, `src/middleware.ts`) but **zero schema** — `supabase/migrations/` doesn't exist and the client is untyped (returns `any`-shaped data). `config.toml` has migrations + seed enabled on Postgres 17; the `supabase` CLI is already a dev dependency.

## Desired End State

A migration creates four enums + both tables with RLS and owner-only policies; `supabase db reset` rebuilds it cleanly; a generated `src/db/database.types.ts` types the client so all downstream queries are typed; the migration is pushed to the remote project; and a two-user check proves no donor can see another's data.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Categorical fields | Postgres native ENUM types | Strongest integrity + clean TS unions; RCKiK values are fixed so low churn | Plan |
| profiles ↔ auth.users | `user_id` PK, created lazily by S-01 | Simplest 1:1; the profile page owns creation and the sex-gating | Plan |
| `sex` nullability | Nullable, enforced in app/UI | Lets a profile exist incrementally; matches S-01's planned UI gating | Plan |
| `blood_group` / `rh` | Nullable, typed, optional | Honors FR-003 (storable) without blocking profile completion | Plan |
| TypeScript types | Generate now + type the client | Every later slice gets typed queries from day one | Plan |
| Row metadata | `id` + `created_at`; donations keep `donated_at` | Stable row identity for edit/delete; separates event date from insert time | Plan |
| Migration delivery | Local-first, manual `db push`, no seed | Matches infrastructure.md's manual-coordination stance; agent never auto-mutates prod | Plan |
| RLS verification | Manual two-user check + SQL assertions | Proves the privacy NFR now without standing up a test framework | Plan |

## Scope

**In scope:** four enum types; `profiles` + `donations` tables; RLS enabled + four owner-only policies per table; `(user_id, donated_at desc)` index; generated DB types + typed client; manual RLS isolation check; remote `db push`.

**Out of scope:** eligibility/interval logic (S-02); profile UI / donation forms (S-01/S-02); auto-create profile trigger; `updated_at`; seed data; CI migration automation; pgTAP/test framework; blood_group/rh display.

## Architecture / Approach

One ordered SQL migration (enums → tables → RLS). RLS uses the canonical `auth.uid() = user_id` owner pattern — the anon-key client already carries the user JWT via middleware, so policies apply to every query automatically. Validate by rebuilding the local DB and running a two-session isolation check, regenerate types from that schema, bind `createServerClient<Database>`, then push to remote only after local green.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Schema & RLS migration | Enums + tables + owner-only RLS, verified locally | Incomplete `WITH CHECK` clause leaving cross-owner writes possible |
| 2. Typed DB bindings | Generated `database.types.ts` + typed client | gen-types CLI flag drift; regeneration discipline |
| 3. Remote application | Migration pushed + verified on remote | `db push` mutates prod and does not auto-roll-back |

**Prerequisites:** Supabase CLI available (dev dep ✓); a linked remote project ref for Phase 3.
**Estimated effort:** ~1 session across 3 phases (small, foundation-level).

## Open Risks & Assumptions

- Enum labels are a forward contract — renaming later needs `ALTER TYPE ... RENAME VALUE` + coordinated code change.
- RLS is verified manually this cycle; no automated regression guard until the E2E framework (open roadmap question) is chosen.
- Phase 3 assumes a remote project is linked; the push is human-gated and irreversible.

## Success Criteria (Summary)

- `supabase db reset` rebuilds the schema with no errors; enums + both tables present with RLS enabled.
- A second donor cannot read or write the first donor's `profiles`/`donations` rows (local and remote).
- `npm run build` type-checks the typed client against the generated `Database` types.
