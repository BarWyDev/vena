---
project: "Vena"
version: 1
status: draft
created: 2026-06-02
updated: 2026-06-06
prd_version: 1
main_goal: market-feedback
top_blocker: time
---

# Roadmap: Vena

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

Dawcy krwi nie potrafią niezawodnie stwierdzić, kiedy mogą oddać krew następnym razem — zasady RCKiK zależą od typu donacji, płci dawcy i historii oddań. Vena rozwiązuje ten problem, obliczając najwcześniejszą dozwoloną datę per typ donacji i wyświetlając wszystkie trzy obok siebie. Oficjalne systemy (e-Krew / RCKiK) nie dają dawcom takiego widoku "na przyszłość". Podstawową wartością jest sam kalkulator, nie przypomnienie.

## North star

**S-02: Dawca dodaje donację i widzi daty kwalifikowalności per typ** — to najdrobniejszy kompletny przepływ end-to-end, który udowadnia, że rdzeń produktu działa: kalkulator RCKiK oblicza poprawne daty na podstawie płci dawcy i daty ostatniej donacji.

> Gwiazda przewodnia (north star) to najmniejszy przepływ end-to-end, którego pomyślne dostarczenie udowadnia centralną hipotezę produktu — umieszczona tak wcześnie, jak pozwalają zależności, bo wszystkie pozostałe slajsy mają wartość tylko wtedy, gdy ten flow działa.

## At a glance

| ID   | Change ID                   | Outcome (user can …)                                    | Prerequisites | PRD refs                       | Status   |
| ---- | --------------------------- | ------------------------------------------------------- | ------------- | ------------------------------ | -------- |
| F-01 | database-schema-migrations  | (foundation) schemat profiles + donations z RLS wgrany  | —             | Access Control, NFR prywatność | ready    |
| S-01 | donor-profile-setup         | uzupełnić profil (płeć, grupa krwi, Rh)                 | F-01          | FR-001, FR-002, FR-003         | proposed |
| S-02 | eligibility-calculator-view | dodać donację i zobaczyć daty kwalifikowalności per typ | F-01, S-01    | FR-004, FR-008, FR-009, US-01  | proposed |
| S-03 | donation-history-management | przeglądać listę donacji, edytować i usuwać wpisy       | S-02          | FR-005, FR-006, FR-007         | proposed |
| S-04 | calendar-ics-export         | wyeksportować wybraną datę do kalendarza (.ics)         | S-02          | FR-010                         | done     |
| S-05 | pwa-installable-offline     | zainstalować aplikację na telefonie i używać offline    | —             | FR-011                         | ready    |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme                | Chain                                      | Note                                                                                                                            |
| ------ | -------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| A      | Profil i kalkulator  | `F-01` → `S-01` → `S-02` → `S-03` / `S-04` | Główna ścieżka potwierdzenia rynkowego — sprawdzamy czy kalkulator rozwiązuje problem dawcy; S-03 i S-04 są równoległe po S-02. |
| B      | PWA i instalowalność | `S-05`                                     | Samodzielny — brak zależności danych; może biec równolegle z F-01 i S-01 ze Stream A.                                           |

## Baseline

What's already in place in the codebase as of `2026-06-02` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro 6.3.1 + React 19.2.6, Radix UI / shadcn-style primitives, Tailwind v4, routing plikowy (`src/pages/`)
- **Backend / API:** present — Astro SSR + adapter Cloudflare, API routes dla auth (signin/signup/signout w `src/pages/api/auth/`), middleware (`src/middleware.ts`)
- **Data:** partial — `@supabase/supabase-js` skonfigurowany, `supabase/config.toml` obecny; brak migracji schematu (tabele `profiles` i `donations` nie istnieją)
- **Auth:** present — Supabase auth zintegrowany (`signUp`, `signInWithPassword`), middleware chroni `/profile` i `/donations` (`/dashboard` to redirect na `/donations`); FR-001 i FR-002 już zaimplementowane
- **Deploy / infra:** present — Cloudflare Workers (`wrangler.jsonc`), GitHub Actions CI/CD (`.github/workflows/ci.yml`)
- **Observability:** absent — brak loggingu, error trackingu ani metryk; żaden NFR nie wymaga tego jako blokera release

## Foundations

### F-01: Database schema migrations

- **Outcome:** (foundation) Migracje Supabase dla tabel `profiles` (pola: `user_id`, `blood_group`, `rh`, `sex`) i `donations` (pola: `user_id`, `type`, `donated_at`) wgrane z politykami RLS ograniczającymi każdy wiersz do jego właściciela konta.
- **Change ID:** database-schema-migrations
- **PRD refs:** Access Control ("Flat single-role model — every user is a donor who sees only their own data"), NFR "A donor's health data is never visible to any other account"
- **Unlocks:** S-01 (profil wymaga tabeli `profiles`), S-02 (dodawanie donacji wymaga tabeli `donations` i `profiles.sex` dla kalkulatora)
- **Prerequisites:** —
- **Parallel with:** S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Schemat musi modelować `sex` jako pole wymagane (używane przez kalkulator) i `donation_type` jako enum; błędne typy pól oznaczają migrację w trakcie sprintu. Niskie ryzyko — logika biznesowa jest precyzyjnie zdefiniowana w PRD §Business Logic.
- **Status:** ready

## Slices

### S-01: Donor profile setup

- **Outcome:** Dawca może ustawić i edytować swój profil (płeć, grupa krwi, Rh) po zalogowaniu.
- **Change ID:** donor-profile-setup
- **PRD refs:** FR-003; FR-001 i FR-002 już zaimplementowane per baseline (auth routes + middleware obecne)
- **Prerequisites:** F-01
- **Parallel with:** S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Strona profilu jest pierwszą nową stroną po auth; jeśli interfejs nie wymusi ustawienia pola `sex` przed wejściem w flow donacji, kalkulator w S-02 nie zadziała. Pole `sex` powinno blokować dostęp do formularza dodawania donacji gdy nie jest ustawione.
- **Status:** proposed

### S-02: Eligibility calculator view ★ (gwiazda przewodnia)

- **Outcome:** Dawca może dodać rekord donacji (data + typ) i natychmiast zobaczyć najwcześniejsze daty kwalifikowalności dla każdego typu donacji.
- **Change ID:** eligibility-calculator-view
- **PRD refs:** FR-004, FR-008, FR-009, US-01
- **Prerequisites:** F-01, S-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Framework do testów E2E nie jest skonfigurowany (AGENTS.md: "No test suite is configured yet") — primary success criterion wymaga przechodzącego automatycznego testu E2E dla pełnego flow. Owner: user. Block: no (development nie jest zablokowany, ale primary success criterion nie może być potwierdzony bez testu).
- **Risk:** Poprawność logiki interwałów RCKiK jest blokadą release (NFR: "incorrect date is a release-blocking defect"). Algorytm kalkulatora musi być pokryty testami jednostkowymi przed merge. Priorytet: weryfikacja logiki obliczeniowej, nie polskość UI.
- **Status:** proposed

### S-03: Donation history management

- **Outcome:** Dawca może przeglądać listę swoich donacji oraz edytować i usuwać wpisy.
- **Change ID:** donation-history-management
- **PRD refs:** FR-005, FR-006, FR-007
- **Prerequisites:** S-02
- **Parallel with:** S-04
- **Blockers:** —
- **Unknowns:**
  - Usunięcie najnowszej donacji cicho przelicza wcześniejszą datę kwalifikowalności (Socratic note do FR-007). Czy dodać okno dialogowe potwierdzające z ostrzeżeniem o przeliczeniu? Owner: user. Block: no.
- **Risk:** Brak dialogu potwierdzającego przed usunięciem może zaskoczyć dawcę nieoczekiwaną zmianą wyświetlanej daty — PRD odnotowuje to jako "worth considering downstream."
- **Status:** proposed

### S-04: Calendar ICS export

- **Outcome:** Dawca może wyeksportować najwcześniejszą datę wybranego typu donacji jako plik .ics do kalendarza.
- **Change ID:** calendar-ics-export
- **PRD refs:** FR-010
- **Prerequisites:** S-02
- **Parallel with:** S-03
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Format .ics musi importować bez ręcznego edytowania w Google, Apple i Outlook (NFR). Edge-case'y interoperabilności (strefa czasowa, format DTSTART) mogą pojawić się późno — przetestować na realnych klientach kalendarza przed release.
- **Status:** done

### S-05: PWA installable + offline

- **Outcome:** Dawca może zainstalować aplikację na ekranie głównym telefonu i używać jej offline po pierwszym załadowaniu.
- **Change ID:** pwa-installable-offline
- **PRD refs:** FR-011
- **Prerequisites:** —
- **Parallel with:** F-01, S-01
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Strategia cachowania service workera musi obsługiwać zarówno statyczne zasoby, jak i trasy z dynamicznymi danymi (historia donacji, daty kalkulatora) — zbyt agresywny cache może serwować przestarzałe dane po dodaniu nowej donacji.
- **Status:** ready

## Backlog Handoff

| Roadmap ID | Change ID                   | Suggested issue title                                        | Ready for `/10x-plan` | Notes                                          |
| ---------- | --------------------------- | ------------------------------------------------------------ | --------------------- | ---------------------------------------------- |
| F-01       | database-schema-migrations  | Define & migrate Supabase schema: profiles + donations + RLS | yes                   | Uruchom `/10x-plan database-schema-migrations` |
| S-01       | donor-profile-setup         | Build donor profile page (sex, blood group, Rh)              | no                    | Czeka na F-01                                  |
| S-02       | eligibility-calculator-view | Add donation flow + eligibility calculator view              | no                    | Czeka na S-01; to gwiazda przewodnia           |
| S-03       | donation-history-management | Donation history list with edit and delete                   | no                    | Czeka na S-02; równoległy z S-04               |
| S-04       | calendar-ics-export         | Export eligible date as .ics calendar file                   | no                    | Czeka na S-02; równoległy z S-03               |
| S-05       | pwa-installable-offline     | Add PWA service worker + web manifest for offline install    | yes                   | Uruchom `/10x-plan pwa-installable-offline`    |

## Open Roadmap Questions

1. **Czy powiadomienia push są w zakresie MVP?** — PRD odnotowuje to jako niepotwierdzony non-goal (PRD OQ-1). Jeśli tak: dodaje nowy slice z scope powiadomień; jeśli nie: eksport .ics jest jedynym mechanizmem przypomnienia i item trafia do Parked. Owner: user. Block: roadmap-wide.
2. **Framework do testów E2E — Playwright czy Cypress?** — AGENTS.md potwierdza brak test suite; primary success criterion wymaga przechodzącego testu E2E dla pełnego flow register→profile→donate→calculate→export. Decyzja potrzebna przed zakończeniem S-02. Owner: user. Block: S-02 (gates primary success criterion satisfaction).
3. **Jak szeroko Vena generalizuje poza pierwszego użytkownika?** — Persona jest "individual donor / builder is first user"; z PRD OQ-2. Nieblokujące dla zakresu MVP. Owner: user. Block: no.

## Parked

- **Integracja z e-Krew / RCKiK** — Dlaczego: ręczne wprowadzanie historii unika ciężkiej, niepewnej integracji zewnętrznej dla v1; PRD §Non-Goals.
- **Statystyki donacji i grywalizacja** (litry, odznaki, serie) — Dlaczego: utrzymuje fokus na kalkulatorze kwalifikowalności; PRD §Non-Goals.
- **Śledzenie parametrów zdrowotnych** (żelazo, hemoglobina) — Dlaczego: poza zakresem narzędzia do daty kwalifikowalności; PRD §Non-Goals.
- **Wyszukiwarka / mapa punktów donacji** — Dlaczego: Vena odpowiada "kiedy", nie "gdzie"; PRD §Non-Goals.
- **Treści edukacyjne** ("jak oddawać krew") — Dlaczego: PRD §Non-Goals.
- **Udostępnianie lekarzowi / eksport PDF** — Dlaczego: dane zostają na koncie dawcy; PRD §Non-Goals.
- **Logowanie przez Google/Apple** — Dlaczego: email + hasło tylko dla MVP; PRD §Non-Goals.
- **Panel admina** — Dlaczego: płaski model jednego dawcy; PRD §Non-Goals.
- **Wielojęzyczność** — Dlaczego: interfejs tylko po polsku dla MVP; PRD §Non-Goals.
- **Powiadomienia push** — Dlaczego: niepotwierdzony non-goal (OQ-1); parkowany do czasu rozstrzygnięcia Open Roadmap Question #1.

## Done

(Empty on first generation. `/10x-archive` appends an entry here when a change matching a roadmap item is archived.)

- **S-04: Dawca może wyeksportować najwcześniejszą datę wybranego typu donacji jako plik .ics do kalendarza.** — Archived 2026-06-06 → `context/archive/2026-06-06-calendar-ics-export/`. Lesson: —.
