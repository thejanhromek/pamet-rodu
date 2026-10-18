---
name: prvni-spusteni
description: Provede nového uživatele instalací a prvním spuštěním Rodové kroniky – Node.js, ukázka, odpojení od veřejné šablony, soukromá záloha, založení vlastní kroniky. Použij, když uživatel projekt právě stáhl, poslal odkaz na repozitář šablony, říká „chci to vyzkoušet“, „jak začít“, nebo když src/data/genealogy.json obsahuje ukázku (meta.sample).
---

# První spuštění

Uživatel nemusí být programátor. Mluv česky, po krocích, a před každou instalací nebo změnou mimo složku projektu se zeptej. Na konci každého kroku řekni, co se stalo a co bude dál.

## 1. Kontrola prostředí

- `node --version` – potřeba 20+. Chybí-li: odkaž na https://nodejs.org/ (LTS), nebo se souhlasem `winget install OpenJS.NodeJS.LTS` (Windows) / `brew install node` (macOS). Po instalaci může být nutné otevřít nový terminál.
- `git --version` – volitelné, ale doporučené (historie změn, záloha). Bez gitu projekt funguje.

## 2. Odpojení od veřejné šablony

Pokud je projekt klon veřejné šablony (`git remote -v` ukazuje GitHub šablony):

- `git remote rename origin sablona` – nové verze šablony lze později stáhnout `git pull sablona main`.
- Vysvětli, že kronika bude obsahovat osobní údaje rodiny a **nikdy** se nesmí pushnout do veřejného repozitáře.
- Chce-li uživatel zálohu na GitHubu: se souhlasem `gh repo create <nazev> --private --source . --remote origin` a `git push -u origin main`. Vždy **--private**.

## 3. Ukázka

- `node scripts/build.mjs` a `node --test`; při chybě ji vysvětli a oprav.
- Otevři `dist/rodova-kronika.html` v prohlížeči (Windows `start`, macOS `open`, Linux `xdg-open`).
- Krátká prohlídka: Přehled, Rodokmen (čísla předků, styl čar = jistota vazby, prázdná karta „Neznámá matka“), osoba Jan Kalina (rozpor v roce narození), Místa (mapa a „Stěhování rodu“), Prameny (doslovný přepis vs. výklad). Zdůrazni, že rod Kalinů je vymyšlený.

## 4. Vlastní kronika

- Zeptej se na jméno a příjmení, (volitelně) pohlaví, rok narození, název kroniky a e-mail pro návrhy oprav od rodiny.
- `node scripts/init.mjs --vlastni --jmeno "Jméno Příjmení" [--pohlavi muz|zena] [--narozeni RRRR] [--nazev "…"] [--email …]`. Ukázka zůstane v `examples/ukazka/`.
- `node scripts/build.mjs` a otevři kroniku znovu.
- Pokračuj dovedností `uvodni-rozhovor`.

## 5. Na závěr

Shrň uživateli, co má hotové, kde jsou data (`src/data/genealogy.json`), jak kroniku znovu sestavit (`node scripts/build.mjs`) a co dělat dál (první rozhovor s pamětníkem, `docs/pruvodce-vyzkumem.md`). Připomeň: rodině posílat jen zaheslovanou verzi (`node scripts/protect.mjs`), repozitář jen soukromý.
