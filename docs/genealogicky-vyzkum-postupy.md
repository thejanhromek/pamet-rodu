# Genealogický výzkum: zdroje a pracovní postup

Tento dokument shrnuje opakovatelný postup pro hledání předků. Neobsahuje rodinná data. Konkrétní nálezy, důkazy a badatelské úkoly patří do `src/data/genealogy.json` v soukromé pracovní kopii projektu.

## Od otázky k ověřitelnému záznamu

1. Začni jednou přesnou otázkou: kterou osobu, událost nebo rodičovskou vazbu potřebuješ doložit. Zapiš známé varianty jména, přibližný rok, obec a případné číslo domu.
2. Projdi veřejné rodokmeny, profily a sčítací indexy na [MyHeritage](https://www.myheritage.cz/research). Ber je jako pracovní vodítka. U každého převzatého údaje ulož konkrétní URL, podobu jména ve zdroji a míru jistoty. Stromový vztah sám o sobě není matriční důkaz.
3. V [PM Genealogie](https://pmgenealogie.cz/) hledej indexový řádek a poznamenej si archiv, lokalitu, signaturu, rok a údaj **Strana** nebo **Folio** přesně podle názvu sloupce. Číslo strany automaticky nepřeváděj na folio ani na číslo skenu. Prázdné pole rodiče znamená pouze to, že rodič v indexu není uveden.
4. Podle signatury otevři originální knihu v [MZA Acta Publica](https://www.mza.cz/actapublica/), je-li online. Ověř správnou knihu, časový rozsah, fyzickou stránku a konkrétní řádek. Když je obraz nečitelný, zaznamenej hranici čtení; nevymýšlej jména ani vazby.
5. Oddací nebo jinou neindexovanou knihu procházej v předem vymezeném časovém úseku. Poznamenej rozsah skutečně prohlédnutých skenů. Nenalezení osoby v tomto úseku není důkaz, že událost neexistuje nebo že nastala jinde.
6. Pokud je cílová kniha nedostupná online, zjisti u místně příslušného matričního úřadu nebo archivu, kdo ji aktuálně uchovává a zda lze na dálku získat kopii konkrétního zápisu. Připrav signaturu, stranu a identifikační údaje; aktuální podmínky ověř na oficiálním webu úřadu. Starší blog či katalog mohou pomoci s orientací, neprokazují současné uložení knihy.

## Čtení obrazů MZA ActaPublica

Matriky Moravského zemského archivu se v [ActaPublica](https://www.mza.cz/actapublica/) zobrazují ve vieweru OpenSeadragon nad obrazovým serverem IIPImage (Deep Zoom). Obraz je rozdělen na dlaždice v několika úrovních rozlišení.

1. Otevři detail knihy v běžném prohlížeči; konkrétní snímek má v adrese parametr `?image=<id-snímku>.jp2`. Zapiš si ID detailu, signaturu, číslo a ID snímku.
2. Když přímý HTTP požadavek z terminálu vrátí `403` nebo selže na SSL, neznamená to, že pramen chybí – viewer v prohlížeči může fungovat. Obraz nehodnoť podle názvu souboru ani adresy.
3. Rozměry obrazu a velikost dlaždice udává popisný soubor `….jp2.dzi` (pole `Size`, `TileSize`, `Format`). Dlaždice mají adresu `….jp2_files/{level}/{x}_{y}.jpg`; nejvyšší level odpovídá plnému rozlišení. V záznamu uváděj jen levely, které jsi skutečně viděl.
4. Pro čtení drobného písma použij nástroj `tools/mza-crop.js`. Obsah souboru vlož do otevřené stránky detailu (konzole DevTools nebo javascriptový nástroj prohlížeče). Definuje:
   - `mzaBase()` – základ Deep Zoom aktuálně otevřeného snímku,
   - `mzaScan(n)` – základ snímku `n` téže knihy (stačí mít otevřený kterýkoli snímek knihy),
   - `await mzaShow(base, x0, y0, x1, y1, maxWidth)` – načte jen dlaždice zvoleného výřezu (souřadnice jsou zlomky 0–1 šířky a výšky) v nejvyšším levelu, který se vejde do `maxWidth`, a zobrazí je jako překryv přes stránku, takže jde vyfotit screenshotem,
   - `mzaHide()` – překryv odstraní.
5. Osvědčený postup: nejdřív celá dvoustrana `mzaShow(mzaScan(n), 0, 0, 1, 1, 1600)` pro orientaci, potom výřez jednoho zápisu s `maxWidth` 2600–3400. Screenshot výřezu ulož k pramenům s názvem podle knihy, snímku a hledané osoby.
6. Nástroj nic neretušuje, nestahuje celé knihy a neobchází přístupová omezení; čte tytéž dlaždice jako viewer, jen cíleně. Hodí se hlavně tam, kde viewer v malém nebo skrytém okně dlaždice nenačítá.
7. Nástroj je šetrný k serveru: požadavky jdou přes omezovač (2 souběžně, nejméně 300 ms mezi nimi), dlaždice se drží v paměti, výřez má nejvýš 60 dlaždic a sezení 1500 požadavků. Odpověď 403/429/503 nebo síťová chyba nástroj zastaví – archiv tím může signalizovat blokaci, kterou nelze obcházet; počkej a pokračuj až po pauze (`mzaConfig({ resume: true })`). Stav ukáže `mzaStats()`.
8. Vybledlý inkoust: po `mzaShow` zavolej `await mzaEnhance({ scale: 2 })`. Funkce vezme tmavší barevný kanál, odečte lokální pozadí (skvrny, nerovnoměrné osvětlení), roztáhne kontrast a výřez zvětší; nic dalšího nestahuje. Zvýrazněný výřez se ukládá vedle původního a čtení z něj se v prameni označuje („čteno ze zvýrazněného výřezu“).

Pravidla čtení:

- Postupuj od indexu (sloupec **Snímek**) přes folio k vlastnímu zápisu. Index je navigace, ne přepis rodičů.
- Přepisuj, až když bezpečně čteš alespoň jméno, datum, dům a rodiče. Nečitelné části označ jako nejisté a nedoplňuj je odhadem.
- Ohraničenou negativní kontrolu (prohlédnuté snímky, rozsah let) zapiš odděleně; nenalezení v tomto rozsahu není obecná absence v knize.
- Ke každému čtení ulož ID detailu, signaturu, ID a číslo snímku, rozsah kontroly, přesnou URL, doslovný přepis a nejistoty.
- Nestahuj ani neskládej celé knihy a respektuj provozní pravidla archivu.

## Jak hodnotit a spojovat nálezy

- Odděluj původní zápis či doslovný přepis od vlastní interpretace. U tvrzení používej stavy `verified`, `supported`, `family-record` a `hypothesis` podle skutečné síly podkladu.
- Shoda jména nestačí ke ztotožnění. Porovnej souběžně datum, obec, číslo domu, manžela či manželku, děti, povolání a sousední zápisy. Podobně pojmenované osoby ponech odděleně, dokud chybí spojovací doklad.
- Rozporná data ponech vedle sebe s uvedením zdrojů. Nevynucuj jediné datum jen proto, že se vyskytuje v uživatelském stromu nebo OCR indexu.
- Index a uživatelský rodokmen mohou vytvořit přesný další úkol, ale neospravedlňují automatické přidání rodičovské vazby. U každého slepého místa zapiš, který konkrétní dokument by jej mohl rozhodnout.
- Když má zdroj fotografii nebo sken, poznamenej, zda jsi četl originální obraz, nebo pouze jeho index či strojový přepis.

## Rodinné rozhovory a automatický přepis

- Původní audio, SRT či jiný dodaný soubor archivuj beze změny; pracovní poznámky ukládej odděleně. Užitečný je kontrolní SHA-256 a časové značky výroků.
- Rozlišuj vlastní vzpomínku vypravěče od příběhu převzatého od jiné osoby. Automatický přepis může komolit jména, obce, čísla i mluvčí; nejistotu zapiš, neopravuj ji odhadem.
- Do karty člověka přidej jen vzpomínku, kterou lze bezpečně přiřadit. Pokud vyprávění odporuje známému životnímu datu nebo není jasné, o kom je řeč, ponech pasáž u zdroje a založ badatelský úkol.

## Příprava obecně použitelného projektu k publikaci

Metodiku, prompty a kód lze později zveřejnit odděleně od soukromého datového souboru a původních médií. Před publikací je nutná samostatná kontrola osobních údajů žijících lidí, oprávnění k fotografiím a dokumentům, vloženého HTML artefaktu i historie Gitu. Ukázková data je vhodné vytvořit zvlášť; pouhé skrytí jmen v uživatelském rozhraní nestačí.
