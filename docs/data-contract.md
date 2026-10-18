# Datový kontrakt

`src/data/genealogy.json` je autoritativní vstup aplikace. Prezentační a genealogická vrstva jsou oddělené: data nesmí obsahovat HTML a pohledy nesmí předpokládat konkrétní jméno, místo nebo rok.

## Kořen

- `meta.title`, `meta.version` (`MAJOR.MINOR.PATCH`), `meta.updatedAt` (`YYYY-MM-DD`) a `meta.defaultPersonId`.
- Volitelné `meta.feedback.email`: adresa správce kroniky. Je-li vyplněná, profily, místa a patička nabízejí „Navrhnout opravu nebo doplnit vzpomínku“; stránka zprávu jen připraví (e-mail, Gmail nebo kopie do schránky) a nic sama neodesílá.
- `people`, `relationships`, `events`, `places`, `claims`, `sources`, `media`, `researchTasks` a `changelog` jsou pole objektů se stabilním `id`.

## Důkazní řetězec

Tvrzení mají `subjectType`, `subjectId`, `text`, `reasoning`, `evidence` a `sourceIds`. `evidence` je jeden z `verified`, `supported`, `family-record` nebo `hypothesis`. Souhrny osob počítají stavy tvrzení a unikátní prameny; žádná jediná agregovaná hodnota důkazu se nepoužívá.

## Vazby

`relationships` používají `from`, `to`, `type` a volitelné `sourceIds`. Události mohou mít `personIds`, `placeId`, `fromPlaceId`, `sourceIds`, `date`, `dateText` a `evidence`. Místa mohou mít `name`, `country`, `region`, `lat`, `lon`, `houseNumbers`, `coordinatesStatus` a volitelný `coordinateSource` s odkazem a licencí. Souřadnice jsou číselné stupně zeměpisné šířky `[-90, 90]` a délky `[-180, 180]`; neplatné nebo chybějící dvojice se na mapě vynechají, ale záznam zůstává v adresáři.

Rodokmen přijímá vztahy `parent-child`, `spouse` a `sibling`. Celý rodokmen seskupuje děti podle přesné množiny jejich doložených rodičů; při odhalení dítěte zobrazí všechny jeho rodiče, kteří jsou v této množině skutečně uvedeni. Partnerství samo rodičovství nezakládá. Známí sourozenci mohou sdílet jen jednoho rodiče a neodvozují další sourozenectví tranzitivně. Izolované osoby a oddělené komponenty zůstávají dosažitelné funkcí „Rozbalit vše“.

Jistota vazby rodič–dítě v rodokmenu se bere z `relationships[].evidence`; když chybí, z nejsilnějšího tvrzení se `subjectType: "relationship"` a `subjectId` vazby; jinak se kreslí jako „jistota neuvedena“. Čísla předků ve vývodu i v tištěné knize počítá `RKModel.getAhnentafel` (osoba 1, otec 2n, matka 2n + 1, rodič neurčeného pohlaví obsadí volné místo). Prázdné karty neznámých rodičů se nezapisují do dat; vznikají jen při zobrazení, a to pouze tam, kde je známé pohlaví druhého rodiče nebo chybí oba, nejvýše do generace prarodičů rodičů.

Rozhraní rodokmenu nabízí režimy „Vývod předků“ a „Celý rodokmen“. Nové načtení začíná vždy vývodem předků; dřívější uložená volba „extended“ se ignoruje. Výřez, měřítko, pozice karet a rozbalené rodiny se pamatují pro oba režimy pouze po dobu otevřené relace. Celý diagram používá vloženou verzi ELK.js pro počáteční rozložení, potom lokální vkládání nových karet, bez workeru nebo síťových požadavků.

Výchozí kontext celého rodokmenu zahrnuje dvě generace předků a jejich známé sourozence; zbytek grafu zůstává dosažitelný rozbalováním. Layout sdružuje partnery a spolurodiče, ale rodičovské spojnice vždy používají pouze přesné `parent-child` vazby. Oddělené komponenty se skládají pod hlavní rodinou. Je-li `sex` známý, známý muž je ve dvojici vlevo a žena vpravo; neurčené hodnoty zůstávají bez domýšlení.

„Strana otce“ a „Strana matky“ používají přímé rodiče aktuálně zvolené osoby s `sex: "male"` / `sex: "female"`. Pokud je takových rodičů více, rozbalí se jejich doložené větve společně; pokud žádný není určený, volba je nedostupná. Rozbalují se jejich předci, potomci a explicitně zapsaní sourozenci, u známých nevlastních sourozenců pouze příslušná strana. Partneři a přesně zaznamenaní spolurodiče se přidají jako kontext, jejich vlastní původ se neotevírá. Druhá strana zůstane v základním rozsahu. Snapshot režimu obsahuje také `parentSide` (`paternal`, `maternal`, nebo `null` po vlastní změně rozsahu); nejde o trvale uloženou preferenci ani změnu dat.

Mapa nepoužívá názvy států ani ID konkrétních míst jako pravidla zobrazení. Pro libovolný dataset automaticky přizpůsobí výřez všech platných bodů, včetně datové hranice; MarkerCluster přibližuje shluky a rozkládá shodné souřadnice. Světový vektorový podklad i vendored knihovny jsou vložené při buildu a runtime nepoužívá síťové dlaždice.

Volitelné `meta.mapView.initialBounds` nastavuje počáteční výřez na homepage a v pohledu Místa, dokud nejsou aktivní filtry. Je to objekt s číselnými poli `south`, `north`, `west` a `east` ve stupních; přijmou se jen platné zeměpisné meze a šířka výřezu nejvýše 360°. Pokud preference chybí nebo je neplatná, obě mapy zobrazí všechny platně geolokované body. S aktivními filtry se pohled Místa přizpůsobí vyfiltrovaným bodům a ovládání „Všechna místa“ na obou místech vrátí celý dataset. Kolečko myši ovládá přiblížení mapy.

Prameny používají `title`, `type`, `origin`, `transcriptionLines`, `reliabilityNote` a volitelnou `url`. Média používají `kind`, `title`, `file`, `sourceId` a `personIds`. Nahrávky rozhovorů mají `kind: "audio-clip"`, `file` s cestou pod `assets/` (např. `interviews/<id>/clips/<x>.webm`), `interview` (ID složky rozhovoru), `start` a `end` v sekundách celého rozhovoru, `speaker` a volitelně `quote` s přepsanými slovy; vyřezává je `scripts/make-clips.mjs`; `dataUri` doplňuje až `scripts/build.mjs`, nikdy se ručně nezapisuje do zdrojových dat. Úkoly používají `title`, `priority`, `status`, `expectedPayoff`, `nextAction`, `personIds` a `sourceIds`. Historie používá `date`, `title`, `categories` a `items`.

## Dějinný kontext

`src/data/history.json` je samostatný soubor obecných dějinných událostí; neobsahuje žádné osoby ani odkazy na ID z `genealogy.json` a build ho vloží jako `window.RK_HISTORY` (jiný soubor lze zadat `--history cesta.json`). Kořen má `meta` a pole `events`. Každá událost má stabilní `id`, `date` (`YYYY`, `YYYY-MM` nebo `YYYY-MM-DD`), volitelné `endDate` ve stejném tvaru, český `title` a `summary`, `scope` (`morava`, `region`, `stat`, `svet`), `category` a nejméně jeden zdroj v `sources` (`title`, `publisher`, `url` s `https://`). Kontrolu dělá `RKHistory.validateHistory`.

Páruje se jen podle dat: událost patří k životu, pokud jeho rozpětí protíná. Rok narození se bere z `birth.date`, jinak z roku v `birth.dateText`; bez něj se k osobě nic nepřiřazuje. Věk je přesný jen při úplném datu narození bez nejistoty (slova jako „podle“, „asi“, středník) a datu události s měsícem; jinak se uvádí „asi“. Rok úmrtí je nejmenší rok v `death.date`/`death.dateText`; uvádí-li text více roků, události mezi nimi jsou „jen pokud byl(a) tehdy naživu“. Bez roku úmrtí platí totéž po 60. roce věku (případně po posledním vlastním záznamu nebo rozhovoru osoby, kde je `speaker` úryvku `audio-clip` jejím jménem) a po 100 letech se události vynechají.

## Stěhování rodu na mapě

Režim „Stěhování rodu“ (`RKMap.buildMigration`) bere předky vybrané osoby z vazeb `parent-child` (`RKModel.getAncestorDepths`) a pro každého jen `birth.placeId` a `death.placeId`, pokud místo existuje a má platné souřadnice; volný text místa ani události se nepoužívají. Generace s alespoň jedním takovým místem tvoří kroky mapy, ostatní zůstávají v seznamu pod mapou. Čára spojuje místo narození rodiče a dítěte, pokud jsou obě známá a liší se. Číslování generací odpovídá tištěné knize.

## Rodinné vydání

Výchozí build (`src/data/genealogy.json`) i tištěná kniha a audiokniha nepoužívají surová badatelská data, ale rodinné vydání z `scripts/family-edition.mjs`: vynechá badatelské úkoly, historii změn, odůvodnění tvrzení (`reasoning`), pracovní poznámky a pomocné prameny a obecně přeloží badatelské výrazy do srozumitelné češtiny. Zdrojová data se nemění.

Texty šité na konkrétní rodinu patří do volitelného souboru `src/data/family-edition.json` (když chybí, platí jen obecná pravidla). Všechna pole jsou nepovinná:

- `noteOverrides`: `{ "id-osoby": ["poznámka pro rodinu", …] }` nahradí automaticky vybrané poznámky osoby.
- `claimOverrides`: `{ "id-tvrzení": "text pro rodinu" }` nahradí text tvrzení.
- `omitClaimIds`: pole ID tvrzení, která do rodinného vydání nepatří.
- `omitSourceIdPatterns`: pole regulárních výrazů; prameny s odpovídajícím ID se vynechají.
- `noteReplacements` a `wordingReplacements`: pole dvojic `["najdi", "nahraď"]` pro doslovné opravy poznámek, resp. textů před obecnými pravidly.
- `researcherName`: `{ "instrumental": "…", "genitive": "…" }` – jak se v textech pro rodinu jmenuje badatel, kde pracovní poznámky říkají „uživatel“ (výchozí „správcem kroniky“ / „správce kroniky“).

Soubor obsahuje rodinné texty, proto se stejně jako `genealogy.json` nikdy nezveřejňuje. Volitelné `meta.sample: true` označuje vymyšlený ukázkový dataset.

## Schéma

`schema/kronika.schema.json` (JSON Schema 2020-12) popisuje hlavní soubor i doplňkové soubory (`$defs.companions`). Build ho ověřuje malým validátorem `src/schema-lite.js` (`RKSchema`; podporuje type, enum, const, required, properties, additionalProperties, items, minItems, minLength, pattern, minimum, maximum, anyOf a lokální `$ref`) a při chybě skončí s přesnou cestou k údaji, např. `people[12].sex`. Neznámá pole schéma povoluje; hlídá typy, povinná pole, tvar ID (`^[a-z0-9][a-z0-9-]*$`), data (`YYYY`, `YYYY-MM`, `YYYY-MM-DD`) a výčty stavů důkazu.

## Doplňkové soubory

Leží vedle datového souboru pod pevnými jmény; chybějící soubor nic nepřidá. `scripts/lib/load-dataset.mjs` je spojí s daty podle ID a zdrojový soubor nemění.

- `gazetteer.json`: `{ meta, places: { <placeId>: { historicalNames: [{ name, lang, from?, to? }], jurisdictions: [{ type: parish|estate|judicial-district|political-district|region, name, from?, to?, note? }], parish: { name, placeId? }, links: [{ title, url }], sources: [{ title, publisher, url }] } } }`. Build ho připojí jako `place.historical`.
- `history-local.json`: události ve tvaru `history.json` s povinným neprázdným `placeIds` a `scope` (`obec`, `panstvi`, `okres`). Přidají se k dějinnému kontextu; osobě se přiřadí, jen je-li s některým z míst spojená (narození, úmrtí, vlastní události, bydliště), na časové ose jen u míst vypsaných událostí.
- `registers.json`: `{ meta, registers: [{ id, archive, signature, parish, placeIds, kinds: [N|O|Z], from, to, index, url?, note? }] }`. Používá ho výzkumná fronta; do rodinného vydání se nevkládá.
- `media-notes.json`: `{ meta, media: { <mediaId>: { date?, dateText?, dateEvidence?, dateReasoning?, regions: [{ id, kind: face|text, personId?, label?, x, y, w, h }] } } }`. Souřadnice oblastí jsou relativní (0–1) k obrázku; oblast bez `personId` je neznámá osoba. Pole se připojí přímo k médiu.

Testovací ukázka všech čtyř je v `tests/fixtures/sample-family/`.

## Vydání a odvozená pole

`node scripts/build.mjs --edition family|research|light`. Runtime pozná vydání podle `window.RK_EDITION`. Build doplňuje pole, která se nikdy nepíšou ručně: `media.dataUri`, `media.words` (`[[sekundy od začátku úryvku, "slovo"], …]` z `assets/interviews/<id>/transcript.json`), `media.omitted: "light-edition"` u nahrávek lehkého vydání, `data.registers`, `data.dna` a `data.acceptedFindings` (jen badatelské vydání) a `data.editionChanges` (rozdíl proti poslednímu tagu `vydani-*`: `newPeople`, `newPlaces`, `newMedia`, `newlyVerified`, `strengthened`, `newSourceCount`, `sinceVersion`, `sinceDate`). `window.RK_GIVEN_NAMES` nese `src/data/given-names.json`.

## Dávka změn

```json
{ "format": "rk-changes/1", "createdAt": "…", "author": "…", "title": "…", "note": "…",
  "ops": [{ "op": "add" | "update" | "remove", "file": "genealogy", "collection": "people", "id": "…", "item": {}, "set": {} }] }
```

`file` je `genealogy` (výchozí) nebo `media-notes`, `gazetteer`, `registers`, `history-local`. `add` potřebuje `item` (s `id`), `update` potřebuje `set`: pole se nahradí, `null` pole odstraní a vnořené objekty (`birth`, `death`) se slučují o úroveň hlouběji. V `media-notes` a `gazetteer` jsou kolekce objekty podle ID. `src/changes.js` (`RKChanges`) dávku ověří a použije na kopie dat; `scripts/apply-changes.mjs` ji po náhledu, kontrole odkazů, schématu a věrohodnosti zapíše, zvýší patch verze a přidá záznam do `changelog`.

## Zprávy od příbuzných

Zpráva připravená formulářem končí řádkem `[RK-NAVRH v1 {"k":"oprava|doplneni|vzpominka|fotka","s":"person:<id>|place:<id>|media:<id>","d":"YYYY-MM-DD"}]`. `RKComponents.parseFeedbackMessage` z textu vrátí `{ kind, subject, date, text, name, topic }`; `scripts/import-suggestions.mjs` z toho udělá dávku změn s pramenem `family-record` a tvrzením se stavem `family-record` (u média o jeho prameni).

## DNA (volitelné, jen badatelské vydání)

Výsledky autozomálních DNA testů patří do volitelného souboru `research/dna.json`. Používá je jen badatelské vydání; do rodinného vydání, tištěné knihy ani veřejné šablony se nikdy nedostanou. Zpracovává je obecný modul `src/dna.js` (`RKDna`), který žádná rodinná data nezná.

```json
{
  "tests": [{ "id": "…", "personId": "…", "company": "…", "testedAt": "YYYY-MM" }],
  "matches": [{
    "id": "…", "testId": "…", "alias": "…", "sharedCm": 0,
    "segments": 0, "longestCm": 0, "sharedMatchIds": ["…"],
    "knownRelation": { "personId": "…", "commonAncestorIds": ["…"], "relationship": "2c" },
    "notes": "…"
  }]
}
```

- `tests[]`: `id`, `personId` (osoba z `genealogy.json`, která test podstoupila), `company` (testovací firma) a volitelné `testedAt`.
- `matches[]`: `id`, `testId` (odkaz do `tests`), `alias`, `sharedCm` (celkem sdílené cM, nezáporné číslo) a volitelně `segments` (počet segmentů), `longestCm` (nejdelší segment, nejvýše `sharedCm`), `sharedMatchIds` (ID jiných shod ze stejného souboru, které firma ukazuje jako společné), `knownRelation` a `notes`.
- `knownRelation` se vyplňuje jen tehdy, když je vztah doložen: `personId` (shoda je v rodokmenu), `commonAncestorIds` (společní předci z `genealogy.json`) a `relationship` (klíč z `RKDna.RANGES`, např. `1c1r`).

**`alias` je vždy pseudonym, nikdy celé jméno třetí osoby.** Shody jsou žijící lidé, kteří k zveřejnění v kronice nedali souhlas; jejich jména, uživatelská jména ani iniciály s příjmením se do souboru nepíšou. `RKDna.validateDna` varuje, když alias vypadá jako celé jméno (dvě a více slov s velkým počátečním písmenem). Totéž platí pro `notes`.

`RKDna.validateDna(dna, data)` vrací `{ errors, warnings }`: chyby jsou neexistující `testId`, `personId`, sdílené shody a společní předci, duplicitní ID a nečíselné cM; varování jsou podezřelé aliasy a neznámý klíč vztahu.

Odhad vztahu (`RKDna.relationshipCandidates(cm)`) vychází z tabulky Shared cM Project 4.0 (Blaine T. Bettinger, 2020, licence CC BY 4.0, <https://dnapainter.com/tools/sharedcmv4>); vrací všechny vztahy, jejichž rozsah zadanou hodnotu obsahuje, seřazené podle vzdálenosti od průměru. Je to pravděpodobnostní vodítko, nikdy důkaz: tvrzení podložené jen DNA má nejvýše stav `supported`, a to až po shodě s papírovým rodokmenem.

Shlukování (`RKDna.leedsClusters(matches, { minCm: 90, maxCm: 400 })`) používá Leedsovu metodu nad `sharedMatchIds` a vrací `{ clusters: [{ id, matchIds }], unassigned, overlaps }`. `RKDna.assignClustersToBranches(clusters, matches, branchOf)` přiřadí shluku větev podle `knownRelation.commonAncestorIds` jeho shod; shluky s neslučitelnými větvemi vrací zvlášť jako `conflicts`.

## GEDCOM

`RKGedcom.toGedcom(data, { living, now })` vrací `{ text, xrefOf }`: text GEDCOM 7.0 (UTF-8, CRLF, víceřádkové hodnoty přes `CONT`) a mapu ID → xref (`@I1@` osoby, `@F1@` rodiny pod ID vazeb, `@S1@` prameny, `@O1@` média). Xref se odvozují z pořadí v kolekcích. Hlavička nese `GEDC.VERS 7.0` a kvůli starším programům i `CHAR UTF-8`.

- Osoba: `NAME` z `displayName` s příjmením v lomítkách (podle `surnames`, „…, rozená X“ dá druhé jméno), další `surnames` jako `NAME` s `TYPE MAIDEN`/`AKA`, `aliases` jako `AKA`, `SEX` M/F/U, `birth`/`death` jako `BIRT`/`DEAT` (shodná událost téhož typu se do nich sloučí, jiné datum zůstane jako další záznam), události podle `type` (`BIRT`, `CHR`, `DEAT`, `BURI`, `OCCU`, `RESI`, `CENS`, `PROP` …) u první osoby v `personIds`, ostatní jako `ASSO`; `occupations` a `residences`, `notes`, `REFN` s ID kroniky.
- Rodiny: jedna `FAM` na vazbu `spouse` a na přesnou množinu rodičů dítěte; `MARR` z událostí `marriage`. Spolurodiče bez vazby `spouse` mají rozšíření `_RKCOPARENTS Y` (deklarované v `HEAD.SCHMA`), aby import nevytvořil partnerství. Sourozenci jsou `ASSO` s `ROLE OTHER` a `PHRASE sourozenec`.
- Data: `YYYY`, `YYYY-MM`, `YYYY-MM-DD` → `1920`, `NOV 1920`, `20 NOV 1920`; „asi/kolem/cca“ → `ABT`, `endDate` nebo rozsah v `dateText` → `BET … AND …`, „před/po“ → `BEF`/`AFT`. Říká-li `dateText` víc než samotné datum, zachová se v `PHRASE`.
- Místa: `PLAC` „název, region, země“ s `MAP LATI/LONG` (N/S, E/W), pokud jsou souřadnice platné.
- Prameny: `SOUR` s `TITL`, `PUBL`, `WWW`, `TEXT` z `transcriptionLines` a `NOTE` z `reliabilityNote`. Citace mají `QUAY` podle `evidence` (verified 3, supported 2, family-record 1, hypothesis 0) a `PAGE`, je-li v prameni lokátor.
- Tvrzení: `NOTE` „Tvrzení (stav): text / Odůvodnění“ s citacemi u osoby, rodiny, události nebo pramene; tvrzení o místech a větvích jako samostatné `SNOTE`.
- Média: `OBJE` s `FILE` (cesta pod `assets/` jako při buildu) a `FORM` (MIME typ).
- `living: "private"`: osoba bez úmrtí narozená méně než 100 let před `now` (bez roku narození, pokud je skrytý rodič nebo partner nebo se nedávno narodilo dítě) má jen `NAME Žijící osoba` a vazby `FAMC`/`FAMS`. Vynechají se její události, poznámky, tvrzení a média; prameny citované jen u ní se vynechají a prameny citované i u ní ztratí `TEXT`.

`RKGedcom.parseGedcom(text)` toleruje GEDCOM 5.5.1 i 7 (BOM, CRLF/CR, prázdné řádky, `CONT`/`CONC`, `@@`, skoky úrovní) a vrací `{ version, head, records, byXref, errors }`; uzly mají `level`, `tag`, `xref`, `value` nebo `pointer` a `children`. `gedcomToCandidates(tree, { fileName })` z něj udělá `{ people, relationships, events, places, sources }` ve tvaru tohoto kontraktu: ID `gedcom-<xref>`, vazby a události s `evidence: "hypothesis"`, všechny záznamy s `sourceIds` na pramen „import GEDCOM <soubor>“ a poznámkou, že údaj vyžaduje ověření. `matchCandidates(candidates, data, { nameKey, yearTolerance })` vrací `{ candidateId, personId, score, reasons }` pro shodné křestní jméno a příjmení (bez diakritiky, ženská příjmení na mužský základ) a rok narození v toleranci ±2; `nameKey(value, part)` s `part` „given“/„surname“ lze nahradit např. fonetickým klíčem. Kandidáti se do `genealogy.json` nikdy nezapisují automaticky.

## Výměna datasetu

1. Ověř strukturu pomocí `RKModel.validateDataset`.
2. Zachovej všechna ID a platné vazby, nebo přidej nové konzistentně do všech kolekcí.
3. Přidej české popisky jen tehdy, když nový interní kód vyžaduje přesnější prezentaci; neznámé kódy mají bezpečný fallback.
4. Spusť `node scripts/build.mjs` a kompletní testovací sadu. Výstup funguje přímo přes `file://` a nevyžaduje síť.

Alternativní dataset lze sestavit příkazem `node scripts/build.mjs --data cesta/k/dataset.json --output dist/vydani.html`; musí obsahovat všechny kořenové kolekce z kontraktu.
