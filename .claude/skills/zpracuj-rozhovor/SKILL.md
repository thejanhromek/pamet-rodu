---
name: zpracuj-rozhovor
description: Zpracuje nahraný rozhovor s pamětníkem – import zvuku, lokální přepis Whisperem, vytěžení vzpomínek, úryvky do kroniky. Použij, když uživatel má nahrávku nebo přepis rozhovoru (assets/interviews/...), nebo řekne „zpracuj rozhovor s babičkou“.
---

# Zpracování rozhovoru s pamětníkem

## 1. Příprava souborů

- Originální nahrávky nech beze změny; připomeň zálohu mimo git.
- Zvuk: `node scripts/import-interview.mjs RRRR-MM-DD-jmeno video1 video2 …` → `assets/interviews/<id>/audio/cast-N.m4a`.
- Do `assets/interviews/<id>/prompt.txt` napiš jména osob, příjmení v pádech, obce a typická slova z rozhovoru (z dat kroniky a od uživatele). Zlepší přepis.
- Přepis (lokálně, nic se neodesílá): `python scripts/transcribe.py assets/interviews/<id>` ve virtuálním prostředí s faster-whisper (viz docs/navod.md). Vznikne `transcript.txt`, `.srt` a `.json` s časy.
- Ověř, že existuje souhlas vypravěče (`docs/souhlas-s-nahravanim.md`) a co povoluje.

## 2. Pramen rozhovoru

Založ `sources[]` s `type: "oral-history"`: kdo vypráví, kdo se ptá, datum, místo, cesta k přepisu, co povoluje souhlas. Do `transcriptionLines` dávej **doslovné** citace s časem `[h:mm:ss]`.

## 3. Vytěžení

Projdi přepis po částech a navrhni uživateli (nezapisuj naslepo):

- **Fakta** (jména, data, místa, povolání, sňatky, stěhování) → tvrzení `family-record` s odkazem na pramen a časem v `reasoning`.
- **Vzpomínky** pro rodinu → `notes` u osoby, jejíž život popisují; jen pokud lze bezpečně přiřadit, o kom je řeč.
- **Rozpory** se známými daty → nové tvrzení vedle starého, nic nepřepisuj; badatelský úkol.
- **Nová jména a stopy** → badatelské úkoly (koho se zeptat, co hledat v matrice).

Pravidla:

- Strojový přepis komolí jména, obce a čísla. U každého údaje, který zapisuješ, ať uživatel poslechne příslušné místo nahrávky; nejistotu zapiš, neopravuj odhadem.
- Rozlišuj vlastní vzpomínku vypravěče od převzatého vyprávění („tatínek říkal…“).
- O žijících lidech zapisuj jen to, co souhlas dovoluje a co dotčení akceptují.

## 4. Úryvky do kroniky

Pro 3–10 nejsilnějších míst přidej `media[]`:

```json
{ "id": "audio-<id>-01-tema", "kind": "audio-clip", "title": "Krátký název",
  "file": "interviews/<id>/clips/01-tema.webm", "sourceId": "src-...", "personIds": ["..."],
  "interview": "<id>", "start": 17.2, "end": 115, "speaker": "Jméno (* rok)", "quote": "doslovný přepis" }
```

Časy jsou v sekundách celého rozhovoru (`interviewStart` v `transcript.json`). Úryvek drž pod 2–3 minuty. Build k úryvku sám doplní slova s časy z `transcript.json`, takže přehrávač v kronice ukazuje přepis souběžně se zvukem; ručně nic nepiš.

Více nových osob a tvrzení z jednoho rozhovoru zapiš jako dávku změn (`rk-changes/1`), ukaž ji uživateli přes `node scripts/apply-changes.mjs davka.json --dry-run` a zapiš po souhlasu. Pak `node scripts/make-clips.mjs` (potřebuje ffmpeg), `node scripts/build.mjs` a `node --test`.

## 5. Shrnutí

Uživateli shrň: co bylo zapsáno, co čeká na poslech a ověření, nové úkoly a otázky na příští rozhovor.
