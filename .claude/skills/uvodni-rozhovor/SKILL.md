---
name: uvodni-rozhovor
description: Úvodní rozhovor s uživatelem na začátku genealogického výzkumu. Použij, když uživatel začíná vlastní kroniku, říká „chci začít“, „co mám dělat první“, „pomoz mi s rodokmenem“, nebo když src/data/genealogy.json obsahuje jen ukázku či jedinou osobu.
---

# Úvodní rozhovor s uživatelem

Cíl: za 20–40 minut zjistit, co uživatel o rodině ví, zapsat to správně do kroniky a připravit konkrétní další kroky. Mluv česky, vlídně a srozumitelně; ptej se po jedné až dvou otázkách, ne dotazníkem najednou.

## 1. Výchozí stav

- Přečti `src/data/genealogy.json`. Je-li `meta.sample === true`, jde o vymyšlenou ukázku: nabídni `node scripts/init.mjs` (vlastní kronika) a počkej na souhlas. Nikdy nepřepisuj vlastní data bez `--force` a výslovného souhlasu.
- Vysvětli jednou větou míru jistoty (ověřeno / podpořeno / rodinný záznam / hypotéza) a že nic nebudeš domýšlet.

## 2. Otázky (postupně, podle odpovědí)

1. Uživatel: jméno, rok narození, obec; s čím souhlasí zapsat o sobě.
2. Rodiče: jména (u žen i za svobodna), roky, obce, povolání. Žijí? Souhlasí se zápisem?
3. Prarodiče z obou stran: totéž, plus kde jsou pohřbeni.
4. Praprarodiče a starší: co se ví, od koho to je (vlastní znalost, vyprávění, papír).
5. Sourozenci rodičů a prarodičů, stěhování, emigrace, války, rodinné legendy.
6. Kdo z pamětníků žije a mohl by vyprávět? Kdo má doma dokumenty a fotky?
7. Co už uživatel zkoušel (MyHeritage, FamilySearch, matriky) a co našel – s odkazy.

## 3. Zápis

- Každá osoba: stabilní `id` ve tvaru `prijmeni-jmeno-rok` (bez diakritiky), `displayName`, `surnames`, `sex`, `lineage` (`self`, `direct`, `collateral`, `affinal`), `branch`.
- Pramen pro vyprávění uživatele: `type: "family-record"`, v `transcriptionLines` doslovně, co řekl.
- Vztahy `parent-child` (`from` = rodič, `to` = dítě), `spouse`, `sibling`; `evidence: "family-record"`.
- U žijících osob jen to, s čím souhlasí (často jméno a rok narození).
- Co nikdo neví, nezakládej jako osobu ani odhad: vytvoř `researchTasks` s konkrétním `nextAction`.
- Přidej záznam do `changelog` a spusť `node scripts/build.mjs` a `node --test`.

## 4. Plán dalších kroků

Na závěr shrň do 5–8 bodů a zapiš jako badatelské úkoly (priorita 1 = nejdřív):

1. Rozhovor s nejstarším pamětníkem – odkaž na `docs/dotaznik-pro-pametniky.md` a `docs/souhlas-s-nahravanim.md`.
2. Sběr rodinných podkladů – checklist v `docs/pruvodce-vyzkumem.md`, oddíl 3.
3. Pracovní stopy online (MyHeritage, FamilySearch) pro konkrétní osoby.
4. Konkrétní matriční svazky (obec, farnost, typ, roky), až budou známá místa.

Žádost u matričního úřadu doporuč až jako poslední krok.
