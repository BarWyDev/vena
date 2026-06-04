---
change_id: donor-profile-setup
title: Donor profile setup — sex, blood group, Rh
status: implementing
created: 2026-06-03
updated: 2026-06-04
archived_at: null
---

## Notes

Roadmap item **S-01** (`context/foundation/roadmap.md`). Outcome: dawca może ustawić i edytować swój profil (płeć, grupa krwi, Rh) po zalogowaniu.

- PRD refs: FR-003 (FR-001/FR-002 already implemented per baseline — auth routes + middleware present).
- Prerequisite: F-01 (`database-schema-migrations` — tabela `profiles` z polami `user_id`, `blood_group`, `rh`, `sex`).
- Risk from roadmap: this is the first new page after auth. The `sex` field is required by the S-02 calculator — the UI must force `sex` to be set, and should block access to the donation flow until it is.
