---
change_id: authenticated-area-redesign
title: Redesign authenticated area to match new landing theme + route login into donor data
status: implemented
created: 2026-06-06
updated: 2026-06-06
archived_at: null
---

## Notes

Po zalogowaniu użytkownik ma trafiać prosto do swoich danych (donacje + profil, z edycją), w nowym „krwistym" motywie zgodnym z landingiem i stronami auth — nie z powrotem na marketingowy landing.

Decyzje (ustalone z userem 2026-06-06):

- **Widok po logowaniu:** `/donations` jako strona główna strefy zalogowanej (kalkulator + dodawanie + historia z edycją). Profil dostępny z Topbara. Stronę `/dashboard` usuwamy.
- **Redirect:** `src/pages/api/auth/signin.ts` ma kierować na `/donations` zamiast `/`. Gate kompletności profilu w `src/middleware.ts` zostaje — niekompletny profil i tak odbije na `/profile`.
- **Workflow:** prowadzone przez `/10x-new → /10x-plan`.

Zakres wizualny/IA (nie funkcjonalny — PRD bez zmian, FR-003/005/006/007 już pokrywają):

- Strefa zalogowana używa dziś starego motywu `bg-cosmic` (niebiesko-fiolet, `global.css:113`); landing + auth używają nowego czerwonego motywu (tło `#0d0a0a`, glow, `Topbar`). Cel: ujednolicić.
- Wydzielić wspólny shell strefy zalogowanej (nowe tło + glow + dot pattern + Topbar nawigacyjny: Donacje · Profil · Wyloguj), reużywany przez strony za auth — eliminuje duplikację.
- Restyl: `profile.astro`, `donations.astro`, `donations/[id]/edit.astro`, `auth/confirm-email.astro`.
- Audyt komponentów React (akcenty zielone/niebieskie → czerwone/neutralne): `ProfileForm`, `DonationForm`, `DonationHistory`, `EligibilityCards`, `SelectField`, oraz formularze auth/`FormField`.
- Usunięcie `dashboard.astro`: zaktualizować `PROTECTED_ROUTES` w `src/middleware.ts` i link „Panel główny" w `src/components/Topbar.astro`.

Drobna nieścisłość dokumentacji do poprawienia: `roadmap.md:56` mówi, że middleware chroni tylko `/dashboard` — faktycznie chroni `/dashboard`, `/profile`, `/donations` (po tej zmianie: `/profile`, `/donations`).
