-- Two-user RLS isolation harness for profiles + donations (Phase 1 manual check).
-- Run against the LOCAL db after `supabase db reset`:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f context/changes/database-schema-migrations/rls-check.sql
-- (Phase 3) point the same file at the remote connection string to re-verify.
--
-- Proves: (1) user B cannot SELECT user A's rows, (2) user B cannot INSERT a row
-- carrying A's user_id (WITH CHECK rejects it), (3) RLS is enabled on both tables.
-- We impersonate users with set_config('request.jwt.claims', ...) + `set role
-- authenticated`, which is exactly how PostgREST presents a logged-in request,
-- so auth.uid() resolves to the jwt `sub` claim. The config is set SESSION-scoped
-- (third arg false) because psql autocommits each statement — a transaction-local
-- (true) setting would vanish before the next statement and auth.uid() would be null.

\set ON_ERROR_STOP off

-- Fixed UUIDs for the two test donors.
\set A_ID '00000000-0000-0000-0000-00000000000a'
\set B_ID '00000000-0000-0000-0000-00000000000b'

-- Seed two auth.users rows (FK anchor). Local-only; bypasses the auth API.
insert into auth.users (id, instance_id, aud, role, email)
values
  (:'A_ID', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local'),
  (:'B_ID', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local')
on conflict (id) do nothing;

-- ---- As user A: insert own profile + donation -----------------------------
set role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'A_ID', 'role', 'authenticated')::text, false);

insert into public.profiles (user_id, sex, blood_group, rh) values (:'A_ID', 'male', 'A', 'positive');
insert into public.donations (user_id, type, donated_at) values (:'A_ID', 'whole_blood', current_date);

\echo '--- A sees own rows (expect profiles=1, donations=1) ---'
select 'A_profiles' as label, count(*) from public.profiles;
select 'A_donations' as label, count(*) from public.donations;

reset role;
select set_config('request.jwt.claims', NULL, false);

-- ---- As user B: must NOT see A's rows --------------------------------------
set role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'B_ID', 'role', 'authenticated')::text, false);

\echo '--- B reads (EXPECT 0 / 0 — A is invisible) ---'
select 'B_sees_profiles' as label, count(*) from public.profiles;
select 'B_sees_donations' as label, count(*) from public.donations;

\echo '--- B tries to write a row owned by A (EXPECT both to FAIL with RLS error) ---'
insert into public.profiles (user_id, sex) values (:'A_ID', 'female');
insert into public.donations (user_id, type, donated_at) values (:'A_ID', 'plasma', current_date);

reset role;
select set_config('request.jwt.claims', NULL, false);

-- ---- RLS enabled flag ------------------------------------------------------
\echo '--- relrowsecurity (EXPECT true for both) ---'
select relname, relrowsecurity
from pg_class
where relname in ('profiles', 'donations')
order by relname;

-- ---- Cleanup so the harness is rerunnable ----------------------------------
delete from auth.users where id in (:'A_ID', :'B_ID');
