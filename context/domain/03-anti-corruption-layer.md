---
title: "Vena — Anti-Corruption Layer: Donor Identity"
created: 2026-06-14
type: refactor-plan
---

# Vena — plan refaktoru: ACL dla tożsamości dawcy (`@supabase/supabase-js` `User`)

> Produkt: PLAN refaktoru. Nie modyfikuje kodu produkcyjnego. Wszystkie cytaty
> zweryfikowane plik:linia w trakcie tej sesji (2026-06-14).

---

## KROK 0 — Kontekst

Dokumenty źródłowe: `context/foundation/prd.md` (status `draft`), `context/foundation/tech-stack.md`,
`context/domain/01-domain-distillation.md` (mapa domeny — Auth sklasyfikowane jako **Generic**,
`01:66`), `context/domain/02-invariant-aggregate-refactor.md` (poprzedni refaktor — agregat
`DonorProfile` dla niezmiennika "profil kompletny"; **nie dotyka** tożsamości użytkownika, więc
ten dokument analizuje inny przeciek).

Stack (`package.json`): `@supabase/supabase-js@^2.99.1` i `@supabase/ssr@^0.10.3` jako jedyne
zależności do auth/DB. `01-domain-distillation.md:24-28` opisuje warstwy: logika domenowa w
`src/lib/`, API w `src/pages/api/**` (błędy → redirect, nigdy JSON), UI w `src/components/**` +
`src/pages/**.astro`.

Deklaracje o wymienialności: `prd.md:67` (FR-001, Socratic) — "Counter considered: local-only
on-device data would be cheaper than auth. Resolution: kept; cross-device access and not losing
history justify server accounts" — auth-jako-koncept był już raz rewidowany. Non-Goals
`prd.md:133` — "No social login (Google/Apple) — email + password only **for the MVP**" — sugeruje,
że zakres auth providera może się rozszerzyć po MVP (co zmienia kształt obiektu `User` z Supabase:
`identities`, `app_metadata.provider`, itp.). Żaden dokument nie deklaruje wprost "warstwa auth ma
być wymienialna", ale powyższe dwa cytaty pokazują, że decyzja o providerze auth nie jest
traktowana jako trwale zamknięta — w przeciwieństwie do np. `infrastructure.md:18`, które explicite
zamyka temat platformy ("migrating to any other platform would require... for zero practical
gain").

---

## KROK 1 — Zidentyfikowane przeciekające zależności

| # | Zależność | Sygnał | Pliki, które ją "znają" |
|---|---|---|---|
| **A** | `@supabase/supabase-js` `User` (i `Session`) — typ tożsamości zalogowanego użytkownika, wpisany jako kontrakt globalny `App.Locals.user` | Typ biblioteki w **DTO/kontrakcie wire** (`App.Locals` to kontrakt middleware→każda strona/route); ten sam koncept ("kto jest zalogowany") odczytywany w warstwie middleware, API i **UI** (`Topbar.astro`); zduplikowany guard `if (!user) {...}` w 5 API routes | zob. KROK 3.1 — 11 plików produkcyjnych + 4 testowe |
| **B** | `SupabaseClient<Database>` + `PostgrestError` — typy klienta/błędu Supabase SDK w sygnaturach funkcji `src/lib/donations.ts` i `src/lib/profile.ts` | Typy biblioteki w sygnaturach tzw. warstwy domenowej (`01-domain-distillation.md:25`: "Logika domenowa skoncentrowana w `src/lib/`"); `PostgrestError \| null` zwracany z `updateDonation`/`deleteDonation`, konsumowany identycznym `if (error) {...}` w 2 miejscach | `src/lib/donations.ts:1,44,57`, `src/lib/profile.ts:1,7`; konsumenci: `src/pages/api/donations/[id].ts:43,45`, `src/pages/api/donations/[id]/delete.ts:19,21` |
| C | `date-fns` + `date-fns/locale` w `DateField.tsx` | Pojedynczy plik (`src/components/donations/DateField.tsx:2-3`) — niska skala, nie przecieka przez granice warstw | nie analizowane dalej |

---

## KROK 2 — Klasyfikacja i wybór #1

| # | (a) Warstwy/pliki dotknięte | (b) Ryzyko/koszt wymiany dziś | (c) Rozjazd deklaracja↔kod |
|---|---|---|---|
| **A** | **Bardzo wysokie** — 5 warstw: kontrakt typów (`env.d.ts`, ambient/global), middleware, API (5 plików), strony Astro (3 pliki), **UI** (`Topbar.astro` czyta `.email` bezpośrednio do renderu) + 4 pliki testowe. Razem 11 plików produkcyjnych. | **Wysokie.** `App.Locals.user` jest typowany jako **cały** interfejs `User` z `@supabase/supabase-js` (kilkanaście pól: `id`, `aud`, `email`, `phone`, `app_metadata`, `user_metadata`, `identities`, `factors`, ...), choć domena czyta tylko `id` i `email`. Każda strona/route/komponent, który odwołuje się do `Astro.locals.user`/`context.locals.user`, jest formalnie sprzężony z całym kształtem SDK Supabase Auth — w tym komponent UI. Zmiana providera auth (lub rozszerzenie o social login, `prd.md:133`) zmienia ten kształt globalnie. | Brak explicite "ma być wymienialne", ale `prd.md:67` (decyzja auth była już raz rewidowana) + `prd.md:133` ("for the MVP" — otwiera social login w v2, co zmienia `User.identities`/`app_metadata`) wskazują na niestabilny kontrakt, podczas gdy kod traktuje go jako trwały, pełny typ biblioteki. |
| B | Średnie — 2 pliki `src/lib/*` jawnie nazywają typy; pośrednio każdy wołający `createClient()` (8+ miejsc) musi przekazać `SupabaseClient` jako parametr. | Średnie — `PostgrestError` jest tylko **sprawdzany na truthy** (`if (error)`), żadne pole błędu (`.code`, `.message`) nie jest czytane poza `donations.ts`, więc realna powierzchnia kontraktu jest mała. | Brak deklaracji. `src/lib/donations.ts`/`profile.ts` są częścią "warstwy domenowej" per `01-domain-distillation.md:25`, ale przyjmują `SupabaseClient` jako parametr — to zaakceptowany w projekcie wzorzec DI dla klienta request-scoped (cookies), nie jawny rozjazd intencji. |
| C | Niskie. | Niskie. | brak. |

**Wybór: zależność A — `@supabase/supabase-js` `User` jako globalny kontrakt `App.Locals.user`.**

A jest jedynym przeciekiem, który dosięga **UI** (`Topbar.astro`) — czyli realizuje najgroźniejszy
sygnał z listy ("biblioteka [...] wciągana przez granicę, której nie powinna przekraczać"): typ
biblioteki Supabase Auth definiuje, jak wygląda "zalogowany Dawca" w komponencie prezentacyjnym, w
trzech stronach Astro, w middleware i w pięciu API routes — przy czym **realnie wykorzystywane są
tylko 2 z kilkunastu pól** tego typu. B jest węższe (2 pliki, mała powierzchnia `PostgrestError`,
brak dotyku UI) i pozostaje runner-upem.

---

## KROK 3 — Diagnoza zależności A

### 3.1 Gdzie `User`/`Locals.user` żyje dziś

| Warstwa | Plik:linia | Co robi |
|---|---|---|
| **Kontrakt typów (ambient/global)** | `src/env.d.ts:5` | `user: import("@supabase/supabase-js").User \| null;` — **jedyna deklaracja**, ale typuje globalny `App.Locals` dla całej aplikacji jako pełny typ SDK |
| **Middleware** | `src/middleware.ts:12-14` | `const { data: { user } } = await supabase.auth.getUser(); context.locals.user = user ?? null;` — zapis surowego `User` z SDK do `Locals` |
| Middleware | `src/middleware.ts:16` | `context.locals.user = null;` (gałąź braku konfiguracji Supabase) |
| Middleware | `src/middleware.ts:22,27` | `if (!context.locals.user) {...}`; `getProfile(supabase, context.locals.user.id)` — odczyt `.id` |
| **API** | `src/pages/api/donations.ts:13,41` | `const user = context.locals.user;` ... `.insert({ user_id: user.id, ... })` |
| API | `src/pages/api/profile.ts:15,40` | `const user = context.locals.user;` ... `.upsert({ user_id: user.id, ... })` |
| API | `src/pages/api/donations/export.ts:18,28` | `const user = context.locals.user;` ... `getProfile(supabase, user.id), getDonations(supabase, user.id)` |
| API | `src/pages/api/donations/[id].ts:14,43` | `const user = context.locals.user;` ... `updateDonation(supabase, user.id, ...)` |
| API | `src/pages/api/donations/[id]/delete.ts:11,19` | `const user = context.locals.user;` ... `deleteDonation(supabase, user.id, ...)` |
| **Strony Astro** | `src/pages/profile.astro:8,15,16` | `const { user } = Astro.locals;` ... `if (supabase && user) { getProfile(supabase, user.id) }` |
| Strony Astro | `src/pages/donations.astro:15,30,31` | `const { user } = Astro.locals;` ... `getProfile(supabase, user.id), getDonations(supabase, user.id)` |
| Strony Astro | `src/pages/donations/[id]/edit.astro:8,13,14` | `const { user } = Astro.locals;` ... `.eq("user_id", user.id)` |
| **UI** | `src/components/Topbar.astro:1,26` | `const { user } = Astro.locals;` ... `{user.email}` — **typ biblioteki Supabase Auth czytany bezpośrednio w komponencie prezentacyjnym**, renderowanym na każdej chronionej stronie przez `AuthShell.astro:34` |
| Testy | `src/test/auth-fixtures.ts:2,10` | `import { createClient, type Session } from "@supabase/supabase-js"` — `session: Session` w fixture |
| Testy | `src/test/middleware-harness.ts:14,56-57,67,72` | `App.Locals["user"]` jako typ `capturedUser` — pochodny od `env.d.ts:5` |
| Testy | `src/test/auth-flow.test.ts:28,32-33,59,67` | `capturedUser?.id`, `donationsContext.locals.user` |
| Testy | `src/test/route-protection.test.ts:39,41` | komentarze odnoszące się do `locals.user` jako "the oracle" |

### 3.2 Duplikacja

Pięć API routes powtarza identyczny guard ekstrakcji + null-check, zanim wezmą `.id`:

```ts
const user = context.locals.user;
if (!user) {
  return context.redirect("/auth/signin");
}
```
— `donations.ts:13-16`, `profile.ts:15-18`, `export.ts:18-21`, `[id].ts:14-17`, `[id]/delete.ts:11-14`
(linie przybliżone do wzorca — każdy plik ma własną kopię tego samego trzy-linijkowego idiomu).

Trzy strony Astro powtarzają wariant tego samego idiomu jako `if (supabase && user) { ... }`:
`profile.astro:15`, `donations.astro:30`, `donations/[id]/edit.astro:13`.

### 3.3 Przeciek przez granicę UI

`Topbar.astro:1` (`const { user } = Astro.locals`) i `Topbar.astro:26` (`{user.email}`) — to jest
realizacja sygnału "ten sam pakiet importowany w wielu warstwach (API + UI + serwis)": typ `User`
z `@supabase/supabase-js`, zdefiniowany w SDK auth-providera, determinuje, jakie pole jest
dostępne do wyświetlenia w **komponencie UI**. Gdyby provider auth się zmienił (np. `Session.user`
innego SDK nie ma pola `email` na tym samym poziomie, lub auth lokalny/JWT własny zwraca inny
kształt), `Topbar.astro` — plik UI — wymagałby zmiany, mimo że jego rola to wyłącznie "pokaż adres
e-mail zalogowanego dawcy".

### 3.4 Niewykorzystana powierzchnia

`User` z `@supabase/supabase-js` ma m.in.: `id`, `aud`, `role`, `email`, `email_confirmed_at`,
`phone`, `confirmed_at`, `last_sign_in_at`, `app_metadata`, `user_metadata`, `identities`,
`factors`, `is_anonymous`, `created_at`, `updated_at`. Cały projekt czyta z tego **dwa** pola:
`.id` (8 miejsc — KROK 3.1) i `.email` (1 miejsce — `Topbar.astro:26`). Resztę kontraktu SDK
"dziedziczy" cała aplikacja bez żadnego użycia.

---

## KROK 4 — Projekt ACL: `DonorIdentity`

### 4.1 Rola

`DonorIdentity` jest **jedynym** miejscem, przez które surowy `User` z `@supabase/supabase-js`
może wejść do reszty aplikacji. Poza adapterem `src/lib/supabase.ts` żaden plik nie importuje
`User`/`Session` z `@supabase/supabase-js` do typowania danych domenowych.

### 4.2 API agregatu (`src/lib/supabase.ts` — rozszerzenie istniejącego pliku, jedyne miejsce, które
dziś importuje `@supabase/ssr`, więc naturalny dom dla adaptera Supabase Auth/DB)

```ts
import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import type { AstroCookies } from "astro";
import { SUPABASE_URL, SUPABASE_KEY } from "astro:env/server";
import type { Database } from "@/db/database.types";

/** Jedyny kształt "zalogowanego Dawcy", jaki widzi reszta aplikacji. */
export interface DonorIdentity {
  readonly id: string;
  readonly email: string;
}

/**
 * Jedyne miejsce konwersji `User` (Supabase Auth) → `DonorIdentity`.
 * Decyzja kontraktowa: Supabase typuje `User.email` jako `string | undefined`
 * (np. auth telefonem), ale FR-001 (`prd.md:66`) wymaga rejestracji
 * email+hasło — każdy Dawca w Venie ma email. Brak `email` traktowany jako
 * "" tutaj, raz, zamiast `?? ""`/`!`-asercji w każdym z konsumentów.
 */
export function toDonorIdentity(user: User): DonorIdentity {
  return { id: user.id, email: user.email ?? "" };
}

export function createClient(requestHeaders: Headers, cookies: AstroCookies) {
  // bez zmian — `createServerClient<Database>`, KROK 0 jak dziś
}
```

### 4.3 Sygnalna biblioteka

`@supabase/supabase-js` (typ `User`) i `@supabase/ssr` (`createServerClient`,
`parseCookieHeader`) — oba pakiety, oba już dziś importowane jedynie w `src/lib/supabase.ts` dla
funkcji `createClient`; ACL dodaje do tego samego pliku odpowiedzialność za `User → DonorIdentity`.

### 4.4 Reszta kodu zna tylko port

`DonorIdentity` (typ domenowy, zdefiniowany w `src/lib/supabase.ts`, **nie** w `@supabase/*`).
`App.Locals.user: DonorIdentity | null`. Pola `.id: string` i `.email: string` — identyczne nazwy
i typy jak realnie używane dziś, więc **żaden z 11 plików-konsumentów nie zmienia logiki**, zmienia
się tylko *skąd* pochodzi typ.

---

## KROK 5 — Dowód izolacji + before/after

### 5.1 Before/after

| Plik:linia | Before | After |
|---|---|---|
| `src/env.d.ts:5` | `user: import("@supabase/supabase-js").User \| null;` | `user: import("@/lib/supabase").DonorIdentity \| null;` |
| `src/lib/supabase.ts` | tylko `createClient` | `+ export interface DonorIdentity`, `+ export function toDonorIdentity(user: User): DonorIdentity` (`User` importowany **tylko tu**) |
| `src/middleware.ts:11-14` | `const { data: { user } } = await supabase.auth.getUser(); context.locals.user = user ?? null;` | `const { data: { user } } = await supabase.auth.getUser(); context.locals.user = user ? toDonorIdentity(user) : null;` |
| `src/pages/api/donations.ts:13,41` | `const user = context.locals.user;` ... `user.id` | **bez zmian** — `user: DonorIdentity \| null`, `.id: string` identyczne |
| `src/pages/api/profile.ts:15,40` | jak wyżej | bez zmian |
| `src/pages/api/donations/export.ts:18,28` | jak wyżej | bez zmian |
| `src/pages/api/donations/[id].ts:14,43` | jak wyżej | bez zmian |
| `src/pages/api/donations/[id]/delete.ts:11,19` | jak wyżej | bez zmian |
| `src/pages/profile.astro:8,16` | `const { user } = Astro.locals;` ... `user.id` | bez zmian |
| `src/pages/donations.astro:15,31` | jak wyżej | bez zmian |
| `src/pages/donations/[id]/edit.astro:8,14` | jak wyżej | bez zmian |
| `src/components/Topbar.astro:1,26` | `const { user } = Astro.locals;` ... `{user.email}` — typ pola `email` pochodzi z `@supabase/supabase-js` | `{user.email}` — typ pola `email: string` pochodzi z `DonorIdentity` (domena Vena), **UI nie zna już `@supabase/supabase-js`** |
| `src/test/middleware-harness.ts:57,67` | `App.Locals["user"]` = `User \| null` (SDK) | `App.Locals["user"]` = `DonorIdentity \| null` (domena) — typ wyprowadzony automatycznie z `env.d.ts`, brak zmiany w pliku |
| `src/test/auth-fixtures.ts:2,10` | `import { createClient, type Session } from "@supabase/supabase-js"` | **bez zmian** — fixture woła prawdziwe Supabase Auth API do zasiania danych testowych; to nie jest kontrakt domenowy, tylko test-setup poza granicą ACL (patrz 5.3) |

### 5.2 Dowód: co dotyka wymiana providera auth

Gdyby Supabase Auth został zastąpiony innym providerem (zwracającym inny kształt "zalogowanego
użytkownika"), zmianie podlega **wyłącznie**:

1. `src/lib/supabase.ts` — funkcja `createClient` (jak dziś) + funkcja `toDonorIdentity` (nowa
   implementacja mapowania z nowego SDK na `DonorIdentity`).
2. `src/middleware.ts:11-14` — wywołanie metody `auth.getUser()`-odpowiednika nowego SDK.

**Nie dotyka**: `env.d.ts` (typ `DonorIdentity` pozostaje, bo jest domenowy), żadnego z 5 API
routes, 3 stron Astro, `Topbar.astro`, ani `middleware-harness.ts`/`auth-flow.test.ts` (typują się
przez `App.Locals`, który nie zmienia kształtu). Tabele `profiles`/`donations` i ich RLS (`user_id
= auth.uid()`) są niezależne od tego refaktoru — `user.id` jako string-identyfikator pozostaje
kontraktem z DB niezależnie od providera auth.

### 5.3 Otwarta kwestia: `auth-fixtures.ts`

`src/test/auth-fixtures.ts:2` importuje `Session`/`createClient` z `@supabase/supabase-js`, bo
testy integracyjne (`auth-flow.test.ts`) **muszą** wywołać prawdziwe Supabase Auth API, by
zasiać konto testowe — to nie jest "Dawca jako koncept domenowy", to bezpośrednie wołanie SDK po
stronie test-harnessu, analogiczne do `src/lib/supabase.ts` w produkcji. **Decyzja**: pozostaje
poza ACL — jeśli provider auth się zmieni, `auth-fixtures.ts` i `src/lib/supabase.ts` zmieniają się
razem (oba są adapterami do tego samego SDK), co jest oczekiwane i jest osobnym, dopuszczalnym
miejscem wiedzy o `@supabase/supabase-js`.

---

## KROK 6 — Weryfikacja i plan faz

### 6.1 Kryterium sukcesu (grep)

Dziś:
```
$ grep -rn '@supabase/supabase-js' src/
src/env.d.ts:5
src/test/auth-fixtures.ts:2
src/lib/donations.ts:1
src/lib/profile.ts:1
```
(`env.d.ts:5` to przeciek A; `donations.ts`/`profile.ts:1` to przeciek B, runner-up, poza
zakresem tego refaktoru; `auth-fixtures.ts:2` to dopuszczalny adapter testowy — 5.3.)

Po refaktorze A:
```
$ grep -rn '@supabase/supabase-js' src/
src/lib/supabase.ts:<N>        # import type { User } — jedyny import w produkcji
src/test/auth-fixtures.ts:2    # adapter testowy, poza zakresem (5.3)
src/lib/donations.ts:1         # przeciek B — runner-up, nieobjęty tym refaktorem
src/lib/profile.ts:1           # przeciek B — runner-up, nieobjęty tym refaktorem
```

Pliki, które **dziś znają** `User`/`Locals.user` jako typ SDK (11 produkcyjnych + 4 testowe —
KROK 3.1), **po refaktorze**: tylko `src/lib/supabase.ts` (produkcja) — pozostałe 10 plików
produkcyjnych i 3 pliki testowe (`middleware-harness.ts`, `auth-flow.test.ts`,
`route-protection.test.ts`) znają wyłącznie `DonorIdentity`/`App.Locals.user`, bez importu
`@supabase/supabase-js`.

### 6.2 Plan faz (zgodny z `02-invariant-aggregate-refactor.md:215`, test-first — projekt ma `vitest`)

1. **[test-first]** Dodać `src/lib/supabase.test.ts`: testy `toDonorIdentity` — `User` z
   `email` ustawionym → `DonorIdentity.email = email`; `User` z `email: undefined` → `""`.
2. Implementacja `DonorIdentity` + `toDonorIdentity` w `src/lib/supabase.ts` (bez zmian w
   `createClient`).
3. `src/env.d.ts:5` → `import("@/lib/supabase").DonorIdentity | null`.
4. `src/middleware.ts:11-14` → `context.locals.user = user ? toDonorIdentity(user) : null;`.
5. `npm run lint && npm run build` — `tsc` po tej zmianie powinien przejść **bez modyfikacji**
   pozostałych 10 plików produkcyjnych (5.1 — pola `.id`/`.email` identyczne); jeśli `tsc`
   zgłosi błąd w innym pliku, oznacza to nieudokumentowane użycie pola spoza `{id, email}` —
   sygnał do rozszerzenia `DonorIdentity`, nie do rozszerzenia importu SDK.
6. Uruchomić `vitest run` — `middleware-harness.ts`/`auth-flow.test.ts` powinny przejść bez
   zmian (typują się przez `App.Locals`).
7. (Opcjonalnie, osobny PR) Adresować przeciek B (`SupabaseClient<Database>`/`PostgrestError` w
   `src/lib/donations.ts`/`profile.ts`) — poza zakresem tego dokumentu.

---

## Podsumowanie

Najgorszym przeciekiem domeny Veny jest typ `User` z `@supabase/supabase-js`, wpisany w
`src/env.d.ts:5` jako kontrakt globalny `App.Locals.user` — jedyny przeciek, który dosięga
warstwy UI (`Topbar.astro:1,26` czyta `user.email` bezpośrednio z typu SDK auth-providera),
obok middleware, 5 API routes i 3 stron Astro (łącznie 11 plików produkcyjnych + 4 testowe), z
pięciokrotnie zduplikowanym idiomem `const user = context.locals.user; if (!user) {...}`. Z
kilkunastu pól `User` aplikacja czyta tylko `.id` (8 miejsc) i `.email` (1 miejsce w UI) — resztę
kontraktu SDK dziedziczy cała aplikacja bez użycia. PRD nie deklaruje wprost wymienialności
providera auth, ale FR-001 (`prd.md:67`, decyzja już raz rewidowana) i Non-Goals
(`prd.md:133`, "for the MVP" — social login w v2 zmieni kształt `User`) wskazują na niestabilny
kontrakt traktowany dziś jako trwały typ biblioteki. Projekt ACL: value object `DonorIdentity {
id: string; email: string }` + funkcja `toDonorIdentity(user: User): DonorIdentity`, obie w
`src/lib/supabase.ts` — jedynym pliku, który po refaktorze importuje `User` z
`@supabase/supabase-js` w produkcji. Ponieważ pola `DonorIdentity` mają te same nazwy i typy co
realnie używane dziś pola `User`, **wszystkie 10 pozostałych plików-konsumentów (API, strony,
UI, testy) nie wymagają zmiany logiki** — zmienia się tylko źródło typu w `env.d.ts` i jedna
linia w middleware. Runner-up (#2, poza zakresem): `SupabaseClient<Database>`/`PostgrestError` w
`src/lib/donations.ts`/`profile.ts` — węższy przeciek (2 pliki, brak dotyku UI), niezależny od
tego refaktoru.
