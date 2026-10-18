---
name: novy-nalez
description: Zapíše nový genealogický nález do kroniky – matriční zápis, dokument, fotografii, náhrobek, záznam z MyHeritage či FamilySearch nebo opravu. Použij, když uživatel řekne „našel jsem“, „přidej“, „zapiš“, pošle snímek matriky, odkaz na rodokmen nebo opravuje údaj.
---

# Nový nález

Postupuj podle `AGENTS.md` a `docs/genealogicky-vyzkum-postupy.md`. Nikdy nevymýšlej jména, data ani vazby.

## 1. Co je to za nález

Urči typ: nová osoba, vztah, událost, místo, pramen, médium, nebo oprava existujícího údaje. Najdi v `src/data/genealogy.json`, zda osoba nebo pramen už neexistuje (hledej i varianty jména a rodná příjmení). Shoda jména a obce **nestačí** ke ztotožnění – porovnej datum, dům, partnera, rodiče, děti, povolání.

## 2. Pramen

Založ nebo doplň `sources[]`:

- `id` (`src-...`), `title` (archiv, svazek, snímek, strana/folio, co zápis obsahuje), `type` (`parish-register`, `census-record`, `official-document`, `family-notebook`, `oral-history`, `gravestone-photo`, `foreign-family-tree`, …), `publisher`, `url`, `accessedAt`.
- `transcriptionLines`: **doslovný přepis** podstatných řádků ve znění originálu (i latinsky/německy). Nečitelné označ `[?]` nebo `[nečitelné]`.
- `reliabilityNote`: zda jsi četl originální obraz, index, nebo strojový přepis; co je nejisté.
- MyHeritage, FamilySearch, cizí stromy a indexy: konkrétní URL a poznámka, že údaj **vyžaduje ověření**.

Snímek nebo fotku ulož do `assets/source/`, náhled WebP do `assets/optimized/` a přidej `media[]` s `sourceId` a `personIds`.

## 3. Interpretace

- Nové tvrzení v `claims[]`: `subjectType` + `subjectId`, `text` (interpretace česky), `reasoning` (proč), `sourceIds`, `evidence`:
  - `verified` – vlastní primární zápis o té události,
  - `supported` – nezávislé slabší prameny, index se signaturou, sčítání, náhrobek,
  - `family-record` – vyprávění, sešit, dopis,
  - `hypothesis` – domněnka, cizí strom bez pramene, nevyřešený rozpor.
- Vazba rodič–dítě: `relationships[]` s `evidence` podle nejsilnějšího tvrzení.
- Události (`birth`, `marriage`, `death`, `census`, `migration`, …) s `date` (ISO, jen je-li jisté) a `dateText` (jak je v prameni).
- Místa s `lat`/`lon` jen ze spolehlivého zdroje; `coordinatesStatus` `approximate`, je-li bod orientační.

## 4. Rozpory a hypotézy

- Rozporný údaj **nepřepisuj**. Přidej nové tvrzení vedle starého a oba nech viditelné; vysvětli v `reasoning`.
- Potvrzuje-li nález hypotézu, zvyš stav dotčených tvrzení a vazeb; vyvrací-li ji, změň text a stav, vazbu případně odstraň a zapiš proč do `changelog`.

## 5. Dokončení

1. Uprav nebo uzavři související `researchTasks` a přidej nový úkol pro další krok, který z nálezu plyne.
2. Přidej záznam do `changelog` (datum, kategorie, co se změnilo).
3. Při významné změně zvyš `meta.version` a nastav `meta.updatedAt`.
4. Spusť `node scripts/build.mjs` a `node --test`; chyby oprav.
5. Uživateli shrň: co bylo zapsáno, s jakou jistotou a co je další krok.
