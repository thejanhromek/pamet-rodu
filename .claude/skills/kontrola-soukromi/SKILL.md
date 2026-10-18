---
name: kontrola-soukromi
description: Zkontroluje kroniku nebo repozitář před sdílením či zveřejněním – žijící osoby, kontakty, nezaheslované soubory, pracovní poznámky, práva k fotografiím. Použij, když uživatel chce kroniku poslat rodině, nahrát na web, zveřejnit repozitář nebo se ptá „můžu to sdílet?“.
---

# Kontrola soukromí před sdílením

Nic nenahrávej, nepushuj ani neposílej sám. Výsledkem je seznam nálezů a doporučení; o sdílení rozhoduje uživatel.

## 1. Co a komu se sdílí

Zeptej se, co přesně (zaheslovaný HTML, kniha PDF, audiokniha, repozitář, výřez dat) a komu (rodina, obec, veřejnost). Pro rodinu doporuč vždy zaheslovaný soubor (`node scripts/protect.mjs`) a předání hesla jinou cestou.

## 2. Kontrola dat (`src/data/genealogy.json`)

- **Žijící osoby**: osoby bez `death` narozené před méně než ~100 lety. U každé vypiš, co o ní kronika uvádí (data, místa, poznámky, fotky, úryvky). Upozorni na víc než jméno, rok narození a vztah.
- **Citlivé údaje**: zdraví, víra, politika, rozvody, adopce, nemanželské děti, trestní věci, majetek – hledej v `notes`, `claims[].text`, `transcriptionLines`, `quote`.
- **Kontakty**: e-maily, telefony, adresy (regulární výrazy na `@`, číslice telefonů, „ulice“, „č. p.“ u žijících).
- **Souhlasy**: pramen rozhovoru uvádí, co vypravěč povolil? Odpovídá tomu sdílení?

## 3. Kontrola výstupu

- Rodinné vydání vynechává `researchTasks`, `changelog` a `reasoning` – ověř v sestaveném HTML (`window.RK_DATA`).
- `dist/rodova-kronika.html` (nezaheslovaný) nesmí odejít ven.
- `meta.feedback.email` bude v kronice viditelný – je to v pořádku?

## 4. Kontrola repozitáře (jen při zveřejňování)

- `git ls-files` a `git log --stat` – nejsou v historii `src/data/`, `assets/`, `dist/`? Pokud ano, repozitář **nesmí** být veřejný; je potřeba nový s čistou historií (`docs/prenos-funkci.md`).
- Grep celého stromu i historie (`git log -p`) na příjmení rodu, e-maily a ID osob.
- Fotografie a snímky z archivů: má uživatel právo je šířit? Podmínky archivu?

## 5. Výstup

Seznam nálezů seřazený podle závažnosti, u každého konkrétní místo (soubor, ID) a návrh (vynechat, zkrátit, zeptat se dotčeného, použít `src/data/family-edition.json` pro text pro rodinu). Změny v datech dělej jen se souhlasem uživatele a podle pravidel v `AGENTS.md`.
