# Přenos funkcí ze soukromé kroniky do šablony

Šablona vznikla ze soukromé rodinné kroniky. Nové funkce se dál vyvíjejí tam (na skutečných datech) a do šablony se přenášejí jen jako kód. Tento postup je pro správce šablony; běžný uživatel ho nepotřebuje.

## Pravidla

- Šablona je **samostatný repozitář s čistou historií**. Nikdy nevzniká klonem ani forkem rodinného repozitáře – jeho historie obsahuje osobní data.
- Přenáší se jen soubory z explicitního seznamu (allowlist) v rodinném skriptu `scripts/export-public.mjs`: aplikační kód, styly, šablona HTML, vendored knihovny, obecné skripty, `history.json`, obecná dokumentace a testy, které nečtou rodinná data.
- Nikdy se nepřenáší `src/data/genealogy.json`, `src/data/family-edition.json`, `assets/`, `research/`, `dist/` ani `imports/` – skript je odmítne, i kdyby byly na seznamu.
- Šablona si vlastní: ukázková data (`src/data/genealogy.json`, `examples/`), ukázkové médium, README a další dokumentaci, dovednosti v `.claude/skills/`, testy nad ukázkou (`tests/sample-*.test.*`, `tests/init.test.mjs`) a `scripts/init.mjs`. Export je nepřepisuje.

## Postup (v rodinném repozitáři)

```bash
node scripts/export-public.mjs --dry-run
node scripts/export-public.mjs --target ../rodova-kronika-sablona
```

Skript:

1. sestaví seznam souborů z allowlistu,
2. **zkontroluje soukromí** dřív, než cokoli zapíše: hledá v exportovaných souborech jména a příjmení osob (i v pádech), všechna ID z rodinných dat, názvy a ID míst (obecné dějiny v `history.json` smějí jmenovat obce), soubory médií, URL pramenů, začátky poznámek a tvrzení a jakoukoli e-mailovou adresu kromě `example.com`. Jediný nález export zastaví,
3. zapíše změněné soubory do šablony a znovu prověří **celou** šablonu,
4. v šabloně spustí build a testy,
5. změny zastaguje a připraví zprávu commitu do `.git/EXPORT_COMMIT_MSG`. Necommituje a nic nepushuje.

Potom v šabloně:

```bash
git diff --cached
git commit -F .git/EXPORT_COMMIT_MSG
```

a po kontrole `git push`.

## Když kontrola selže

- Rodinné jméno nebo ID v kódu či komentáři nahraď obecným příkladem (vymyšlené jméno, které v rodinných datech není).
- Rodinné texty v kódu patří do dat (např. `src/data/family-edition.json`), ne do skriptů.
- Test, který čte rodinná data, do allowlistu nepatří; pro šablonu napiš obdobný test nad ukázkou.
- Nový obecný soubor přidej do allowlistu vědomě, s ohledem na jeho obsah.

Pokud se ukázkový rod v šabloně dostane do kolize s rodinnými daty (např. stejné příjmení), změň ukázku, ne kontrolu.
