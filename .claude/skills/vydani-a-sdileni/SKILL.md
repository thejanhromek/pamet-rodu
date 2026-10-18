---
name: vydani-a-sdileni
description: Připraví kroniku pro rodinu – rodinné nebo lehké vydání, zaheslování, tištěnou knihu, audioknihu, dotazník pro příbuzného, archivní vydání – a zpracuje návrhy oprav, které příbuzní poslali e-mailem. Použij, když uživatel chce kroniku poslat, vytisknout, „udělat vydání“, k Vánocům, nebo mu přišly opravy od rodiny.
---

# Vydání a sdílení s rodinou

Nic neposílej ani nenahrávej sám; připrav soubory a řekni uživateli, co s nimi. Před sdílením nabídni dovednost `kontrola-soukromi`.

## 1. Co a pro koho

| Potřeba | Příkaz | Výstup |
|---|---|---|
| kronika pro počítač | `node scripts/build.mjs` | `dist/rodova-kronika.html` |
| pro e-mail a slabší telefony | `node scripts/build.mjs --edition light` | `dist/rodova-kronika-lehka.html` (bez nahrávek) |
| zaheslovat | `node scripts/protect.mjs [--input … --output …]` | `dist/rodova-kronika-zaheslovana.html` |
| kniha k tisku | `node scripts/build-book.mjs --pdf [--ego <id>]` | HTML a PDF v `dist/` |
| audiokniha | `node scripts/build-audiobook.mjs` | `dist/audiokniha/` (Windows, český hlas) |
| dotazník pro příbuzného | `node scripts/questionnaire.mjs --person <id> --pdf` | `dist/dotaznik-<id>.html/.pdf` |
| archiv na dlouhá léta | `node scripts/release.mjs` | `releases/<verze>/` + lokální tag `vydani-<verze>` |

- Ven jde jen zaheslovaná kopie rodinného nebo lehkého vydání. Heslo uživatel předá jinou cestou (telefon, osobně). **Badatelské vydání se nesdílí nikdy.**
- Texty pro rodinu (přeformulované poznámky, vynechaná tvrzení) se ladí v `src/data/family-edition.json`; zdrojová data se kvůli rodině nemění.
- `release.mjs` vytvoří git tag jen lokálně; nepushuj ho bez souhlasu. Od posledního tagu se v příštím rodinném vydání počítá „Co je nového“. Před vydáním spusť `node --test`.
- Pro tisk dotazníku vyber osobu, o které kronika nejvíc neví (rodiče a prarodiče bez dat) a která je naživu a ochotná psát.

## 2. Návrhy od příbuzných

Je-li v `meta.feedback.email` adresa, kronika nabízí formulář „Navrhnout opravu nebo doplnit vzpomínku“. Došlé e-maily:

1. Ulož je jako `.txt` nebo `.eml` (nebo zkopíruj do schránky).
2. `node scripts/import-suggestions.mjs zprava1.txt zprava2.eml` (ve Windows i `Get-Clipboard | node scripts/import-suggestions.mjs -`). Původní znění se uloží do `research/suggestions/` a vznikne dávka změn s pramenem typu `family-record`.
3. Projdi s uživatelem každý návrh: kdo píše, odkud to ví (vlastní vzpomínka, nebo slyšel), zda to odporuje pramenům. Rozpor nepřepisuj – nech obě tvrzení.
4. `node scripts/apply-changes.mjs <dávka>.json --dry-run`, po souhlasu bez `--dry-run`.
5. Navrhni uživateli krátké poděkování pisateli (sám ho neposílej).

## 3. Na závěr

Řekni, které soubory vznikly, kam patří (rodina / soukromá záloha) a co se změnilo od minulého vydání.
