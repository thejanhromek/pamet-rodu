# Průvodce začátkem výzkumu

Tento průvodce provede prvními týdny práce: od toho, co víš ty sám/sama, přes rozhovory s pamětníky a rodinné papíry až po digitalizované matriky. Obecná pravidla hodnocení pramenů jsou v [genealogicky-vyzkum-postupy.md](genealogicky-vyzkum-postupy.md).

Postupuj od nejbližšího k nejvzdálenějšímu: **ty → rodiče → prarodiče → praprarodiče**. Každý krok dává jména, data a obce, bez kterých se v matrikách hledat nedá.

## 1. Co víš ty (první večer)

Zapiš si, nebo nech AI asistenta, ať se tě vyptá (dovednost `uvodni-rozhovor`):

- své rodiče, prarodiče a praprarodiče: celé jméno, rodné příjmení žen, přibližný rok narození a úmrtí, obec,
- sourozence rodičů a prarodičů (často vedou k dalším pamětníkům a fotkám),
- povolání, stěhování, války, emigraci, rodinné příběhy a legendy,
- kdo z rodiny ještě žije a mohl by vyprávět, kdo má doma papíry nebo fotky.

Do kroniky to zapiš jako `family-record` s pramenem „Vlastní znalost“. Co nevíš, zapiš jako badatelský úkol – ne jako odhad.

## 2. Rozhovory s pamětníky (nejvyšší priorita)

Pamětníci jsou jediný pramen, který zmizí. Začni nejstaršími.

**Koho:** nejstarší členy rodiny, sourozence prarodičů, sousedy a přátele rodiny, vzdálené příbuzné z jiných větví.

**Příprava:**

- Vytiskni [dotazník pro pamětníky](dotaznik-pro-pametniky.md) a vyber z něj 15–20 otázek; celý se za jedno sezení nestihne.
- Vezmi s sebou rodokmen na papíře a staré fotky – nad fotkou se vzpomíná nejlépe.
- Před nahráváním si vyžádej **souhlas** ([vzor](souhlas-s-nahravanim.md)): s nahráváním, s použitím v rodinné kronice a zvlášť se sdílením údajů o žijících osobách. Souhlas lze nahrát i na začátek nahrávky.

**Jak nahrávat:**

- Telefon v režimu letadlo, diktafon nebo kamera s mikrofonem 30–50 cm od vypravěče, tichá místnost bez televize a rádia.
- Na začátku řekni datum, místo, kdo mluví a kdo se ptá.
- Sezení nejvýš 60–90 minut, raději víc kratších schůzek.
- Ptej se otevřeně („Jak to bylo, když…“), nepřerušuj, nech ticho. Upřesňující otázky (jména, roky, čísla domů) si nech na konec.
- Při jménech se doptej na pravopis a přezdívky („Tonda je Antonín?“).
- Na závěr se zeptej: „Kdo další by o tom věděl? Máte doma nějaké papíry nebo fotky?“

**Po rozhovoru:**

1. Ulož originál nahrávky beze změny na dvě místa (počítač + záloha).
2. `node scripts/import-interview.mjs RRRR-MM-DD-jmeno nahravka.mp4` vytáhne zvuk do `assets/interviews/`.
3. Do `assets/interviews/<id>/prompt.txt` napiš jména a obce z rozhovoru a spusť přepis (`scripts/transcribe.py`, viz README).
4. Nech asistenta projít přepis dovedností `zpracuj-rozhovor`. Strojový přepis komolí jména – každý údaj před zápisem poslechni.
5. Rozlišuj vlastní vzpomínku vypravěče od toho, co slyšel od jiných.

## 3. Checklist rodinných podkladů

Projdi doma i u příbuzných (fotografuj telefonem s dobrým světlem, celou stranu včetně okrajů; originály nech u majitele):

- [ ] rodné, křestní, oddací a úmrtní listy, domovské listy, občanské průkazy, pasy
- [ ] rodinné sešity, zápisy v modlitebních knížkách a biblích, rodokmeny psané rukou
- [ ] fotografie – a hlavně popisky na jejich rubu
- [ ] dopisy, pohlednice, telegramy, parte a smuteční oznámení
- [ ] vojenské knížky, výuční listy, vysvědčení, pracovní knížky, členské průkazy
- [ ] kupní smlouvy, pozemkové doklady, stavební povolení, pojistky
- [ ] fotografie náhrobků (celý hrob i čitelný nápis zblízka)
- [ ] kroniky obcí, spolků a škol (bývají v obecní knihovně nebo okresním archivu)

Každý dokument zapiš jako pramen: co to je, kde je originál, doslovný přepis podstatných řádků a poznámku o spolehlivosti. Fotku ulož do `assets/source/` a náhled WebP do `assets/optimized/` (`scripts/optimize-media.sh`).

## 4. Pracovní stopy online: MyHeritage, FamilySearch, indexy

Online rodokmeny a indexy rychle napoví jména, data a obce. **Nejsou to ale důkazy.**

- **MyHeritage** ([myheritage.cz/research](https://www.myheritage.cz/research)) – rodokmeny jiných uživatelů, sčítací indexy, některé matriční indexy.
- **FamilySearch** ([familysearch.org](https://www.familysearch.org/)) – zdarma po registraci; indexy i snímky některých matrik, sdílený rodokmen.
- **PM Genealogie** ([pmgenealogie.cz](https://pmgenealogie.cz/)) – indexy matričních zápisů s odkazem na signaturu, stranu nebo folio.

Pravidla:

1. U každého převzatého údaje ulož **konkrétní URL**, podobu jména ve zdroji a poznámku „vyžaduje ověření“.
2. Stav důkazu nejvýš `supported` (index se signaturou) nebo `hypothesis` (cizí strom bez pramene).
3. Vztah z cizího stromu nezapisuj jako jistý. Založ úkol: který konkrétní zápis by ho potvrdil.
4. Prázdné pole v indexu znamená jen „neuvedeno v indexu“, ne „neexistuje“.

## 5. Digitalizované matriky

Matriky (knihy narozených, oddaných a zemřelých) jsou hlavní primární pramen zhruba do roku 1900–1920. Starší svazky jsou ve státních oblastních archivech a většina z nich je zdarma online.

**Kde hledat:**

- Morava a Slezsko: [MZA Acta Publica](https://www.mza.cz/actapublica/) (Moravský zemský archiv; po bezplatné registraci).
- Západní Čechy: [Porta fontium](https://www.portafontium.eu/) (Státní oblastní archiv v Plzni).
- Ostatní kraje: web příslušného státního oblastního archivu, sekce „digitalizované matriky“ nebo „badatelna online“. Archiv se řídí místem, kde událost proběhla, ne bydlištěm dnešní rodiny.
- Slovensko a další země: FamilySearch (snímky) a národní archivy.

**Postup:**

1. Z indexu, rodinného listu nebo rozhovoru zjisti **obec, rok a typ události**. Zjisti, ke které farnosti obec v té době patřila (uvádí to katalog archivu u svazku).
2. Najdi svazek podle farnosti, typu a let. Ověř, že obsahuje tvou obec – svazky bývají po obcích.
3. Narození a sňatky bývají řazené chronologicky, někdy s rejstříkem jmen na konci svazku.
4. Najdi řádek, přečti **celý** zápis: dům, rodiče, kmotry, porodní bábu, poznámky na okraji (sňatek, úmrtí, legitimace).
5. Do pramene zapiš archiv, signaturu nebo číslo svazku, číslo snímku, stranu/folio, URL a doslovný přepis. Překlad z latiny či němčiny dej zvlášť do interpretace.
6. Nečitelné písmeno označ `[?]`, nečitelné slovo `[nečitelné]`. Nedomýšlej.
7. Ze zápisu vyplynou další kroky: jména rodičů → jejich sňatek (obvykle 1–3 roky před prvním dítětem) → jejich narození (podle věku při sňatku).

**Tipy ke čtení:** do 1784 bývají zápisy latinsky volným textem, potom v tabulkách, mezi 1850 a 1918 často německy kurentem. Pomůže tabulka kurentu, slovník latinských výrazů (filius legitimus = manželský syn, faber = kovář, agricola = rolník) a trpělivost. Fotografie výřezu ulož k prameni.

**Nověji než asi 100 let** (narození) nebo 75 let (sňatky, úmrtí) jsou matriky u matričních úřadů. Žádost o výpis je **až poslední krok** – po vyčerpání rodinných papírů, rozhovorů a online stop. Připrav jméno, datum, místo a vztah k osobě; podmínky ověř na webu úřadu.

## 6. Jak poznat, že jsi hotový s generací

Pro každého předka se snaž mít: narození, sňatek a úmrtí z primárního zápisu, rodiče jmenované v jeho vlastním křtu nebo sňatku a aspoň jeden další nezávislý pramen (sčítání, náhrobek, dokument). Co chybí, má v kronice badatelský úkol s konkrétním dalším krokem. Kronika ukáže stav každé vazby barvou v rodokmenu.
