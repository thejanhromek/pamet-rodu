# Rodová kronika – šablona

Nástroj pro vlastní genealogický průzkum a rodinnou kroniku. Výsledkem je **jeden HTML soubor**, který se otevře v libovolném prohlížeči i bez internetu: rodokmen (vývod předků s čísly jako v knize i celý rodokmen), osoby, příběhy, mapa míst se stěhováním rodu, časová osa s dějinným kontextem, prameny s fotografiemi a ke každému údaji míra jistoty a pramen, ze kterého pochází. Ze stejných dat vznikne i tištěná kniha pro babičky a dědy a audiokniha.

Šablona obsahuje **vymyšlený ukázkový rod Kalinů z Lipové Lhoty** – nic z něj není skutečné. Můžeš si na něm vše vyzkoušet a pak začít vlastní kroniku.

![Ukázková ilustrace statku](assets/optimized/statek-lipova-lhota-ilustrace.webp)

## Nejrychlejší start: pošli odkaz AI asistentovi

Nainstaluj si [Claude Code](https://claude.com/claude-code) (nejpohodlněji desktopovou aplikaci Claude, záložka Code), otevři v ní libovolnou složku, kam chceš kroniku uložit (např. Dokumenty), a napiš:

> Chci si založit rodovou kroniku podle tohoto projektu: *odkaz na tento repozitář*

Asistent tě provede instalací, ukázkou i prvním rozhovorem o rodině. Bez AI asistenta postupuj podle oddílu [První spuštění](#první-spuštění-5-minut).

### Pokyny pro AI asistenta (Claude Code, Codex a další)

Pokud tě uživatel poslal na tento repozitář, aby si založil vlastní kroniku, postupuj takto. Mluv česky, krátce a srozumitelně – uživatel nemusí být programátor. Před každým krokem, který něco instaluje nebo mění mimo složku projektu, se zeptej.

1. **Kam:** zeptej se, kam projekt uložit (výchozí: podsložka `rodova-kronika` v aktuální složce). Naklonuj repozitář (`git clone <odkaz> rodova-kronika`); když git chybí, stáhni ZIP (`<odkaz>/archive/refs/heads/main.zip`) a rozbal ho.
2. **Odpojení od šablony:** v klonu spusť `git remote rename origin sablona`. Kronika bude obsahovat osobní údaje, takže se nikdy nesmí pushnout do veřejného repozitáře. Pokud uživatel chce zálohu na GitHubu, založ mu nový **soukromý** repozitář (`gh repo create <nazev> --private --source . --remote origin`) až po jeho výslovném souhlasu.
3. **Node.js:** ověř `node --version` (potřeba 20 nebo novější). Když chybí, vysvětli, jak ho nainstalovat z [nodejs.org](https://nodejs.org/) (verze LTS), nebo s jeho souhlasem nainstaluj (`winget install OpenJS.NodeJS.LTS` ve Windows, `brew install node` na macOS).
4. **Ukázka:** ve složce projektu spusť `node scripts/build.mjs` a `node --test`, otevři uživateli `dist/rodova-kronika.html` v prohlížeči a ve dvou třech větách mu ukaž rodokmen, osobu s rozporem (Jan Kalina), mapu a míru jistoty. Ukázkový rod je vymyšlený.
5. **Pravidla projektu:** přečti `AGENTS.md` a dovednosti v `.claude/skills/*/SKILL.md` – platí pro veškerou další práci. Řekni uživateli, že pro další práci je nejlepší otevřít v Claude Code přímo složku projektu (pak se pravidla a dovednosti načtou samy).
6. **Vlastní kronika:** až bude uživatel chtít, postupuj podle dovednosti `.claude/skills/prvni-spusteni/SKILL.md` a pak `uvodni-rozhovor`: založ kroniku přes `node scripts/init.mjs --vlastni --jmeno "…"`, vyptej se, co o rodině ví, zapiš to a navrhni další kroky výzkumu.

## Co potřebuješ

- **Node.js 20 nebo novější** (zdarma, [nodejs.org](https://nodejs.org/), na Windows stačí stáhnout instalátor „LTS“ a klikat Další). Nic dalšího se neinstaluje – projekt nemá žádné npm závislosti.
- Volitelně **Git**, pokud chceš mít historii změn a zálohu.
- Volitelně pro rozhovory s pamětníky: **ffmpeg** (převod zvuku) a **Python 3.10+** s knihovnou faster-whisper (automatický přepis). Viz [Rozhovory](#rozhovory-s-pametniky).
- Volitelně pro audioknihu: Windows s českým hlasem (Nastavení › Čas a jazyk › Řeč).

## První spuštění (5 minut)

1. Stáhni projekt (zelené tlačítko **Code › Download ZIP** na GitHubu, nebo `git clone`) a rozbal ho.
2. Otevři v té složce příkazový řádek (ve Windows: v Průzkumníku do adresního řádku napiš `cmd` a Enter).
3. Zkus ukázku:

   ```bash
   node scripts/build.mjs
   ```

   a otevři `dist/rodova-kronika.html` dvojklikem. To je hotová kronika.
4. Až budeš chtít začít vlastní kroniku:

   ```bash
   node scripts/init.mjs
   ```

   Skript se zeptá na tvé jméno, rok narození a název kroniky a založí prázdný rodokmen s tebou jako výchozí osobou. Ukázka zůstane ve složce `examples/ukazka/` (vrátíš ji příkazem `node scripts/init.mjs --ukazka --force`).
5. Po každé změně dat znovu spusť `node scripts/build.mjs` a obnov stránku v prohlížeči.

Kontrola, že vše funguje: `node --test` (spustí všechny testy).

## Jak kronika roste

Všechna data jsou v jednom souboru `src/data/genealogy.json`: osoby, vztahy, události, místa, prameny, média, tvrzení s mírou jistoty, badatelské úkoly a historie změn. Přesný popis polí je v [docs/data-contract.md](docs/data-contract.md).

Nejpohodlnější je pracovat s AI asistentem (Claude Code, Codex apod.): projekt obsahuje pokyny [AGENTS.md](AGENTS.md) a připravené dovednosti ve složce `.claude/skills/`:

| Dovednost | K čemu |
|---|---|
| `prvni-spusteni` | Provede instalací, ukázkou a založením vlastní kroniky. |
| `uvodni-rozhovor` | Asistent se tě vyptá, co o rodině víš, a založí první osoby, úkoly a seznam podkladů. |
| `novy-nalez` | Zapíše nález z matriky, dokumentu nebo vyprávění správně do dat (pramen, přepis, tvrzení, stav důkazu). |
| `zpracuj-rozhovor` | Projde přepis nahraného rozhovoru a navrhne vzpomínky, úryvky a nová tvrzení. |
| `kontrola-soukromi` | Před sdílením zkontroluje, že se ven nedostanou údaje žijících lidí nebo pracovní poznámky. |

Bez AI asistenta stačí textový editor (např. VS Code): zkopíruj podobný záznam z ukázky a uprav ho. Chybu v datech ohlásí `node --test`.

### Míra jistoty

Každé důležité tvrzení má jeden ze čtyř stavů a nejméně jeden pramen:

- **Ověřeno** (`verified`) – doloženo vlastním primárním zápisem (matrika, úřední dokument).
- **Podpořeno** (`supported`) – podporují ho nezávislé, ale slabší prameny (sčítání, náhrobek, index).
- **Rodinný záznam** (`family-record`) – vyprávění, rodinný sešit, dopis.
- **Hypotéza / rozpor** (`hypothesis`) – pracovní domněnka nebo nevyřešený rozpor.

Rozpory se nemažou, zapisují se vedle sebe. Jak hodnotit prameny, popisuje [docs/genealogicky-vyzkum-postupy.md](docs/genealogicky-vyzkum-postupy.md).

## Kde začít s výzkumem

[docs/pruvodce-vyzkumem.md](docs/pruvodce-vyzkumem.md) provede prvními týdny: co sesbírat doma, jak vést rozhovor s pamětníky ([dotazník](docs/dotaznik-pro-pametniky.md) a [souhlas s nahráváním](docs/souhlas-s-nahravanim.md)), jak číst digitalizované matriky a jak bezpečně používat MyHeritage a FamilySearch jako pracovní stopy.

## Sdílení s rodinou

Podrobně v [docs/soukromi-a-sdileni.md](docs/soukromi-a-sdileni.md). Stručně:

- **Zaheslovaná kronika** pro počítač a telefon:

  ```bash
  node scripts/build.mjs
  node scripts/protect.mjs
  ```

  Vznikne `dist/rodova-kronika-zaheslovana.html`. Soubor se šifruje v počítači (AES-GCM), heslo předej rodině zvlášť. Bez hesla nejde otevřít ani obnovit.
- **Tištěná kniha**: `node scripts/build-book.mjs --pdf` (PDF vytiskne nainstalovaný Edge nebo Chrome; `--ego id-osoby` = kniha z pohledu jiné osoby).
- **Audiokniha**: `node scripts/build-audiobook.mjs` (Windows, český hlas; bez hlasu vzniknou jen texty).
- **Návrhy oprav od rodiny**: vyplň `meta.feedback.email` a kronika nabídne tlačítko, které připraví e-mail.

Rodinné vydání automaticky vynechá badatelské úkoly, historii změn a pracovní poznámky. Texty pro rodinu můžeš doladit v `src/data/family-edition.json`.

## Rozhovory s pamětníky

1. Zvuk z videí nebo diktafonu: `node scripts/import-interview.mjs 2026-11-02-jmeno-pametnika video1.mp4 video2.mp4` (potřebuje ffmpeg).
2. Do složky `assets/interviews/<id>/` můžeš dát `prompt.txt` se jmény, obcemi a slovy z rozhovoru – přepis je pak píše správně.
3. Přepis běží lokálně, nic se neodesílá:

   ```bash
   python -m venv .venv-whisper
   .venv-whisper/Scripts/python -m pip install faster-whisper
   .venv-whisper/Scripts/python scripts/transcribe.py assets/interviews/2026-11-02-jmeno-pametnika
   ```

   (Na Linuxu a macOS `.venv-whisper/bin/python`. S grafikou NVIDIA doinstaluj `nvidia-cublas-cu12 "nvidia-cudnn-cu12==9.*"`; bez ní přepis běží pomaleji na procesoru. Model má asi 3 GB.)
4. Úryvky zapiš do dat jako média `kind: "audio-clip"` a vyřízni je `node scripts/make-clips.mjs`.

Plné nahrávky se do gitu neukládají (`.gitignore`) – zálohuj je zvlášť.

## Soukromí na prvním místě

- Svůj rodinný repozitář **nech soukromý**. `src/data/`, `assets/` a `dist/` obsahují osobní údaje.
- Nezaheslovaný `dist/rodova-kronika.html` nedávej na sdílená úložiště.
- U žijících lidí zapisuj jen to, s čím souhlasí (často stačí jméno a rok narození).
- Aplikace nic neodesílá na internet; mapa i knihovny jsou vložené přímo do souboru.

## Aktualizace šablony

Nové funkce se do šablony přenášejí z autorovy soukromé kroniky skriptem, který kopíruje jen kód a hlídá, aby se do veřejného projektu nedostala žádná rodinná data – postup je v [docs/prenos-funkci.md](docs/prenos-funkci.md). Pokud máš vlastní kopii šablony v gitu, nové verze si stáhneš `git pull` z původního repozitáře; tvoje data v `src/data/` se nepřepíšou, kromě vzácných změn ukázky (pak ponech svou verzi).

## Struktura projektu

```text
src/                 aplikace (JavaScript, styly, šablona HTML) a vendored knihovny
src/data/            tvoje data: genealogy.json, family-edition.json, history.json (obecné dějiny)
examples/ukazka/     vymyšlený ukázkový rod (používají ho testy)
assets/              fotografie (source = pracovní kopie, optimized = náhledy WebP) a rozhovory
scripts/             build, kniha, audiokniha, zaheslování, rozhovory, init
tests/               automatické testy (node --test)
docs/                datový kontrakt, průvodce výzkumem, dotazník, soukromí
.claude/skills/      dovednosti pro AI asistenta
```

`src/data/history.json` obsahuje obecné dějinné události s důrazem na Moravu; můžeš ho rozšířit o svůj kraj nebo při buildu použít jiný soubor (`--history cesta.json`).

## Licence

Kód šablony: viz [LICENSE](LICENSE). Vendored knihovny mají vlastní licence ve `src/vendor/` (Leaflet BSD-2-Clause, Leaflet.markercluster MIT, ELK.js EPL-2.0); obrysy států pocházejí z Natural Earth (public domain). Tvoje data a fotografie patří tobě a licence šablony se na ně nevztahuje.
