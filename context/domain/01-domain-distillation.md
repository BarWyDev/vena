---
title: "Vena — Domain Distillation"
created: 2026-06-14
type: domain-distillation
---

# Vena — destylacja domeny

> Produkt: MAPA domeny (pojęcia, klasyfikacja subdomen, kandydaci na agregaty, rozjazdy model↔kod).
> Nie zawiera kodu produkcyjnego. Wszystkie cytaty zweryfikowane plik:linia.

## KROK 0 — Kontekst projektu

Dokumenty źródłowe (w kolejności wagi):

- `context/foundation/prd.md` — PRD v1, status `draft`, sekcje: Vision, Persona, Success Criteria, User Stories, Functional/Non-Functional Requirements, Business Logic, Access Control, Non-Goals, Open Questions.
- `vena-mvp.md` — oryginalne seed-notes PL (pre-PRD), zgodne z PRD.
- `context/foundation/roadmap.md` — roadmap v1 (`created: 2026-06-02`, `updated: 2026-06-06`), mapuje FR→slice.
- `context/foundation/tech-stack.md`, `AGENTS.md`, `CLAUDE.md` — stack i hard rules.
- `context/changes/*/change.md` — per-slice status (część jest **nowsza i bardziej aktualna** niż roadmap — patrz KROK 4).

Stack i struktura repo (z `AGENTS.md` i przeglądu `src/`):

- Astro v6 SSR + React v19 + TypeScript, Supabase Auth + Postgres (RLS), Cloudflare Workers.
- Logika domenowa skoncentrowana w `src/lib/` (`eligibility.ts`, `donations.ts`, `profile.ts`, `ics.ts`) — czyste funkcje + typy z `src/db/database.types.ts` (generowany ze schematu Supabase).
- Warstwa API: `src/pages/api/**` (Astro API routes, błędy → redirect, nigdy JSON — zgodnie z `AGENTS.md`).
- Warstwa danych: `supabase/migrations/*.sql` — 2 migracje, jedyne źródło prawdy dla schematu.
- UI: `src/components/{auth,donations,profile,pwa}` (React) + `src/pages/**.astro`.

Ograniczenie: PRD ma status `draft` i dwa Open Questions nierozstrzygnięte (push-notifications, skala wieloużytkownikowa) — traktowane jako otwarte, nie jako rozjazdy.

---

## KROK 1 — Ubiquitous Language

| Pojęcie (PL/EN) | Definicja | Cytat źródłowy | Gdzie żyje w kodzie |
|---|---|---|---|
| **Dawca / Donor** | Osoba zarządzająca własnym cyklem donacji; właściciel konta | "Primary persona: an individual blood donor managing their own donation cadence" — `context/foundation/prd.md:28` | `auth.users` (Supabase, poza repo) + `profiles.user_id` FK, `supabase/migrations/20260603163127_init_profiles_donations.sql:31` |
| **Donacja / Donation** | Zdarzenie oddania krwi: data + typ + objętość | "Donor can add a donation record (date + type: whole blood / plasma / platelets)" — FR-004, `prd.md:75` | tabela `donations`, `src/db/database.types.ts:37-63`; `DonationRow`, `src/lib/donations.ts:6` |
| **Typ donacji / Donation type** | Jedna z trzech kategorii: `whole_blood` (krew pełna), `plasma` (osocze), `platelets` (płytki krwi) | "typ: krew pełna / osocze / płytki krwi" — `vena-mvp.md:11` | enum `donation_type`, `database.types.ts:97`; `DONATION_TYPES`, `src/lib/eligibility.ts:7`; `DONATION_TYPE_LABELS`, `src/lib/donations.ts:62-66` |
| **Profil / Profile** | Atrybuty dawcy: płeć, grupa krwi, Rh | FR-003 "Donor can set and edit their profile (blood group, Rh, sex)" — `prd.md:70` | tabela `profiles`, `database.types.ts:64-87`; `ProfileRow`, `src/lib/profile.ts:5` |
| **Płeć / Sex** | `male`/`female` — jedyne pole profilu czytane przez kalkulator | "Sex is the only field the calculator reads." — `prd.md:71` | enum `sex`, `database.types.ts:99`; `Sex`, `src/lib/eligibility.ts:4`, parametr `calculateEligibility`, `eligibility.ts:17` |
| **Grupa krwi / Blood group** | A/B/AB/O — przechowywana, nieużywana przez kalkulator | "blood group/Rh are dead fields in the MVP" (Socratic, FR-003) — `prd.md:71` | enum `blood_group`, `database.types.ts:96`; `BLOOD_GROUP_LABELS`, `src/lib/profile.ts:21-26` |
| **Czynnik Rh / Rh factor** | positive/negative — przechowywany, nieużywany przez kalkulator | jak wyżej — `prd.md:71` | enum `rh`, `database.types.ts:98`; `RH_LABELS`, `src/lib/profile.ts:28-31` |
| **Kalkulator kwalifikowalności / Eligibility calculator** | Wylicza najwcześniejszą datę kolejnej donacji per typ z: ostatniej donacji tego typu + płci | FR-008 `prd.md:88`; pełny opis w § Business Logic `prd.md:117` | `calculateEligibility`, `src/lib/eligibility.ts:15-31` |
| **Minimalny odstęp / Minimum interval** | Okres oczekiwania zależny od typu i płci: krew pełna 8 tyg (M) / 12 tyg (K), osocze 2 tyg, płytki 4 tyg | "whole blood: 8 weeks for men / 12 weeks for women; plasma: 2 weeks; platelets: 4 weeks" — Guardrails, `prd.md:43`, powtórzone w § Business Logic `prd.md:117` | `INTERVALS_DAYS`, `src/lib/eligibility.ts:9-13` (56/84/14/14/28/28 dni) |
| **Najwcześniejsza data kolejnej donacji / Earliest next eligible date** | data ostatniej donacji danego typu + odstęp; `null` gdy brak donacji tego typu | "produces, per type, the earliest permissible next date" — `prd.md:117`; "no last-donation date... shows an explanatory empty state" — `prd.md:119` | `EligibilityResult`, `eligibility.ts:5`; logika `null`-handling `eligibility.ts:22-23` |
| **Wybór typu na następną donację / Selected next donation type** | Typ, który dawca planuje oddać następnym razem; steruje eksportem .ics | FR-009 "the selection drives which date goes into the .ics export" — `prd.md:90-91` | stan React + query param `?type=`, `src/components/donations/EligibilityCards.tsx:13,15,31` — **nie jest persystowany** (zob. KROK 3) |
| **Eksport kalendarza (.ics) / Calendar export** | Plik .ics z najwcześniejszą datą wybranego typu | FR-010 `prd.md:95` | `generateIcs`, `src/lib/ics.ts:9-40`; route `src/pages/api/donations/export.ts` |
| **Historia donacji / Donation history** | Lista własnych donacji dawcy, z edycją/usuwaniem | FR-005/006/007 `prd.md:77-82` | `getDonations`, `src/lib/donations.ts:8-15`; `DonationHistory.tsx` |
| **Objętość donacji / Donation volume (ml)** | ml zapisane per donacja; sumują się do litrów ogółem + rozbicia per typ | FR-012 "record the volume (ml) of each donation and see their total donated volume" — `prd.md:83-84` | `donations.volume_ml`, `database.types.ts:44`; `sumVolume`/`sumVolumeByType`/`formatLiters`, `src/lib/donations.ts:76-95` |
| **Profil uzupełniony / Complete profile** | Profil z ustawioną płcią — warunek wejścia do flow donacji/kalkulatora | US-01 "Given a logged-in donor with a completed profile (sex set)" — `prd.md:51`; roadmap S-01 risk "Pole `sex` powinno blokować dostęp do formularza dodawania donacji gdy nie jest ustawione" — `roadmap.md:86` | `isProfileComplete`, `src/lib/profile.ts:12-14`; gate w `src/middleware.ts:26-31` |

---

## KROK 2 — Klasyfikacja subdomen: Core / Supporting / Generic

| Obszar | Klasyfikacja | Uzasadnienie (odwołanie do wizji/success criteria/non-goals) |
|---|---|---|
| **Kalkulator kwalifikowalności** (`eligibility.ts`) | **Core** | "The insight: the value is the calculation, not a reminder." — `prd.md:24`. To jest North Star (`roadmap.md:24`: "S-02... udowadnia, że rdzeń produktu działa"). Stanowi przewagę nad e-Krew/RCKiK (`prd.md:24`). |
| **Donacje: rekord + historia (CRUD)** (`donations` table, `donations.ts`, `DonationHistory.tsx`, API routes) | **Core** | Surowiec dla kalkulatora — bez historii donacji kalkulator nie ma wejścia. "the list is load-bearing — edit/delete act on it" — FR-005 Socratic, `prd.md:78`. |
| **Profil dawcy: płeć** (`profiles.sex`) | **Supporting** | Niezbędny input kalkulatora (Core), ale sam nie jest wartością produktu — to atrybut konta wspierający Core. |
| **Profil dawcy: grupa krwi / Rh** | **Supporting** (na granicy Generic) | Explicite "dead fields in the MVP... seed future features" — `prd.md:71`. Przechowywane z myślą o przyszłości, nie wpływają na obecną propozycję wartości. |
| **Eksport .ics** (`ics.ts`, FR-010) | **Supporting** | "the action that makes the app stick" (`prd.md:96`) — wysoka wartość dla retencji, ale jest *konsumentem* wyniku kalkulatora, nie samą kalkulacją. Bez Core (eligibility) eksport nie ma czego eksportować. |
| **Śledzenie objętości** (FR-012, `volume_ml`, suma litrów) | **Supporting** | Explicite "passive cumulative readout, distinct from badges/streaks... the eligibility calculator (FR-008) does not consume it" — `prd.md:84`. Dodane *po* core jako oddzielna oś wartości, odseparowane od kalkulatora. |
| **Auth (email+hasło)** (`src/pages/api/auth/*`, middleware) | **Generic** | Standardowy Supabase Auth, brak logiki domenowej. Rozważany i odrzucony alternatywny model "local-only" wyłącznie z powodów technicznych (cross-device, brak utraty historii) — `prd.md:67-69`, nie z powodu wartości domenowej. |
| **PWA / offline / service worker** (`src/sw.ts`, `src/components/pwa/*`) | **Generic** | "service worker + cache + install testing is real cost the calc doesn't strictly need" — Socratic FR-011, `prd.md:101`. Infrastruktura dostawy, nie logika domenowa. |

---

## KROK 3 — Kandydaci na agregaty i ich niezmienniki

### 3.1 `Donation` (agregat, tabela `donations`)

| Niezmiennik | Cytat źródłowy | Status w kodzie |
|---|---|---|
| `donated_at` to realna, nie-przyszła data ("real-world donation day") | komentarz migracji: "`donated_at` is the real-world donation day the donor enters/edits" — `supabase/migrations/20260603163127_init_profiles_donations.sql:43-44` | **Egzekwowane tylko w API**, zduplikowane: `donatedAt > today` w `src/pages/api/donations.ts:28-31` i `src/pages/api/donations/[id].ts:32-35`. **Brak CHECK w DB.** |
| `volume_ml` ∈ (0, 2000] | "a positive, bounded one (guards typos)... 2000 ml is well above any single real donation" — `supabase/migrations/20260608160614_add_donation_volume.sql:23-24` | **Egzekwowane w DB** (`CHECK (volume_ml > 0 and volume_ml <= 2000)`, migracja:29) **+ duplikowane w API** (`donations.ts:35`, `[id].ts:39`) **+ w UI** (`NumberField min=1 max=2000`, `DonationForm.tsx:55-56`). |
| `type` ∈ {whole_blood, plasma, platelets} | enum deklarowany w migracji:21 | **Egzekwowane w DB** (Postgres enum) **+ API allowlist** (`donations.ts:22`, `[id].ts:26`). |
| Wiersz widoczny/zapisywalny tylko przez właściciela (`user_id`) | "A donor's health data... is never visible to any other account" — NFR `prd.md:107`; Access Control `prd.md:121-123` | **Egzekwowane w DB** (RLS policies, migracja:91-107, `auth.uid() = user_id`) **+ ponownie w app** (`.eq("user_id", userId)`, `donations.ts:48-49,58`). |

### 3.2 `Profile` (agregat, tabela `profiles`, 1:1 z `auth.users`)

| Niezmiennik | Cytat źródłowy | Status w kodzie |
|---|---|---|
| `sex` musi być ustawione, by dawca mógł korzystać z flow donacji/kalkulatora | US-01 "Given a logged-in donor with a completed profile (sex set)" — `prd.md:51`; roadmap S-01 risk — `roadmap.md:86` | **NIE jest ograniczeniem DB** — `sex` jest nullable, deliberately: "All donor attributes are nullable: the profile row may exist before the donor has filled everything in" — migracja:25-27, kolumna `sex public.sex` bez `not null` (migracja:32). Egzekwowane wyłącznie w middleware (`src/middleware.ts:26-31`) + `isProfileComplete` (`profile.ts:12-14`). |
| `blood_group`/`rh` opcjonalne, nieużywane przez kalkulator | `prd.md:71` | **Egzekwowane** — `calculateEligibility` przyjmuje tylko `sex` (`eligibility.ts:15-18`), żadna ścieżka kodu nie czyta `blood_group`/`rh` do obliczeń. |
| Wiersz widoczny/zapisywalny tylko przez właściciela | Access Control `prd.md:121-123` | **Egzekwowane w DB** (RLS, migracja:73-89) **+ app** (`profile.ts:8`, `.eq("user_id", userId)`). |

### 3.3 `EligibilityResult` (wartość obliczana, nie persystowana)

| Niezmiennik | Cytat źródłowy | Status w kodzie |
|---|---|---|
| Dla każdego typu: wynik = `latestDonationDate(type) + INTERVALS_DAYS[type][sex]`, albo `null` jeśli brak donacji tego typu | § Business Logic, `prd.md:117-119` | **Egzekwowane**, `eligibility.ts:19-30`, pokryte testami `eligibility.test.ts:6-43`. |
| Stałe odstępów MUSZĄ zgadzać się z regułami RCKiK — błędna data jest "release-blocking defect" (`prd.md:105`) | "whole blood: 8 weeks for men / 12 weeks for women; plasma: 2 weeks; platelets: 4 weeks" — `prd.md:43,117` | **Egzekwowane i przetestowane**: 56d(M)/84d(K) = 8/12 tyg ✓, 14/14d = 2 tyg ✓, 28/28d = 4 tyg ✓ — `eligibility.ts:9-13`, testy `eligibility.test.ts:7-29`. |

### 3.4 "Wybór typu na następną donację" — NIE jest agregatem

FR-009 (`prd.md:90-91`) wymaga, by wybór typu sterował eksportem .ics. W kodzie to czysty stan UI/URL (`EligibilityCards.tsx:13`, `window.history.replaceState(...,"/donations?type="+type)`, linia 31) — **nigdy nie trafia do `profiles` ani `donations`**. `export.ts:23-26` odczytuje `type` z query string w momencie eksportu. FR-009 jest spełnione bez persystencji — to świadoma, nie wymagająca refaktoru decyzja, ale warto odnotować: jeśli przyszły wymóg doda np. "pamiętaj mój wybór między sesjami", potrzebny będzie nowy nośnik stanu (profil lub local storage), bo dziś żaden nie istnieje.

---

## KROK 4 — Rozjazdy MODEL vs KOD

| Dokument mówi | Kod robi | Dowód |
|---|---|---|
| `roadmap.md` "At a glance" (linie 30-37): S-01 `donor-profile-setup`, S-02 `eligibility-calculator-view`, S-03 `donation-history-management` → status **`proposed`** | Wszystkie trzy są **zaimplementowane i zrecenzowane**: `change.md` raportują status `implemented`/`impl_reviewed`, kod istnieje (`profile.astro`+`ProfileForm`, `donations.astro`+`EligibilityCards`+`DonationForm`, `DonationHistory`+edit routes) | `context/changes/donor-profile-setup/change.md:5` ("implemented"); `.../eligibility-calculator-view/change.md:5` ("impl_reviewed"); `.../donation-history-management/change.md:4` ("impl_reviewed") **vs** `roadmap.md:33-35` |
| `roadmap.md` S-05 `pwa-installable-offline` → status **`ready`** (nierozpoczęte), sekcja "Done" (linie 169-173) zawiera tylko S-04 | PWA jest w dużej mierze zaimplementowane: `src/sw.ts` (41 linii), `src/components/pwa/OfflineBanner.tsx`, `UpdatePwaToast.tsx`, 5 commitów (`d7f0432`, `20eace8`, `6696de8`, `b6acdda`, `5a2b5d8`) | `roadmap.md:37,127-137,169-173` **vs** `git log --oneline -- src/sw.ts src/components/pwa/` + istniejące pliki |
| FR-012 (śledzenie objętości, `prd.md:83-84`) ma osobny `change.md` ze statusem **`impl_reviewed`** | `roadmap.md` "At a glance" (linie 30-37) **nie ma żadnego slice'u dla FR-012** — `donation-volume-tracking` jest całkowicie nieobecne w roadmapie | `prd.md:83-84`, `context/changes/donation-volume-tracking/change.md:5` **vs** `roadmap.md:30-37` (brak wiersza) |
| US-01 (`prd.md:51`) i roadmap S-01 risk (`roadmap.md:86`) traktują "profil z ustawioną płcią" jako **wymagany** warunek wstępny dla flow donacji | Schemat DB deklaruje `profiles.sex` jako **nullable, bez `NOT NULL`/`CHECK`** (migracja:25-27,32, komentarz: "All donor attributes are nullable"). Niezmiennik "sex wymagane" istnieje WYŁĄCZNIE jako redirect w middleware + powtarzane `if (profile?.sex)` w miejscach odczytu | `supabase/migrations/20260603163127_init_profiles_donations.sql:25-27,32` **vs** `src/middleware.ts:26-31`, `src/pages/donations.astro:33`, `src/pages/api/donations/export.ts:30` |
| FR-007 Socratic note (`prd.md:82`) i roadmap S-03 "Unknown" (`roadmap.md:110-112`) flagują jako **otwarte/nierozwiązane**: "usunięcie najnowszej donacji cicho przelicza wcześniejszą datę — potrzebny confirm/guard?" | **Już rozwiązane w kodzie**: `DonationHistory.tsx` implementuje dwustopniowe potwierdzenie z explicitnym ostrzeżeniem "Usunięcie tej donacji zmieni datę kwalifikowalności" gdy usuwana jest najnowsza donacja danego typu | `prd.md:82`, `roadmap.md:110-112` **vs** `src/components/donations/DonationHistory.tsx:23-24,56-58` — kod jest **przed** dokumentacją śledzącą |
| Reguła biznesowa (implicit, wynika z komentarza migracji "`donated_at` is the real-world donation day", migracja:43-44) — donacja nie może mieć daty w przyszłości | Egzekwowane **tylko w dwóch handlerach API**, identyczna logika zduplikowana, **brak odpowiadającego CHECK w DB** | `src/pages/api/donations.ts:28-31` i `src/pages/api/donations/[id].ts:32-35` **vs** `supabase/migrations/*.sql` (brak ograniczenia na `donated_at`) |

---

## KROK 5 — Ranking refaktoru

### #1: Skonsolidować niezmiennik "profil uzupełniony" (`Profile.sex` wymagane dla kalkulatora) w jeden typowany koncept

To jest niezmiennik bramkujący North Star slice (S-02) i, per `prd.md:105`, błędna/brakująca data kwalifikowalności jest "release-blocking defect". Obecnie ten niezmiennik jest rozproszony na cztery niezależne miejsca, które muszą pozostać w synchronizacji:

1. nullable kolumna w DB (`profiles.sex`, deliberately nullable — migracja:25-27,32),
2. `isProfileComplete()` — zwraca `boolean`, nie zwęża typu (`profile.ts:12-14`),
3. powtarzane `if (profile?.sex)` w `donations.astro:33` i `export.ts:30`,
4. redirect w `middleware.ts:26-31` — **jedyne** miejsce, które faktycznie gwarantuje niezmiennik dla flow `/donations`.

`calculateEligibility` deklaruje `sex: Sex` jako **wymagany, nie-nullable** parametr (`eligibility.ts:17`), podczas gdy `ProfileRow.sex` jest `Sex | null` (`database.types.ts:69`) — gap typowy domyka się tylko dzięki middleware. Każdy nowy entry point (kolejna API route, skrypt administracyjny, przyszły klient mobilny wołający API bezpośrednio), który nie przechodzi przez middleware, może wywołać kalkulator z brakującą płcią — w najlepszym wypadku redirect loop, w najgorszym błędna/brakująca data kwalifikowalności.

### #2 (runner-up): Wyciągnąć i egzekwować w DB regułę "brak przyszłej daty donacji"

Dziś zduplikowana 1:1 w `donations.ts:28-31` i `[id].ts:32-35`, bez CHECK w schemacie — łatwo o drift przy dodaniu trzeciego entry pointu (np. import/bulk-insert).

### #3: Zaktualizować `roadmap.md` do faktycznego stanu implementacji

Czysto procesowe, ale wysokiej wartości: roadmap jest jedynym źródłem prawdy "co zostało do zrobienia", a obecnie status S-01/S-02/S-03/S-05 i brak FR-012 wprowadzają w błąd co do realnego postępu (KROK 4).

---

## Podsumowanie

Domena Vena jest mała i mocno spójna z PRD: rdzeń to **kalkulator kwalifikowalności RCKiK** (`eligibility.ts`) zasilany **historią donacji** — wszystko inne (profil z grupą krwi/Rh, eksport .ics, śledzenie objętości, auth, PWA) jest supporting lub generic względem tych dwóch. Reguły interwałów (56/84/14/14/28/28 dni) są poprawnie odwzorowane z PRD i pokryte testami — kluczowy niezmiennik produktu jest bezpieczny. Najważniejszy wniosek: **dokumentacja śledząca (`roadmap.md`) jest istotnie nieaktualna względem rzeczywistego stanu kodu** — cztery z sześciu slice'ów (S-01, S-02, S-03, S-05) są już zaimplementowane wbrew statusowi "proposed"/"ready", a cały feature FR-012 (śledzenie objętości, już impl_reviewed) jest nieobecny w roadmapie. Drugi istotny wniosek: niezmiennik "profil musi mieć ustawioną płeć, by działał kalkulator" — krytyczny dla działania core domeny — nie jest wymuszony przez schemat bazy danych, tylko przez warstwę middleware i rozproszone null-checki, co jest #1 kandydatem do refaktoru.
