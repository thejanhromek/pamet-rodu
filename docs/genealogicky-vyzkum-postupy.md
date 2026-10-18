# Genealogický výzkum: zdroje a pracovní postup

Tento dokument shrnuje opakovatelný postup pro hledání předků. Neobsahuje rodinná data. Konkrétní nálezy, důkazy a badatelské úkoly patří do `src/data/genealogy.json` v soukromé pracovní kopii projektu.

## Od otázky k ověřitelnému záznamu

1. Začni jednou přesnou otázkou: kterou osobu, událost nebo rodičovskou vazbu potřebuješ doložit. Zapiš známé varianty jména, přibližný rok, obec a případné číslo domu.
2. Projdi veřejné rodokmeny, profily a sčítací indexy na [MyHeritage](https://www.myheritage.cz/research). Ber je jako pracovní vodítka. U každého převzatého údaje ulož konkrétní URL, podobu jména ve zdroji a míru jistoty. Stromový vztah sám o sobě není matriční důkaz.
3. V [PM Genealogie](https://pmgenealogie.cz/) hledej indexový řádek a poznamenej si archiv, lokalitu, signaturu, rok a údaj **Strana** nebo **Folio** přesně podle názvu sloupce. Číslo strany automaticky nepřeváděj na folio ani na číslo skenu. Prázdné pole rodiče znamená pouze to, že rodič v indexu není uveden.
4. Podle signatury otevři originální knihu v [MZA Acta Publica](https://www.mza.cz/actapublica/), je-li online. Ověř správnou knihu, časový rozsah, fyzickou stránku a konkrétní řádek. Když je obraz nečitelný, zaznamenej hranici čtení; nevymýšlej jména ani vazby.
5. Oddací nebo jinou neindexovanou knihu procházej v předem vymezeném časovém úseku. Poznamenej rozsah skutečně prohlédnutých skenů. Nenalezení osoby v tomto úseku není důkaz, že událost neexistuje nebo že nastala jinde.
6. Pokud je cílová kniha nedostupná online, zjisti u místně příslušného matričního úřadu nebo archivu, kdo ji aktuálně uchovává a zda lze na dálku získat kopii konkrétního zápisu. Připrav signaturu, stranu a identifikační údaje; aktuální podmínky ověř na oficiálním webu úřadu. Starší blog či katalog mohou pomoci s orientací, neprokazují současné uložení knihy.

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
