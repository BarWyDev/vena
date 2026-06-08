-- Migration: add donation volume (volume_ml)
-- Feature: donation-volume-tracking. Lets a donor record how much blood each
-- donation was, and powers the cumulative-total view on /donations.
--
-- Order is load-bearing: add the column NULLABLE first so the statement succeeds
-- against existing rows, BACKFILL those rows with the per-type RCKiK standard so
-- the running total is meaningful immediately, THEN tighten to NOT NULL and add a
-- sanity bound. RLS needs no change: donations policies are row-scoped
-- (auth.uid() = user_id) and cover every column, including this one.

-- 1. Add nullable so the ALTER succeeds with existing rows present.
alter table public.donations
  add column volume_ml integer;

-- 2. Backfill historical rows with the per-type standard volume (ml). These are
-- estimates, not measured values; the donor can correct any row via edit. The
-- same constants are the form defaults (DEFAULT_VOLUME_ML in src/lib/donations.ts).
update public.donations set volume_ml = 450 where type = 'whole_blood' and volume_ml is null;
update public.donations set volume_ml = 600 where type = 'plasma'      and volume_ml is null;
update public.donations set volume_ml = 220 where type = 'platelets'   and volume_ml is null;

-- 3. Lock the column: every donation now carries a volume, and a positive,
-- bounded one (guards typos like a missing/extra digit). 2000 ml is well above
-- any single real donation.
alter table public.donations
  alter column volume_ml set not null;

alter table public.donations
  add constraint donations_volume_ml_check check (volume_ml > 0 and volume_ml <= 2000);

comment on column public.donations.volume_ml is 'Volume of this donation in millilitres. NOT NULL, 1..2000. Backfilled per-type for pre-feature rows.';
