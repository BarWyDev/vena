---
title: "Vena — Invariant Aggregate Refactor Plan"
created: 2026-06-14
type: refactor-plan
---

# Vena — plan refaktoru: agregat-strażnik dla niezmiennika "profil kompletny"

> Produkt: PLAN refaktoru. Nie modyfikuje kodu produkcyjnego. Wszystkie cytaty
> zweryfikowane plik:linia w trakcie tej sesji (2026-06-14).

---

## KROK 0 — Kontekst

Dokumenty źródłowe: `context/foundation/prd.md` (status `draft`), `context/domain/01-domain-distillation.md`
(mapa domeny, kandydaci na agregaty), `context/changes/testing-auth-shared-ui-safety-net/research.md`
(analiza warstwy ochrony tras), `supabase/migrations/*.sql` (jedyne źródło prawdy dla schematu).

Stack: Astro v6 SSR + React v19 + TS, Supabase Auth + Postgres (RLS), Cloudflare Workers. Logika
domenowa żyje w `src/lib/` (czyste funkcje + typy z `src/db/database.types.ts`, generowane ze
schematu). Warstwa API: `src/pages/api/**` (błędy → `redirect`, nigdy JSON). Warstwa danych: 2
migracje SQL.

`01-domain-distillation.md` już zmapował domenę i wstępnie wytypował kandydatów (KROK 5 tego
dokumentu). Ten dokument **niezależnie weryfikuje** tę listę przez ponowne odczytanie kodu
(KROK 1-3 poniżej), a następnie projektuje konkretny agregat-strażnik dla wybranego niezmiennika
(KROK 4-5) — czego `01` nie robił.

---

## KROK 1 — Zidentyfikowane niezmienniki biznesowe

| # | Niezmiennik | Cytat źródłowy |
|---|---|---|
| **A** | `EligibilityResult` może być wyliczony tylko wtedy, gdy profil dawcy ma ustawione `sex` | "Given a logged-in donor with a **completed profile (sex set)**" — US-01, `prd.md:51`; "Sex is the only field the calculator reads" — `prd.md:71`; "an incorrect date is a **release-blocking defect**" — `prd.md:105` |
| B | `donations.donated_at` nie może być datą w przyszłości | komentarz: "`donated_at` is the real-world donation day the donor enters/edits" — `supabase/migrations/20260603163127_init_profiles_donations.sql:43-44` |
| C | `donations.volume_ml` ∈ (0, 2000] | "a positive, bounded one (guards typos)... 2000 ml is well above any single real donation" — `supabase/migrations/20260608160614_add_donation_volume.sql:23-24` |
| D | `donations.type` ∈ {whole_blood, plasma, platelets} | enum `donation_type`, `supabase/migrations/20260603163127_init_profiles_donations.sql:21` |
| E | Wiersze `profiles`/`donations` widoczne i zapisywalne tylko przez właściciela (`user_id = auth.uid()`) | "A donor's health data... is never visible to any other account" — `prd.md:107`; RLS policies, migracja:70-107 |
| F | Dla typu T: `eligibility[T] = latestDonationDate(T) + INTERVALS_DAYS[T][sex]`, albo `null` jeśli brak donacji typu T | § Business Logic, `prd.md:117-119`; `src/lib/eligibility.ts:19-30` |

Niezmiennik **A** jest wybrany do dalszej analizy (uzasadnienie w KROK 2).

---

## KROK 2 — Klasyfikacja i wybór #1

| # | (a) Rdzeniowość | (b) Rozsmarowanie po warstwach | (c) Egzekwowanie |
|---|---|---|---|
| **A** | **Bardzo wysoka.** Bramkuje North Star (kalkulator FR-008/US-01); błędna/brakująca data jest "release-blocking defect" (`prd.md:105`). | **Bardzo wysokie** — żyje w 4 warstwach / 5 plikach (DB, typy domenowe, middleware, 2× strona/route konsumująca wynik) — patrz KROK 3. | **Niespójne i częściowo redundantne.** DB świadomie nie wymusza (profil może istnieć bez `sex`). Egzekwowanie realnie istnieje tylko w `middleware.ts` (dla 2 tras stronowych) + niezależna kopia w `export.ts` (bo `/api/*` nie wchodzi w `PROTECTED_ROUTES`). `donations.astro` ma trzecią, redundantną kopię, która przy awarii **cicho** pomija kalkulator (`eligibility` zostaje `null`) zamiast zasygnalizować błąd. |
| B | Średnia — guardrail jakości danych pod kalkulator, ale nie sam mechanizm kalkulacji. | Niskie — 2 miejsca (`donations.ts`, `[id].ts`), identyczna logika. | Konsekwentne (oba miejsca mają tę samą regułę), ale zduplikowane i bez CHECK w DB. |
| C | Niska-średnia — guard przed literówkami, nie wpływa na kalkulator. | Wysokie (DB CHECK + 2× API + UI), ale… | **Dobrze egzekwowane** — CHECK w DB jest ostateczną linią obrony. |
| D | Niska — wybór z enuma. | Średnie. | **Dobrze egzekwowane** — Postgres enum + API allowlist. |
| E | Wysoka (prywatność), ale… | Niskie — 1 mechanizm (RLS) + filtr `user_id` w zapytaniach. | **Dobrze egzekwowane** — RLS na obu tabelach, every-policy-per-command. |

**Wybór: niezmiennik A — "`EligibilityResult` wymaga kompletnego profilu (`sex` ustawione)".**

To jedyny kandydat, który jest jednocześnie **najbardziej rdzeniowy** (oś a) i
**najsłabiej/najbardziej niespójnie egzekwowany** (oś c), przy jednoczesnym najwyższym
rozproszeniu (oś b). B jest blisko na osi (b)/(c), ale jego rdzeniowość (a) jest niższa — to
guard jakości danych, nie sam mechanizm wartości produktu. A jest dokładnie tym przypadkiem,
gdzie "wartość produktu" i "brak jednego miejsca egzekucji" się pokrywają.

**Ważna nuansa:** `profiles.sex` jest **świadomie nullable w DB** — "the profile row may exist
before the donor has filled everything in" (`supabase/migrations/20260603163127_init_profiles_donations.sql:25-27`).
To NIE jest błąd schematu do naprawienia constraintem. Niezmiennik A nie brzmi "wiersz `profiles`
musi mieć `sex`" (to byłoby fałszywe), ale **"żaden kod nie może wyprowadzić wartości `Sex` do
`calculateEligibility` z profilu, który `sex` nie ma"** — to czysto domenowy/aplikacyjny
precondition na *operacji* (kalkulacji), nie na *stanie wiersza*. Stąd agregat-strażnik, nie
constraint DB.

---

## KROK 3 — Diagnoza niezmiennika A

### 3.1 Gdzie reguła żyje dziś

| Warstwa / plik:linia | Co robi | Status |
|---|---|---|
| `supabase/migrations/20260603163127_init_profiles_donations.sql:32` | `sex public.sex` — kolumna **nullable**, bez `NOT NULL`/`CHECK` | Świadomie nieegzekwowane w DB (poprawnie — patrz KROK 2) |
| `src/db/database.types.ts:69` | `ProfileRow.sex: Database["public"]["Enums"]["sex"] | null` | Typ deklaruje `sex` jako nullable — odzwierciedla DB |
| `src/lib/eligibility.ts:15-18` | `calculateEligibility(latestDonations, sex: Sex)` — `sex` **wymagany, non-null** | Niezmiennik egzekwowany *w sygnaturze*, ale gap między `ProfileRow.sex` (krok wyżej) i tym parametrem musi zamknąć **każdy caller** osobno |
| `src/lib/profile.ts:12-14` | `isProfileComplete(profile): boolean` — zwraca `boolean`, **nie zwęża typu** `ProfileRow` do wariantu z `sex: Sex` | Pomocnik istnieje, ale nie jest "smart constructorem" — caller wciąż musi sam odczytać `profile.sex` po sprawdzeniu |
| `src/middleware.ts:3,5,19,26-31` | `PROTECTED_ROUTES = ["/profile", "/donations"]` (prefix-match); jeśli `!isProfileComplete(profile)` → `redirect("/profile")` | **Jedyne realne miejsce egzekucji** dla stron `/profile`*, `/donations`, `/donations/[id]/edit` (prefix `/donations` łapie też `/donations/[id]/edit`) |
| `src/pages/donations.astro:7,31,33-35` | `if (profile?.sex) { eligibility = calculateEligibility(getLatestPerType(donations), profile.sex); }` — w przeciwnym razie `eligibility` zostaje `null` | **Trzecia, redundantna kopia** sprawdzenia. Dziś nieosiągalna (middleware już przekierował), ale jeśli middleware kiedykolwiek nie pokryje tej trasy (prefix-match jest "known, live fragility" — `context/changes/testing-auth-shared-ui-safety-net/research.md:166`), strona **cicho** wyrenderuje się bez kalkulatora, bez błędu — klasyczny "błąd połykany" |
| `src/pages/api/donations/export.ts:4,28,30-34` | `if (!profile?.sex) { return redirect("/donations?error=Uzupełnij profil przed eksportem"); }` | **Czwarta, niezależna kopia.** Istnieje dlatego, że `/api/donations/export` **nie** wchodzi w `PROTECTED_ROUTES` (`/api/*` nigdy nie zaczyna się od `/profile`/`/donations`) — to udokumentowany, świadomy wzorzec dla *auth* (`research.md:38-39,111`), ale dla niezmiennika A skutkuje osobną implementacją tej samej reguły |
| `src/pages/profile.astro:6,16,18` | `initial = { sex: profile.sex, ... }` — odczyt **surowego** `sex: Sex | null` do formularza | Legalny przypadek — to jedyne miejsce, gdzie `null` jest poprawną, oczekiwaną wartością (formularz edycji niekompletnego profilu) |

### 3.2 Klienci niezmiennika (gdzie `Sex` faktycznie trafia do `calculateEligibility`)

Dokładnie **2 wywołania** `calculateEligibility` w całym repo: `donations.astro:34` i `export.ts:34`.
Oba muszą — niezależnie — udowodnić `profile.sex != null`, zanim to zrobią. Dziś robią to
dwiema różnymi, nie powiązanymi konstrukcjami (`if (profile?.sex) {...}` vs.
`if (!profile?.sex) { return ... }`).

### 3.3 Co się stanie, gdy strażnik zawiedzie

- **Middleware nie złapie** (np. nowa trasa stronowa poza prefixami `/profile`/`/donations`,
  albo refaktor `PROTECTED_ROUTES` z literówką): `donations.astro:33` **cicho** ustawia
  `eligibility = null` → strona renderuje się **bez** `EligibilityCards`, bez komunikatu o
  niekompletnym profilu. Donor nie wie, że coś jest nie tak — narusza `prd.md:105`
  ("incorrect/missing date is release-blocking").
- **Nowy entry point** (przyszłe API zwracające `EligibilityResult` jako JSON dla klienta
  mobilnego — otwarte pytanie #2, `prd.md:140`) — nie ma ŻADNEGO mechanizmu, który
  przypomniałby autorowi o sprawdzeniu `profile.sex` przed wywołaniem `calculateEligibility`.
  Type-checker przepuści `profile.sex!` (non-null assertion) albo `profile.sex as Sex` bez
  ostrzeżenia.

---

## KROK 4 — Projekt agregatu-strażnika: `DonorProfile`

### 4.1 Rola

`DonorProfile` staje się **jedynym** miejscem, przez które surowy `ProfileRow` (z `sex: Sex | null`)
może zostać przekształcony w dane gotowe do kalkulacji (`sex: Sex`, non-null). Żaden inny kod nie
czyta `.sex` w celu obliczeniowym bezpośrednio z `ProfileRow`.

### 4.2 API agregatu (`src/lib/profile.ts` — rozszerzenie istniejącego pliku, nie nowy plik)

```ts
export class IncompleteProfileError extends Error {
  constructor() {
    super("Profile is missing required fields for eligibility calculation");
    this.name = "IncompleteProfileError";
  }
}

export interface CompleteProfile {
  sex: Sex; // non-null — jedyna droga do tego typu jest assertComplete()
  bloodGroup: BloodGroup | null;
  rh: Rh | null;
}

export class DonorProfile {
  private constructor(private readonly row: ProfileRow | null) {}

  static load(row: ProfileRow | null): DonorProfile {
    return new DonorProfile(row);
  }

  /** Surowy odczyt do formularza edycji — `sex: null` jest tu legalną wartością. */
  get raw(): ProfileRow | null {
    return this.row;
  }

  isComplete(): boolean {
    return this.row?.sex != null;
  }

  /** Jedyna droga do `Sex` non-null. Rzuca, nie zwraca falsy/null. */
  assertComplete(): CompleteProfile {
    if (this.row?.sex == null) {
      throw new IncompleteProfileError();
    }
    return { sex: this.row.sex, bloodGroup: this.row.blood_group, rh: this.row.rh };
  }
}

// getProfile zwraca teraz DonorProfile (nigdy null — pusty profil = DonorProfile.load(null))
export async function getProfile(supabase: SupabaseClient<Database>, userId: string): Promise<DonorProfile> {
  const { data } = await supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle();
  return DonorProfile.load(data ?? null);
}
```

`isProfileComplete()` (`profile.ts:12-14`) jest usuwane — zastępuje je `DonorProfile.isComplete()`.

### 4.3 Metody domenowe i precondition

- `assertComplete(): CompleteProfile` — **precondition**: `row.sex != null`. Nielegalne
  wywołanie (profil `null` lub `sex: null`) rzuca nazwany błąd domenowy `IncompleteProfileError`
  — nie zwraca `null`/`undefined`/`false`, więc nie da się go przez przypadek zignorować
  (`catch` jest jawny w każdym miejscu, gdzie ma znaczenie biznesowe).
- `calculateEligibility(latestDonations, sex: Sex)` (`eligibility.ts:15-18`) **pozostaje bez
  zmian** — jego sygnatura już jest poprawna; to `ProfileRow → Sex` był nieszczelnym ogniwem.
  Po refaktorze jedyny sposób na otrzymanie `sex: Sex` to `donorProfile.assertComplete().sex`.

### 4.4 Atomiczność / transakcje

Niezmiennik A **nie wymaga transakcji** — to nie jest reguła o atomowym zapisie wielu wierszy,
a precondition odczytu/kalkulacji w pamięci (DonorProfile jest budowany z jednego już-wykonanego
SELECT). Żadna zmiana w warstwie DB/transakcji nie jest potrzebna. Fail-fast realizuje się przez
**wyjątek**, nie przez transakcję.

### 4.5 Cienkie route'y / strony — mapowanie błędu domenowego

```
parse wejścia (getProfile) → DonorProfile.assertComplete() → IncompleteProfileError? → redirect
                                                            → CompleteProfile.sex → calculateEligibility(...)
```

| Miejsce | Mapowanie `IncompleteProfileError` |
|---|---|
| `middleware.ts` (trasy `/donations*`) | `redirect("/profile")` — jak dziś, ale przez `assertComplete()` zamiast `isProfileComplete()` |
| `donations.astro` | **Brak `catch`** — middleware już to gwarantuje dla tej trasy; jeśli mimo to rzuci, propaguje jako 500 (fail-fast, widoczne), zamiast cicho `eligibility = null` |
| `export.ts` | `catch` → `redirect("/donations?error=Uzupełnij profil przed eksportem")` — jak dziś, ale przez tę samą metodę co middleware |
| `profile.astro` | Nie wywołuje `assertComplete()` — używa `.raw` (surowy `sex: Sex | null` do formularza edycji, gdzie `null` jest legalny) |

---

## KROK 5 — Before/after, plan faz, testy

### 5.1 Before/after per miejsce

| Plik:linia | Before | After |
|---|---|---|
| `src/lib/profile.ts:7-14` | `getProfile()` → `ProfileRow \| null`; `isProfileComplete(profile): boolean` | `getProfile()` → `DonorProfile`; `isProfileComplete` usunięte, zastąpione `DonorProfile.isComplete()`/`assertComplete()` |
| `src/middleware.ts:27-30` | `const profile = await getProfile(...); if (!isProfileComplete(profile)) return redirect("/profile");` | `const donorProfile = await getProfile(...); try { donorProfile.assertComplete(); } catch (e) { if (e instanceof IncompleteProfileError) return redirect("/profile"); throw e; }` |
| `src/pages/donations.astro:31-35` | `if (profile?.sex) { eligibility = calculateEligibility(getLatestPerType(donations), profile.sex); }` (false → `eligibility = null`, brak sygnału) | `const { sex } = donorProfile.assertComplete(); eligibility = calculateEligibility(getLatestPerType(donations), sex);` (brak `try` — middleware gwarantuje; awaria = 500, nie cisza) |
| `src/pages/api/donations/export.ts:30-34` | `if (!profile?.sex) { return redirect(...'Uzupełnij profil przed eksportem'); } ... profile.sex` | `try { const { sex } = donorProfile.assertComplete(); ... calculateEligibility(..., sex); } catch (e) { if (e instanceof IncompleteProfileError) return redirect(...'Uzupełnij profil przed eksportem'); throw e; }` |
| `src/pages/profile.astro:16-18` | `const profile = await getProfile(...); if (profile) { initial = { sex: profile.sex, ... } }` | `const donorProfile = await getProfile(...); if (donorProfile.raw) { initial = { sex: donorProfile.raw.sex, ... } }` |

### 5.2 Plan faz refaktoru (test-first — projekt ma `vitest`, patrz `src/lib/eligibility.test.ts`, `src/test/route-protection.test.ts`)

1. **[test-first]** Dodać `src/lib/profile.test.ts`: testy dla `DonorProfile.load/.isComplete/.assertComplete`
   i `IncompleteProfileError` (przypadki w 5.3) — **przed** implementacją, zgodnie z istniejącą
   dyscypliną (`eligibility.test.ts` wzoruje wszystkie przypadki kalkulatora).
2. Implementacja `DonorProfile`, `CompleteProfile`, `IncompleteProfileError` w `src/lib/profile.ts`;
   zmiana sygnatury `getProfile()` → `Promise<DonorProfile>`; usunięcie `isProfileComplete`.
3. Migracja 4 callerów (`middleware.ts`, `donations.astro`, `export.ts`, `profile.astro`) na nowe API —
   po jednym commicie per plik, żeby `tsc`/`lint` łapał każdy zerwany typ osobno.
4. **[test-first]** Zaktualizować `src/test/route-protection.test.ts` (lub dodać sąsiedni plik
   `profile-completeness.test.ts`) o przypadki z 5.3 dla middleware i `export.ts` — w tym
   przypadek "profil istnieje, ale `sex: null`" (dziś niepokryty — istniejące testy w
   `route-protection.test.ts` sprawdzają tylko `locals.user: null`, nie stan profilu).
5. `npm run lint && npm run build` — weryfikacja React Compiler / type-check (hard rule z `AGENTS.md`).

### 5.3 Przypadki testowe dla `DonorProfile` (legalne i nielegalne)

| # | Wejście | Wywołanie | Oczekiwany wynik |
|---|---|---|---|
| 1 | `{ user_id, sex: "male", blood_group: null, rh: null, created_at }` | `assertComplete()` | zwraca `{ sex: "male", bloodGroup: null, rh: null }` (legalne) |
| 2 | `{ user_id, sex: null, blood_group: "A", rh: "positive", created_at }` | `assertComplete()` | rzuca `IncompleteProfileError` (nielegalne — `sex` nieustawione mimo innych pól) |
| 3 | `null` (brak wiersza `profiles`) | `assertComplete()` | rzuca `IncompleteProfileError` (nielegalne — profil nigdy nie utworzony) |
| 4 | `{ ..., sex: "female" }` | `isComplete()` | `true` |
| 5 | `{ ..., sex: null }` / `null` | `isComplete()` | `false` |
| 6 | `null` | `.raw` | `null` (legalne — `profile.astro` renderuje pusty formularz) |
| 7 (integracja, middleware) | `locals.user` zalogowany, profil `sex: null`, żądanie `/donations` | `onRequest` | `redirect("/profile")` — jak dziś, ale via `assertComplete()` |
| 8 (integracja, export) | `locals.user` zalogowany, profil `sex: null`, żądanie `GET /api/donations/export` | `donationsExportGet` | `redirect("/donations?error=Uzupełnij profil przed eksportem")` |
| 9 (integracja, donations.astro) | profil `sex: "male"`, ≥1 donacja | render strony | `eligibility` ≠ `null`, `EligibilityCards` renderowany z `calculateEligibility` wynikiem |

### 5.4 Load-bearing names do zarejestrowania

Projekt nie prowadzi formalnego rejestru kontraktów (sprawdzono `context/foundation/*.md`,
`context/changes/*/plan.md` — termin "load-bearing" jest używany opisowo w komentarzach/planach,
nie jako wpis do rejestru). Następujące nowe nazwy powinny zostać odnotowane przy najbliższej
aktualizacji `roadmap.md`/`plan.md`, jeśli powstanie taki rejestr:

- `DonorProfile` (klasa, agregat) — `src/lib/profile.ts`
- `DonorProfile.assertComplete()` — **jedyna** legalna droga do `sex: Sex` z profilu
- `CompleteProfile` (typ) — kontrakt wejściowy dla każdego przyszłego konsumenta `calculateEligibility`
- `IncompleteProfileError` (błąd domenowy) — nazwa do mapowania na redirect w każdym nowym route'cie, który liczy eligibility

---

## Podsumowanie

Niezmiennik "`EligibilityResult` wymaga kompletnego profilu (`sex` ustawione)" jest jednocześnie
najbardziej rdzeniowy dla Veny (bramkuje North Star kalkulator, a błędna/brakująca data jest
release-blocking per `prd.md:105`) i najsłabiej skonsolidowany w kodzie — żyje w 5 plikach na 4
warstwach (DB, typy domenowe, middleware, 2 konsumenci wyniku) i jest egzekwowany trzema
niezależnymi, nie powiązanymi konstrukcjami (`isProfileComplete` w middleware, `if (profile?.sex)`
w `donations.astro`, `if (!profile?.sex)` w `export.ts`), z czego ta w `donations.astro` dziś
**cicho** pomija kalkulator przy awarii górnej warstwy, zamiast sygnalizować błąd. Kluczowa
nuansa: `profiles.sex` jest *świadomie* nullable w DB (profil może istnieć niekompletny), więc
rozwiązaniem nie jest constraint bazodanowy, lecz agregat-strażnik na granicy domeny: `DonorProfile`
z jedyną metodą `assertComplete(): CompleteProfile`, rzucającą nazwany `IncompleteProfileError`
gdy `sex` nie jest ustawione. Refaktor jest czysto przesunięciem istniejącej logiki (4 miejsca →
1 metoda + 4 wywołania tej metody), bez zmian schematu i bez potrzeby transakcji — to precondition
na kalkulacji, nie na zapisie. Plan jest test-first (zgodnie z istniejącym `vitest`), z nowymi
przypadkami testowymi pokrywającymi dotąd niepokryty stan "profil istnieje, ale `sex: null`" w
middleware i w `export.ts`.
