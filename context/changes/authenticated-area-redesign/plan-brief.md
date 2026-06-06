# Authenticated Area Redesign — Plan Brief

> Full plan: `context/changes/authenticated-area-redesign/plan.md`

## What & Why

Po zalogowaniu donor trafia obecnie z powrotem na landing marketingowy, a wszystkie ekrany za auth (profil, donacje, edycja, confirm-email, hub /dashboard) używają starego niebiesko-fioletowego motywu `bg-cosmic` — niespójnego z nowym czerwonym redesignem landingu i stron logowania. Ta zmiana kieruje dawcę prosto do jego danych (`/donations` jako home strefy zalogowanej) i migruje całą strefę za auth na nowy motyw przez wspólny `AuthShell`, tak by profil i donacje były widoczne i edytowalne w układzie spójnym z landingiem.

## Starting Point

`signin.ts` przekierowuje na `/`; `middleware.ts` chroni `/dashboard`, `/profile`, `/donations` i odbija niekompletny profil na `/profile`. Konwencja czerwonego motywu istnieje już w `src/components/auth/` (FormField, SubmitButton, ServerError) i na `auth/signin.astro` — komponenty donacji/profilu po prostu nigdy nie zostały zmigrowane. Markup tła/glow jest zduplikowany inline w `Welcome.astro` i `signin.astro`.

## Desired End State

Logowanie ląduje na `/donations` (lub `/profile` jeśli profil niekompletny — przez istniejący gate). `/dashboard` znika jako strona i przekierowuje na `/donations`. Profil, donacje, edycja i confirm-email renderują się na czerwonym motywie z Topbarem u góry (Donacje · Profil · Wyloguj) nad kartą treści. Brak tokenów blue/purple/`bg-cosmic` w strefie zalogowanej.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Widok po logowaniu | `/donations` jako home | Donacje to „gwiazda przewodnia" roadmapy; profil dostępny z Topbara | Change |
| Tło/shell | Wspólny `AuthShell.astro` | DRY — jeden punkt na motyw, koniec duplikacji markupu tła | Plan |
| Układ stron | Topbar u góry + karta treści | Spójność z landingiem, stała nawigacja profil↔donacje | Plan |
| Trasa /dashboard | Usunąć + redirect → /donations | Brak martwych zakładek/linków przy czystej migracji | Plan |
| confirm-email | Restyl + tłumaczenie na PL | Pełna spójność językowa i wizualna | Plan |
| Konwencja kolorów | Mirror `src/components/auth/` | Cel motywu już istnieje — swap blue/purple → red | Plan |

## Scope

**In scope:** redirect logowania → `/donations`; usunięcie `dashboard.astro` + redirect; aktualizacja `PROTECTED_ROUTES` i linków Topbara; nowy `AuthShell.astro`; migracja `profile`/`donations`/`edit`/`confirm-email` (+ `Welcome` na shell); tłumaczenie confirm-email; restyl 5 komponentów React; usunięcie `bg-cosmic`; notka w roadmapie.

**Out of scope:** logika auth/CRUD/kalkulatora/RLS/API; przeprojektowanie landingu poza ekstrakcją shella; redirect signup; nowy „dashboard hub"; zmiana semantyki zielonych bannerów sukcesu.

## Architecture / Approach

Jeden `AuthShell.astro` (ciemne tło + 3 glow + dot pattern + `Topbar` + slot na treść) opakowuje wszystkie strony za auth oraz landing. Strony nadal używają `Layout.astro` na `<head>`/`<html>`; `AuthShell` zastępuje per-stronowy `bg-cosmic` div. Restyl komponentów React jest mechaniczny: mapowanie klas blue/purple na czerwone odpowiedniki według wzorca `src/components/auth/`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Routing & nav | Login → `/donations`, dashboard→redirect, Topbar nav | Gate profilu musi nadal działać po zmianie redirectu |
| 2. AuthShell + strony | Shell + migracja 4 stron (+ landing) na czerwony motyw | Ekstrakcja shella nie może zmienić wyglądu landingu |
| 3. Restyl React | Swap blue/purple→red w 5 komponentach | Pominięcie tokenu / złamanie reguły React Compiler |
| 4. Docs & cleanup | Usunięcie `bg-cosmic`, notka roadmap, weryfikacja | — |

**Prerequisites:** brak — całość w obrębie istniejącego kodu.
**Estimated effort:** ~1–2 sesje, 4 fazy; gros pracy to mechaniczny restyl.

## Open Risks & Assumptions

- Zakładamy, że wzorzec `src/components/auth/` jest docelowym wyglądem strefy zalogowanej.
- Brak suite testów (AGENTS.md) — weryfikacja to lint + build + manualny smoke test.
- `AuthShell` musi neutralnie obsłużyć różne szerokości treści (wąska karta profilu vs szerszy landing).

## Success Criteria (Summary)

- Po zalogowaniu donor widzi swoje donacje (i z Topbara profil), z możliwością edycji, na nowym czerwonym motywie.
- `/dashboard` przekierowuje, `bg-cosmic` i tokeny blue/purple zniknęły ze strefy zalogowanej.
- `npm run lint` i `npm run build` przechodzą; manualny flow register→signin→donations→edit→profile działa.
