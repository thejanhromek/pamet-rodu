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

## Výměna datasetu

1. Ověř strukturu pomocí `RKModel.validateDataset`.
2. Zachovej všechna ID a platné vazby, nebo přidej nové konzistentně do všech kolekcí.
3. Přidej české popisky jen tehdy, když nový interní kód vyžaduje přesnější prezentaci; neznámé kódy mají bezpečný fallback.
4. Spusť `node scripts/build.mjs` a kompletní testovací sadu. Výstup funguje přímo přes `file://` a nevyžaduje síť.

Alternativní dataset lze sestavit příkazem `node scripts/build.mjs --data cesta/k/dataset.json --output dist/vydani.html`; musí obsahovat všechny kořenové kolekce z kontraktu.
