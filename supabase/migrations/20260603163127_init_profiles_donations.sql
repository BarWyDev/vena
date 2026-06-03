-- Migration: init profiles + donations + RLS
-- Foundation F-01 — Vena's first schema. Establishes two owner-private tables
-- backed by native Postgres enums, with row-level security confining every row
-- to its owning account (auth.uid() = user_id).
--
-- Order is load-bearing: enums first, then tables that reference them, then RLS.
-- This file is the single source of truth for the schema; local and remote are
-- both rebuilt from it. See context/changes/database-schema-migrations/plan.md.

-- ---------------------------------------------------------------------------
-- Enum types
-- The enum LABELS below are a forward contract: they become the TypeScript
-- union members and the values app code (S-01/S-02) must send. Polish display
-- strings are an app-layer mapping, never stored. Renaming a label later needs
-- ALTER TYPE ... RENAME VALUE coordinated with a code change.
-- ---------------------------------------------------------------------------

create type public.sex as enum ('male', 'female');
create type public.blood_group as enum ('A', 'B', 'AB', 'O');
create type public.rh as enum ('positive', 'negative');
create type public.donation_type as enum ('whole_blood', 'plasma', 'platelets');

-- ---------------------------------------------------------------------------
-- profiles — 1:1 with the account, created lazily by S-01.
-- All donor attributes are nullable: the profile row may exist before the donor
-- has filled everything in. `sex` is the only field the eligibility calculator
-- (S-02) consumes; blood_group/rh are stored per FR-003 but unused by the calc.
-- ---------------------------------------------------------------------------

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  sex public.sex,
  blood_group public.blood_group,
  rh public.rh,
  created_at timestamptz not null default now()
);

comment on table public.profiles is 'Donor profile, 1:1 with auth.users. Owner-private via RLS.';

-- ---------------------------------------------------------------------------
-- donations — one row per donation event.
-- donated_at is the real-world donation day the donor enters/edits (a date).
-- created_at is the insert audit timestamp. They are distinct: S-02 anchors its
-- interval math on donated_at, never created_at.
-- ---------------------------------------------------------------------------

create table public.donations (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  type public.donation_type not null,
  donated_at date not null,
  created_at timestamptz not null default now()
);

comment on table public.donations is 'Donation events, owner-private via RLS. donated_at is the real-world day; created_at is the insert audit.';

-- Supports the latest-donation-per-type lookup S-02 needs.
create index donations_user_id_donated_at_idx
  on public.donations (user_id, donated_at desc);

-- ---------------------------------------------------------------------------
-- Row-level security
-- Without ENABLE ROW LEVEL SECURITY the policies are inert and the tables are
-- wide open through the anon key. auth.uid() must appear in USING (read path)
-- AND WITH CHECK (write path) so a donor can neither read another donor's rows
-- nor insert/move a row to another owner. (select auth.uid()) is wrapped in a
-- subquery so Postgres caches it as an initplan instead of re-evaluating per row.
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.donations enable row level security;

-- profiles policies (one per command, scoped to the authenticated role)
create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "profiles_insert_own" on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "profiles_delete_own" on public.profiles
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- donations policies (one per command, scoped to the authenticated role)
create policy "donations_select_own" on public.donations
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "donations_insert_own" on public.donations
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "donations_update_own" on public.donations
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "donations_delete_own" on public.donations
  for delete to authenticated
  using ((select auth.uid()) = user_id);
