# Aplikacja — Vena (MVP)

### Główny problem

Krwiodawcy nie pamiętają, kiedy mogą oddać kolejną krew. Odstępy między donacjami zależą od typu donacji (krew pełna, osocze, płytki), płci i historii — co tworzy realne ryzyko przyjścia za wcześnie i odbycia donacji na próżno (odmowa) lub niepotrzebnego zwlekania. Aplikacja prowadzi krwiodawcę przez kalkulację najwcześniejszej możliwej daty kolejnej donacji i pozwala dodać ją do kalendarza.

### Najmniejszy zestaw funkcjonalności

- logowanie/rejestracja użytkownika (email + hasło)
- profil użytkownika: grupa krwi, Rh, płeć
- dodanie historycznej donacji (data + typ: krew pełna / osocze / płytki krwi)
- lista donacji użytkownika (CRUD: dodaj / edytuj / usuń)
- **kalkulator**: na podstawie ostatniej donacji + płci + typu wyświetla najwcześniejszą datę kolejnej możliwej donacji (per typ donacji)
- wybór typu donacji, którą użytkownik planuje oddać kolejny raz
- eksport najbliższej możliwej daty donacji do pliku `.ics` (kalendarz Google/Apple/Outlook)
- PWA: instalowalna na telefonie, działa offline (cache)

### Co NIE wchodzi w zakres MVP

- mapa / wyszukiwarka punktów krwiodawstwa
- treści edukacyjne ("jak oddawać", "co dzieje się z krwią")
- przypomnienia push / powiadomienia o nadchodzącej dacie
- statystyki donacji (litry oddanej krwi, odznaki, gamifikacja)
- integracja z e-Krew / oficjalnymi systemami RCKiK
- współdzielenie historii z lekarzem / eksport PDF zaświadczeń
- śledzenie poziomu żelaza, hemoglobiny i innych parametrów badań
- wielojęzyczność (na start tylko PL)
- logowanie społecznościowe (Google/Apple)
- panel administratora

### Kryteria sukcesu

- użytkownik może się zarejestrować, zalogować i wypełnić profil w < 2 minuty
- po dodaniu donacji aplikacja w < 1 sekundę pokazuje datę następnej możliwej donacji dla każdego typu
- kalkulator zgodny z wytycznymi RCKiK (krew pełna: M 8 tyg / K 12 tyg, osocze: 2 tyg, płytki: 4 tyg)
- użytkownik może pobrać plik `.ics` i otworzyć go w kalendarzu telefonu jednym kliknięciem
- test E2E przechodzi: *rejestracja → uzupełnienie profilu → dodanie donacji → wyświetlenie kolejnej daty → eksport do kalendarza*
- aplikacja działa offline po pierwszym załadowaniu (PWA install + service worker)
