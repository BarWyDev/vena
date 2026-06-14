# Raport architektoniczny — Moduł 4 (10xArchitect)

> Synteza artefaktów L2–L5. Każde twierdzenie ma wskazane repo i plik:linię źródłową. Gdzie artefakt nie istnieje lub nie zawiera danej informacji — oznaczone jako **BRAK artefaktu**.

## 1. Opisane projekty

| Repo | Stack | Skala (orientacyjnie) | Artefakty |
|---|---|---|---|
| **open-mercato** (`~/dev/oss/open-mercato`) | Next.js monorepo, pakiety `@open-mercato/*`, MikroORM/Postgres, e-commerce/CRM/ERP | Duże — moduł `customers` sam ma 3177 zmian/12 mies., 21 migracji, 2483 klucze i18n w module | **L2** (`context/map/repo-map.md` + artefakty 1–3), **L3** (`context/changes/post-flow-analysis/research.md`, `context/changes/refactor-opportunities/research.md`), **L4** (`context/changes/refactor-opportunities/plan.md`) |
| **vena** (to repo) | Astro v6 SSR + React 19 + TS + Supabase Auth/Postgres (RLS) + Cloudflare Workers | Małe — MVP PWA, 2 migracje SQL, logika domenowa w `src/lib/` (4 pliki) | **L5** (`context/domain/01-domain-distillation.md`, `02-invariant-aggregate-refactor.md`, `03-anti-corruption-layer.md`) |

L2/L3/L4 powstały na **open-mercato**, L5 na **vena** — dwa różne repozytoria, brak wspólnego L2/L3/L4 dla vena (**BRAK artefaktu**) i brak L5 dla open-mercato (**BRAK artefaktu**).

## 2. Mapa projektu (L2 — open-mercato)

- **Kernel SCC**: `crud/factory.ts ↔ di/container.ts ↔ commands/index.ts ↔ auth/server.ts ↔ optimistic-lock.ts` — cykl importów obsługujący każdy `makeCrudRoute` (47 importerów), egzekwowany tylko jako `no-circular: warn` (`repo-map.md:108`).
- **Cross-module entity imports** `catalog↔sales↔customers↔auth` — bezpośrednie importy encji ORM łamią AGENTS.md ("no direct ORM relationships between modules"), reguła `core-no-cross-module-entity-imports` = `warn`; pokrywa się z najwyższymi parami co-change (`catalog↔sales`=121, `customers↔sales`=121, `auth↔customers`=100) (`repo-map.md:109`).
- **Lokalne centrum**: `customers` to moduł referencyjny dla wzorca CRUD i #1 wg aktywności (3177 zmian/12 mies.), `ui/backend` (`CrudForm`/`DataTable`/`AppShell`) jest najsilniejszym hubem UI (1737 zmian, 158 zmian samego `CrudForm.tsx`) (`repo-map.md:67,136`).
- **Nowa strefa ryzyka (Q3)**: `ui/backend ↔ ai_assistant` — cykl `AppShell.tsx`/`HeaderContext` ↔ `conversation-store.ts` w nowym, szybko rosnącym module; `customer_accounts` ma 48 importów `di/container` przy `crud_factory=0` — sygnał możliwej duplikacji wzorca (`repo-map.md:90,111`).
- **Unknowns**: `apps/docs` i `.ai/specs` to jedne z najaktywniejszych obszarów repo (928 i 816 zmian), ale poza zasięgiem `dependency-cruiser` — "koszt zmiany" w dużej mierze to dokumentacja, nie tylko kod (`repo-map.md:79,97-102`).

## 3. Analiza ficzera (L3 — open-mercato)

**Badany przepływ**: kanoniczny CRUD encji "Person" (`CustomerEntity`/`CustomerPersonProfile`) w `customers/people` — wybrany, bo moduł `customers` jest jednocześnie #1 wg aktywności i centralnym punktem stref ryzyka #1, #2 i #6 z mapy repo (`post-flow-analysis/research.md:26`).

**Feature overview**: input wchodzi z inline-edit na stronie detalu osoby (`people/[id]/page.tsx:318-349`), trafia przez dispatcher API → CRUD factory PUT → **bramę optimistic-lock** (`optimistic-lock.ts:282-364`, porównanie `updated_at`) → `commandBus.execute('customers.people.update')` → `updatePersonCommand` (`commands/people.ts:914-1065`), który w transakcji mutuje encję, re-derywuje `displayName`, synchronizuje słowniki/tagi, a po commit'cie emituje side-effecty (eventy, search index). Odpowiedź zwraca świeży `updatedAt`, by kolejna edycja nie dostała fałszywego 409 (`post-flow-analysis/research.md:150,185-187`).

**Technical debt — 2-3 najważniejsze**:

1. **Cross-module ORM entity imports** (potwierdzone ast-grepem 1:1): 7 plików `customers/api/*` importuje `User` z `auth/data/entities` (`interactions/route.ts:18`, `entity-roles-factory.ts:11`, `deals/[id]/route.ts:17`, `people/[id]/route.ts:22`, `activities/route.ts:20`, `companies/[id]/route.ts:24`, `lib/interactionReadModel.ts:8`); `sales/commands/documents.ts:64-68,662-670,722` importuje i odpytuje `CustomerEntity`/`CustomerPersonProfile`/`CustomerAddress`. Reguła depcruise = `warn`, CI jej nie uruchamia — zmiana pola na tych encjach łamie kompilację `sales`/`customers` bez ostrzeżenia kontraktowego (`post-flow-analysis/research.md:351-355`).
2. **Kernel SCC jako twarda zależność `customers`**: 7 route'ów na `crud/factory.ts` (via `makeCrudRoute`), 43 pliki na `di/container.ts`, 35 na `auth/server.ts` — `factory.ts` jest najczęściej współ-zmienianym plikiem kernela z `customers` (21/201 commitów) (`post-flow-analysis/research.md:357-359`).
3. **Test gap o wysokim ryzyku**: brak testu izolacji cross-tenant/cross-organization dla ścieżki `people` przez realny mismatch API — tylko generyczny unit test helpera `ensureTenantScope`/`ensureOrganizationScope` (`post-flow-analysis/research.md:284,376`).

## 4. Plan refaktoryzacji (L4 — open-mercato)

**Co refaktoryzowane**: trzy niezależne "pierwsze kroki" rankingu C1–C6 — **C1**: nowy DTO+loader `CustomerUserSummary`/`loadCustomerUserSummaries()` w `customers/lib/`, migracja `activities/route.ts` z bezpośredniego importu `User` na ten loader (z poprawką behawioralną: dane będą odszyfrowane via `findWithDecryption`, jak już robi `interactionReadModel.ts`). **C4**: ekstrakcja bloku ładowania custom fields (linie 679-716) z 1203-liniowego `people/[id]/route.ts` do nazwanej funkcji `loadPersonDetailCustomFields`, wzorem istniejącego `resolveTodoDetails`. **C5**: ekstrakcja `handleFormSubmit`/`handleFormDelete`/`handleHeaderSave` ze strony `people-v2/[id]/page.tsx` do hooka `usePersonGuardedMutation`, wzorem `useDealFormHandlers` (`refactor-opportunities/plan.md:5-26`).

**Czego świadomie NIE robimy**: C2 (kernel SCC), C3 (martwy kod `RESOURCE_KIND_PEOPLE`/hand-wired optimistic-lock readery) i C6 (cykl `PersonCard ↔ CompanyPeopleSection`) zostają jako backlog/test-debt; migracja pozostałych 5 plików importujących `User` z `auth` (poza `activities/route.ts`); pełny test integracyjny dla `GET /api/customers/people/[id]`; ekstrakcja `usePersonMutationContext`; jakakolwiek zmiana kontraktu publicznego (`refactor-opportunities/plan.md:39-46`).

**Fazy**:
1. **Faza 1 (C1)** — nowy loader + migracja `activities/route.ts` → weryfikacja **auto** (`customerUserSummary.test.ts`, istniejące testy `activities/__tests__/*`, build/typecheck/lint) + **manualnie** (dev: `authorName`/`authorEmail` w odpowiedzi API są plaintext) — **status: zrobione** (commit `5d631ae26`/`ae887fe4f`).
2. **Faza 2 (C4)** — ekstrakcja `loadPersonDetailCustomFields` + snapshot test → weryfikacja **auto** (4 scenariusze snapshot, build/typecheck/lint) + **manualnie** (dev: grupa "Custom attributes" renderuje się bez zmian) — **status: zrobione** (commit `95cf63c5e`).
3. **Faza 3 (C5)** — ekstrakcja hooka `usePersonGuardedMutation` + test charakteryzujący → weryfikacja **auto** (nowy test optimistic-lock, istniejący test PR #2055 zielony, build OK) + **manualnie** (save/delete/dwuzakładkowy konflikt bez zmian) — **status: zrobione funkcjonalnie**, ale `typecheck`/`lint` (3.4/3.5) zablokowane przez **istniejące wcześniej, niezwiązane** awarie (staff timesheets entity-id; crash `eslint-plugin-react` version-detection) (`refactor-opportunities/plan.md:311-318`).

## 5. Domena wg DDD (L5 — vena)

**Ubiquitous language** (`context/domain/01-domain-distillation.md:36-52`):
- **Dawca/Donor** — właściciel konta, zarządza własnym cyklem donacji.
- **Donacja/Donation** — zdarzenie: data + typ (krew pełna/osocze/płytki) + objętość (ml).
- **Kalkulator kwalifikowalności** — wylicza najwcześniejszą datę kolejnej donacji per typ z ostatniej donacji + płci dawcy; to **North Star** produktu ("the value is the calculation, not a reminder" — `prd.md:24`).
- **Minimalny odstęp** — 8/12 tyg. (krew pełna, M/K), 2 tyg. (osocze), 4 tyg. (płytki) — przetestowane, zgodne z PRD.
- **Profil uzupełniony** — profil z ustawionym `sex`; warunek wejścia do flow donacji/kalkulatora.

**Najważniejsze rozjazdy model↔kod** (`01-domain-distillation.md:103-113`): `roadmap.md` oznacza S-01/S-02/S-03/S-05 jako `proposed`/`ready`, mimo że wszystkie są zaimplementowane i zrecenzowane; cały feature FR-012 (śledzenie objętości, status `impl_reviewed`) jest **całkowicie nieobecny** w roadmapie. Niezmiennik "profil musi mieć `sex`, by działał kalkulator" — krytyczny dla North Star — **nie jest wymuszony przez schemat DB** (kolumna nullable z premedytacją), tylko przez middleware + rozproszone null-checki w 4 plikach.

**Niezmiennik #1 i agregat**: `EligibilityResult` może być wyliczony tylko wtedy, gdy `profiles.sex` jest ustawione (US-01, `prd.md:51`; "incorrect date is release-blocking defect" — `prd.md:105`). Wybrany jako #1 do refaktoru, bo jest jednocześnie najbardziej rdzeniowy i najsłabiej/niespójnie egzekwowany (4 niezależne miejsca: DB nullable, `eligibility.ts` non-null param, `donations.astro` cichy fallback do `null`, `export.ts` osobny redirect) (`02-invariant-aggregate-refactor.md:43,118-128`). Projektowany agregat-strażnik: **`DonorProfile`** (rozszerzenie `src/lib/profile.ts`) z jedyną metodą `assertComplete(): CompleteProfile`, rzucającą `IncompleteProfileError` (`02-invariant-aggregate-refactor.md:136-159`).

**Anti-Corruption Layer**: najgorszy przeciek to typ `User` z `@supabase/supabase-js`, wpisany w `src/env.d.ts:5` jako globalny kontrakt `App.Locals.user`. Przecieka przez **4 warstwy**: middleware → 5 API routes → 3 strony Astro → **UI** (`Topbar.astro:1,26` czyta `user.email` bezpośrednio z typu SDK auth-providera w komponencie prezentacyjnym) — jedyny przeciek dosięgający UI. Z kilkunastu pól `User` realnie używane są tylko `.id` (8 miejsc) i `.email` (1 miejsce). Projektowane ACL: `DonorIdentity { id: string; email: string }` + `toDonorIdentity(user: User)` w `src/lib/supabase.ts` — jedynym pliku importującym `User` po refaktorze (`03-anti-corruption-layer.md:60-65,129-178`).

## 6. Decyzje, które należą do mnie

Artefakty L3/L4 dokumentują, że AI wykonało ranking 6 kandydatów refaktoru (C1–C6) wg trzech wymiarów (kształt/historia/wykonalność) i zarekomendowało C1+C4+C5 jako "pierwsze kroki" o najmniejszym blast radius (`refactor-opportunities/research.md:30-58`). Plan implementacyjny wbudowuje jawne punkty zatrzymania — "pause here for manual confirmation from the human" po każdej fazie (`refactor-opportunities/plan.md:109,160,235`) — co wskazuje, gdzie decyzja o przejściu do kolejnej fazy została pozostawiona człowiekowi. Poza tymi punktami artefakty **nie zawierają** jawnego zapisu, które konkretne decyzje (np. wybór C1/C4/C5 nad C2/C3/C6, albo wybór niezmiennika A w `02-invariant-aggregate-refactor.md`) zostały samodzielnie zweryfikowane/odrzucone przez człowieka, w odróżnieniu od przyjętych 1:1 z propozycji AI — **BRAK artefaktu** dla tej atrybucji; wymaga uzupełnienia przez autora sesji.
