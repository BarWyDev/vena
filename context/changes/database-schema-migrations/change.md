---
change_id: database-schema-migrations
title: Database schema migrations — profiles + donations + RLS
status: implemented
created: 2026-06-03
updated: 2026-06-03
archived_at: null
---

## Notes

Roadmap foundation item **F-01** (`context/foundation/roadmap.md`). Supabase migrations for the `profiles` and `donations` tables with owner-only RLS — the data foundation that unlocks S-01 (`donor-profile-setup`) and S-02 (`eligibility-calculator-view`).

- PRD refs: Access Control ("flat single-role model — every user sees only their own data"), NFR "a donor's health data is never visible to any other account".
- `sex` is the only field the eligibility calculator reads; `blood_group`/`rh` are stored per FR-003 but unused by the MVP calc.
