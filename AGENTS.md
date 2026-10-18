# Pokyny pro AI asistenta: Rodová kronika

## Účel

Projekt je soukromý, offline archiv genealogického výzkumu jedné rodiny. Výsledkem je jeden HTML soubor `dist/rodova-kronika.html` s vloženými daty, styly, JavaScriptem a náhledy fotografií. Komunikuj česky, srozumitelně i pro neprogramátora; vysvětluj, co děláš a proč.

## Zdroj pravdy a adresáře

- `src/data/genealogy.json` je autoritativní datový soubor. Zachovávej stabilní ID a všechny vazby mezi osobami, vztahy, událostmi, místy, tvrzeními a prameny. Pole popisuje `docs/data-contract.md`.
- `src/data/family-edition.json` jsou volitelné texty pro rodinné vydání. `src/data/history.json` jsou obecné dějiny bez osob.
- Doplňkové soubory vedle dat (všechny nepovinné, připojují se podle ID při buildu): `gazetteer.json` (historický místopis), `history-local.json` (dějiny obcí s `placeIds`), `registers.json` (katalog matrik pro výzkumnou frontu), `media-notes.json` (datace fotek, označené tváře a nápisy). Schéma je v `schema/kronika.schema.json`.
- `research/` je soukromá pracovní složka: `dna.json` (DNA shody – vždy jen pseudonymy, nikdy celá jména žijících lidí), `accepted-findings.json` (potvrzené výjimky kontroly věrohodnosti), `suggestions/` (došlé návrhy od příbuzných), `imports/` (kandidáti z GEDCOM). Nic z ní nepatří do rodinného vydání ani do veřejného repozitáře.
- `examples/ukazka/` je vymyšlený ukázkový rod se všemi doplňkovými soubory; používají ho testy, neměň ho kvůli vlastním datům.
- `assets/source/` pracovní kopie fotografií a dokumentů, `assets/optimized/` náhledy WebP pro build, `assets/interviews/<id>/` rozhovory (přepisy, `prompt.txt`, úryvky).
- `assets/original/`, pokud existuje, je chráněný archiv originálů: nemaž, nepřepisuj, nepřejmenovávej.
- `dist/` je generovaný výstup; neupravuj ho ručně, spusť build.
- Dovednosti pro typické úkoly jsou v `.claude/skills/` (první spuštění, úvodní rozhovor, nový nález, zpracování rozhovoru, vydání a sdílení, kontrola soukromí).
- Je-li `meta.sample === true` v `src/data/genealogy.json`, uživatel teprve začíná: nabídni dovednost `prvni-spusteni`. Pokud `git remote -v` ukazuje veřejnou šablonu jako `origin`, nejdřív ho přejmenuj (`git remote rename origin sablona`), aby se rodinná data nikdy nepushla do veřejného repozitáře.

## Pravidla pro genealogická data

- Původní znění pramene (`transcriptionLines`) vždy zachovej odděleně od interpretace (`claims[].text`, `reasoning`).
- Každé důležité tvrzení má stav `verified`, `supported`, `family-record` nebo `hypothesis` a nejméně jeden existující `sourceId`.
- Údaj neoznačuj jako ověřený jen podle shody jména nebo obce; porovnej datum, dům, partnery, děti a povolání.
- Nevymýšlej jména, data, vazby ani prameny. Nečitelné místo zapiš jako nečitelné.
- Rozpory a nejistoty zachovej; opravuj novým tvrzením s odkazem na pramen, nemaž původní.
- Neznámého rodiče nezakládej jako osobu; zapiš badatelský úkol.
- Soukromé údaje žijících osob nerozšiřuj nad to, co uživatel výslovně poskytl a s čím dotčení souhlasí.
- MyHeritage, FamilySearch, cizí rodokmeny a sčítací indexy jsou pracovní stopy: uváděj konkrétní URL a poznámku, že údaj vyžaduje ověření. Postup je v `docs/genealogicky-vyzkum-postupy.md` a `docs/pruvodce-vyzkumem.md`.

## Vydání

- `node scripts/build.mjs` – rodinné vydání (`dist/rodova-kronika.html`) pro příbuzné.
- `node scripts/build.mjs --edition research` – badatelské vydání (`dist/rodova-kronika-badatel.html`) s Badatelnou: výzkumná fronta, zdraví dat, přepis matričního zápisu, editor, DNA. Jen pro uživatele, nikdy ho nesdílej.
- `node scripts/build.mjs --edition light` – lehké vydání bez nahrávek a s menšími obrázky.
- `node scripts/release.mjs` – archivní vydání do `releases/<verze>/` a lokální tag `vydani-<verze>` (nepushuj ho bez souhlasu); od tagu se počítá „Co je nového“.
- Další výstupy: `scripts/protect.mjs` (zaheslování), `scripts/build-book.mjs` (kniha), `scripts/build-audiobook.mjs`, `scripts/questionnaire.mjs --person <id>` (tištěný dotazník pro příbuzného), `scripts/gedcom.mjs export --living private`.

## Dávky změn

Větší nebo hromadné úpravy (přepis matričního zápisu, import GEDCOM, návrhy od příbuzných, změny z editoru) zapisuj jako dávku změn ve formátu `rk-changes/1` (popis v `docs/data-contract.md`), ne přímou editací JSON:

1. Připrav dávku: uživatel ji stáhne z Badatelny, `scripts/import-suggestions.mjs` ji vytvoří z došlých e-mailů, `scripts/gedcom.mjs import` z cizího rodokmenu, nebo ji sestavíš sám.
2. `node scripts/apply-changes.mjs davka.json --dry-run` – ukaž uživateli, co se změní.
3. Po jeho souhlasu `node scripts/apply-changes.mjs davka.json` – zkontroluje odkazy, schéma a věrohodnost, zvýší patch verzi a přidá záznam do `changelog`.

Drobnou opravu jednoho údaje můžeš udělat i přímo v `genealogy.json`; pravidla níže platí stejně.

## Postup pro nový nález

1. Urči, zda jde o osobu, vztah, událost, tvrzení, pramen, médium nebo opravu.
2. Založ nebo doplň pramen s doslovným přepisem a poznámkou o spolehlivosti.
3. Zapiš interpretaci jako tvrzení s odpovídajícím stavem důkazu a odkazem na pramen.
4. Pokud nález potvrzuje nebo vyvrací hypotézu, uprav stav dotčených tvrzení a vazeb.
5. Přidej nebo uzavři související badatelský úkol a záznam v `changelog`.
6. Při významné změně zvyš `meta.version` a nastav `meta.updatedAt`.
7. Spusť build a testy (níže) a výsledek shrň uživateli.

## Ověření

Projekt nemá npm závislosti. Build a testy:

```text
node scripts/build.mjs
node --test
```

Při změnách vzhledu spusť i vizuální testy `node scripts/visual-test.mjs` (potřebují Edge nebo Chrome; `--update` přepíše vzorové snímky po vědomé změně).

Aplikace musí fungovat přímo z `file://`, bez serveru, účtu, CDN nebo internetu. Nepřidávej externí knihovny načítané ze sítě.

## Soukromí a sdílení

- Nikdy nenahrávej data, fotografie, přepisy ani `dist/` na veřejná místa a necommituj je do veřejného repozitáře.
- Pro sdílení s rodinou použij rodinné nebo lehké vydání a `node scripts/protect.mjs` (zaheslovaná kopie); heslo se předává zvlášť. Badatelské vydání a `research/` se nesdílí nikdy.
- GEDCOM pro cizí servery exportuj vždy s `--living private`.
- Než uživatel něco sdílí, nabídni dovednost `kontrola-soukromi`.
