# Pokyny pro AI asistenta: Rodová kronika

## Účel

Projekt je soukromý, offline archiv genealogického výzkumu jedné rodiny. Výsledkem je jeden HTML soubor `dist/rodova-kronika.html` s vloženými daty, styly, JavaScriptem a náhledy fotografií. Komunikuj česky, srozumitelně i pro neprogramátora; vysvětluj, co děláš a proč.

## Zdroj pravdy a adresáře

- `src/data/genealogy.json` je autoritativní datový soubor. Zachovávej stabilní ID a všechny vazby mezi osobami, vztahy, událostmi, místy, tvrzeními a prameny. Pole popisuje `docs/data-contract.md`.
- `src/data/family-edition.json` jsou volitelné texty pro rodinné vydání. `src/data/history.json` jsou obecné dějiny bez osob.
- `examples/ukazka/` je vymyšlený ukázkový rod; používají ho testy, neměň ho kvůli vlastním datům.
- `assets/source/` pracovní kopie fotografií a dokumentů, `assets/optimized/` náhledy WebP pro build, `assets/interviews/<id>/` rozhovory (přepisy, `prompt.txt`, úryvky).
- `assets/original/`, pokud existuje, je chráněný archiv originálů: nemaž, nepřepisuj, nepřejmenovávej.
- `dist/` je generovaný výstup; neupravuj ho ručně, spusť build.
- Dovednosti pro typické úkoly jsou v `.claude/skills/` (úvodní rozhovor, nový nález, zpracování rozhovoru, kontrola soukromí).

## Pravidla pro genealogická data

- Původní znění pramene (`transcriptionLines`) vždy zachovej odděleně od interpretace (`claims[].text`, `reasoning`).
- Každé důležité tvrzení má stav `verified`, `supported`, `family-record` nebo `hypothesis` a nejméně jeden existující `sourceId`.
- Údaj neoznačuj jako ověřený jen podle shody jména nebo obce; porovnej datum, dům, partnery, děti a povolání.
- Nevymýšlej jména, data, vazby ani prameny. Nečitelné místo zapiš jako nečitelné.
- Rozpory a nejistoty zachovej; opravuj novým tvrzením s odkazem na pramen, nemaž původní.
- Neznámého rodiče nezakládej jako osobu; zapiš badatelský úkol.
- Soukromé údaje žijících osob nerozšiřuj nad to, co uživatel výslovně poskytl a s čím dotčení souhlasí.
- MyHeritage, FamilySearch, cizí rodokmeny a sčítací indexy jsou pracovní stopy: uváděj konkrétní URL a poznámku, že údaj vyžaduje ověření. Postup je v `docs/genealogicky-vyzkum-postupy.md` a `docs/pruvodce-vyzkumem.md`.

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

Aplikace musí fungovat přímo z `file://`, bez serveru, účtu, CDN nebo internetu. Nepřidávej externí knihovny načítané ze sítě.

## Soukromí a sdílení

- Nikdy nenahrávej data, fotografie, přepisy ani `dist/` na veřejná místa a necommituj je do veřejného repozitáře.
- Pro sdílení s rodinou použij `node scripts/protect.mjs` (zaheslovaná kopie); heslo se předává zvlášť.
- Než uživatel něco sdílí, nabídni dovednost `kontrola-soukromi`.
