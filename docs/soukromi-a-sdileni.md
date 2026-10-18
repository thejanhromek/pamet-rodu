# Soukromá a veřejná data, sdílení s rodinou

Rodová kronika obsahuje údaje o skutečných lidech, často žijících. Tento dokument shrnuje, co je soukromé, co lze zveřejnit a jak kroniku bezpečně předat rodině. Nejde o právní radu; při zveřejňování mimo rodinu si ověř aktuální pravidla ochrany osobních údajů.

## Co je soukromé

| Soubor nebo složka | Obsah | Kam smí |
|---|---|---|
| `src/data/genealogy.json` | všechny osoby, vztahy, prameny, poznámky, úkoly | jen soukromý repozitář / tvůj počítač |
| `src/data/family-edition.json` a doplňkové soubory (`gazetteer`, `history-local`, `registers`, `media-notes`) | texty pro rodinu, místopis, katalog matrik, označené tváře | jen soukromý repozitář |
| `research/` | DNA shody, došlé návrhy, importy GEDCOM, potvrzené výjimky | jen soukromý repozitář; DNA shody vždy pod pseudonymem |
| `assets/` | fotografie, dokumenty, nahrávky, přepisy | jen soukromý repozitář; plné nahrávky ani tam (`.gitignore`) |
| `dist/rodova-kronika.html`, `dist/rodova-kronika-lehka.html` | rodinné / lehké vydání nešifrovaně | nikam ven, jen po zaheslování |
| `dist/rodova-kronika-badatel.html` | všechna data včetně pracovních poznámek a DNA | nikdy nikomu |
| `releases/` | archivní vydání včetně dat | soukromá záloha |
| `dist/rodova-kronika-zaheslovana.html` | šifrovaná kronika | rodině (e-mail, cloud, flash disk) |
| kniha PDF, audiokniha | rodinné vydání | rodině osobně |

Obecné a veřejné jsou: kód v `src/` a `scripts/`, testy, dokumentace, `src/data/history.json` a vymyšlený ukázkový rod v `examples/`.

## Žijící lidé

- Zapisuj jen to, co dotčený člověk ví a s čím souhlasí. Často stačí jméno, rok narození a vztah.
- Bez souhlasu nezapisuj adresy, telefony, zdravotní stav, víru, rozvody, adopce a nemanželské děti.
- Při pochybnosti údaj nezapisuj vůbec, nebo jen do poznámky v soukromých datech, ne do rodinného vydání.
- Fotografie žijících lidí sdílej jen s jejich svolením.

## Jak sdílet s rodinou

1. Sestav kroniku a zašifruj ji:

   ```bash
   node scripts/build.mjs
   node scripts/protect.mjs
   ```

   Skript se dvakrát zeptá na heslo (nejméně 6 znaků, raději věta) a vytvoří `dist/rodova-kronika-zaheslovana.html`. Šifrování (AES-GCM, klíč odvozený z hesla PBKDF2) proběhne v počítači; soubor se otevře v Chrome, Edge, Firefoxu i Safari a odemkne se po zadání hesla. Nic se neodesílá na internet.
2. Soubor pošli nebo nahraj (e-mail, sdílená složka, flash disk). **Heslo předej jinou cestou** – telefonem nebo osobně.
3. Heslo se nikam neukládá a nejde obnovit. Zapiš si ho.
4. Po každé aktualizaci kroniky pošli nový zaheslovaný soubor (heslo může zůstat stejné).

Rodinné vydání automaticky vynechá badatelské úkoly, historii změn, odůvodnění tvrzení a pracovní poznámky. Míra jistoty a odkazy na prameny zůstávají, aby rodina viděla, co je ověřené a co ne.

Pro ty, kdo nepoužívají počítač, vytiskni knihu (`node scripts/build-book.mjs --pdf`) nebo vytvoř audioknihu (`node scripts/build-audiobook.mjs`).

## GEDCOM pro jiné programy a servery

Pro nahrání rodokmenu jinam (MyHeritage, FamilySearch, Geni) exportuj vždy se skrytím žijících osob: `node scripts/gedcom.mjs export --living private`. Žijící osoby pak mají jen „Žijící osoba“ a vazby, bez dat, poznámek a fotek.

## Repozitář na GitHubu

- Svůj rodinný repozitář vytvoř jako **Private**. Nezveřejňuj ho ani dočasně – historie gitu si data pamatuje i po smazání souboru.
- Chceš-li ukázat svůj kód ostatním, nesdílej rodinný repozitář. Vytvoř nový s čistou historií a přenes do něj jen kód (viz [prenos-funkci.md](prenos-funkci.md)).
- Pokud se osobní data někdy dostala do veřejného repozitáře, nestačí je smazat: repozitář smaž nebo přepiš historii a považuj data za zveřejněná.

## Než cokoli zveřejníš

Projdi s AI asistentem dovednost `kontrola-soukromi`, nebo ručně:

- [ ] Žádná jména, data ani fotografie žijících osob bez jejich souhlasu.
- [ ] Žádné e-maily, telefony, adresy.
- [ ] Nezaheslovaný HTML soubor nikde ven.
- [ ] Fotografie a dokumenty: máš právo je zveřejnit (autor, archiv, licence)?
- [ ] Snímky z archivů: dodrž podmínky archivu (některé zakazují další šíření snímků).
