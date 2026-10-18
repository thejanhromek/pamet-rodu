---
name: Rodová kronika
description: Klidný offline archivní pracovní stůl pro hledání osob, kontextu a důkazních řetězců.
colors:
  paper: "#f4f0e7"
  paper-deep: "#e8e0d1"
  paper-light: "#fbf9f3"
  ink: "#1d2722"
  ink-soft: "#566159"
  line: "#d4caba"
  line-strong: "#b9ad9b"
  wine: "#7b3f4b"
  wine-soft: "#f0dfe2"
  moss: "#3f6350"
  moss-soft: "#dfe9e1"
  gold: "#a97d3e"
  gold-soft: "#f3ead9"
  rust: "#a4543b"
typography:
  display:
    fontFamily: "Georgia, 'Times New Roman', serif"
    fontSize: "clamp(38px, 5vw, 70px)"
    fontWeight: 600
    lineHeight: ".98"
    letterSpacing: "-.025em"
  headline:
    fontFamily: "Georgia, 'Times New Roman', serif"
    fontSize: "clamp(24px, 2.6vw, 34px)"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-.025em"
  title:
    fontFamily: "Georgia, 'Times New Roman', serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.25
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "11px"
    fontWeight: 750
    lineHeight: 1.2
    letterSpacing: ".1em"
rounded:
  sm: "8px"
  md: "10px"
  lg: "14px"
  xl: "18px"
  dialog: "20px"
  pill: "999px"
  circle: "50%"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  section: "28px"
  panel: "30px"
components:
  button-primary:
    backgroundColor: "{colors.wine}"
    textColor: "{colors.paper-light}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "0 18px"
    height: "45px"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.wine}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "7px 0"
  field-search:
    backgroundColor: "rgba(255,255,255,.62)"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 45px 0 43px"
    height: "45px"
  nav-button:
    backgroundColor: "transparent"
    textColor: "{colors.ink-soft}"
    typography: "{typography.label}"
    padding: "0 14px"
    height: "42px"
  evidence-chip:
    backgroundColor: "{colors.wine-soft}"
    textColor: "{colors.wine}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "3px 8px"
    height: "24px"
  archive-card:
    backgroundColor: "rgba(251,249,243,.76)"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "19px"
  archive-panel:
    backgroundColor: "rgba(251,249,243,.68)"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "30px"
---

# Design System: Rodová kronika

## Overview

**Creative North Star: "Pracovní stůl v archivní čítárně"**

Rodová kronika je klidný, hustý pracovní archiv: papírový podklad, inkoustová typografie a střídmé barevné signály dávají přednost dohledatelnosti před dekorací. Každá plocha má pomoci najít osobu nebo stopu, udržet rodinný kontext na očích a pokračovat k prameni či dalšímu výzkumnému kroku.

Desktop je hlavní pracovní režim v šířkách 1440 a 1024 px: šest seskupených oblastí, jednotné indexové řádky, filtry a kontextové karty tvoří jeden průběžný stůl. Mobil je funkční fallback se stejným vizuálním jazykem, v němž se hustota rozvolní, strom přejde na přístupné karty a navigace zůstane ovladatelná bez dokumentového přetečení.

**The Workbench Rule.** Každý vizuální akcent má podporovat orientaci, důkazní stav nebo další akci; rozhraní není galerie ani dekorativní plakát rodokmenu.

**Key Characteristics:**
- Světlý archivní papír s inkoustovým textem a teplými pravidly.
- Serif pro hierarchii a sans-serif pro ovládání, metadata a skenování.
- Hustý desktopový pracovní stůl s lokálním kontextem místo dlouhých nečleněných seznamů.
- Vínová, mechová, zlatá a rezavá signalizace významu bez závislosti na samotné barvě.

## Colors

Paleta vychází ze světlého papíru a tmavého inkoustu; vínová nese hlavní akci a rodinnou jistotu, mechová podporuje ověřené vztahy, zlatá označuje podpůrné stavy a rezavá upozorňuje na problém nebo výjimku.

### Primary

- **Archivní víno** (`colors.wine`): hlavní akce, aktivní navigace, odkazy a nejdůležitější důkazní signál.
- **Mechová jistota** (`colors.moss`): ověřené nebo stabilní stavy a klidný protějšek vínové.

### Secondary

- **Tichá zlatá** (`colors.gold`): podpůrná jistota, pomocné větve a sekundární orientační signály.
- **Rezavé upozornění** (`colors.rust`): nosič chybového nebo varovného významu.

### Neutral

- **Papír** (`colors.paper`): hlavní pracovní pozadí.
- **Hlubší papír** (`colors.paper-deep`): tonalita, štítky a oddělení sekundárních ploch.
- **Světlý papír** (`colors.paper-light`): karty, formuláře, dialogy a plochy nad pracovním pozadím.
- **Inkoust** (`colors.ink`): primární text a tvrdá hierarchie.
- **Měkčí inkoust** (`colors.ink-soft`): metadata, popisy a podpůrné texty.
- **Pravidlo** (`colors.line`): běžné linky, oddělovače a jemné hranice.
- **Silné pravidlo** (`colors.line-strong`): focus fallbacky, výraznější hranice a prázdné stavy.
- **Měkké vínové, mechové a zlaté plochy** (`colors.wine-soft`, `colors.moss-soft`, `colors.gold-soft`): tónované významové pozadí bez tvrdého kontrastu.

**The Accent-as-Evidence Rule.** Vínová, mechová, zlatá a rezavá se používají jako významové signály, ne jako plošná výplň každé komponenty; text a struktura musí význam nést i bez barvy.

## Typography

**Display Font:** Georgia (with Times New Roman, serif fallback)

**Body Font:** Inter (with ui-sans-serif, system-ui and platform sans fallbacks)

**Character:** Serif přidává kronikářskou váhu jménům, nadpisům a číslům, zatímco sans-serif drží ovládání, metadata a filtry rychle čitelné. Typografie je věcná a klidná, ne historizující.

### Hierarchy

- **Display** (600, `clamp(38px, 5vw, 70px)`, `.98`): názvy hlavních pohledů a první orientace.
- **Headline** (600, `clamp(24px, 2.6vw, 34px)`, `1.1`): nadpisy pracovních sekcí a důležitých bloků.
- **Title** (600, `20px`, přibližně `1.25`): jména osob, úkolů a lokální obsahové titulky.
- **Body** (400, `16px`, `1.55`): vysvětlení, kontext a delší čtení.
- **Label** (750, `11px`, `1.2`, tracking `.1em`, často uppercase): filtry, metadata, navigační skupiny a stavové štítky.

**The Two-Voice Rule.** Serif rozhoduje o hierarchii a lidských jménech; sans-serif rozhoduje o ovládání a skenování. Jedna role nesmí přebírat práci druhé.

## Layout

Hlavní kontejner používá maximální šířku `1420px` s okrajem `20px` na desktopu. Horní archivní hlavička drží značku, globální hledání a pracovní stav v gridu; pod ní se šest primárních oblastí a skupinované podstránky skládají do navigačního pracovního pásu. Obsah používá hustší gridy, ruled listy, kontextové panely a lokální filtry místo jedné nekonečné karty.

Při 1440 px má pracovní stůl nejvíce prostoru pro paralelní kontext. Při 1024 px se sekundární navigace zalamuje a hlavní oblasti zůstávají ovladatelné bez dokumentového horizontálního skrolu. Do `680px` se obsah skládá do jednoho sloupce, strom přechází z SVG plochy na přístupné mobilní karty a mapový canvas se skroluje lokálně. Spacing používá kompaktní kroky od `4px` do `30px`, s větším oddělením mezi pracovními sekcemi.

**The Local-Context Rule.** Když je obsah širší než viewport, skroluje se konkrétní pracovní plocha — například mapa, strom nebo primární navigace — nikoli celý dokument.

## Elevation & Depth

Systém je primárně vrstvený tonalitou a tenkými pravidly. Jediný sdílený ambientní stín `var(--shadow)` se používá na významnějších pracovních plochách; lokální karty mohou mít měkký hover lift, který potvrzuje interakci, ne dekorativní hloubku. Dialog má vlastní silnější stín a na desktopu funguje jako pravý detailní panel.

### Shadow Vocabulary

- **Ambient workbench:** `var(--shadow)` (`0 18px 50px rgba(62, 50, 37, .09)`) pro hlavní pracovní panely, mapu, výsledkové plochy a katalogové karty.
- **Interactive lift:** měkké lokální stíny při hoveru karty nebo stromového uzlu, vždy s posunem a rozostřením.
- **Detail panel:** silnější dialogový stín pro oddělení chráněného detailu od pracovního stolu.

**The Quiet Depth Rule.** Odpočívající plochy jsou klidné a ploché; hloubka se objeví pouze tam, kde pomáhá rozlišit pracovní vrstvu nebo potvrdit interakci.

## Shapes

Formy používají jemně zaoblené rohy, tenké pravidlo a světlý povrch. Základní radius je `18px`; pracovní panely používají výraznější oblouk, karty se drží přibližně `9–14px`, formuláře a ovládací prvky `8–12px` a stavové štítky používají pill siluetu (`999px`). Kruhový pečetní mark a avatar jsou skutečné kruhy (`50%`), nikoli obecný tvar pro obsah.

Hranice mají zůstat lehké a čitelné. Význam se nesmí opírat o silný barevný pruh na boku; místo toho se používá jemné pravidlo, tonalita, text a stavový badge v kombinaci.

## Components

### Buttons

- **Shape:** malé zaoblení (`8px`) a minimální výška `42–45px` pro hlavní ovládání.
- **Primary:** vínové pozadí, světlý text, kompaktní horizontální padding a výrazná sans-serif label typografie.
- **Hover / Focus:** hover posouvá tonalitu nebo pravidlo; `:focus-visible` používá viditelný vínový outline s odsazením `3px`.
- **Secondary / Ghost:** průhledné pozadí, vínový text a tenké pravidlo; textové akce mohou zůstat bez rámečku.

### Chips

- **Style:** tónované pozadí, měkký inkoust nebo vínový text, drobný padding a pill radius (`999px`).
- **State:** evidence a filtry používají chip jako rychle skenovatelný stav; aktivní filtr je zároveň odstranitelná akce.

### Cards / Containers

- **Corner Style:** panely používají `18px`, obsahové karty přibližně `9–14px`.
- **Background:** světlý papír na papírovém pozadí, případně jemně průsvitná tónovaná plocha.
- **Shadow Strategy:** ambientní stín pouze u významných vrstev; běžné řádky stojí na pravidle a tonalitě.
- **Border:** `1px` pravidlo jako výchozí hranice, bez těžkého obvodového ornamentu.
- **Internal Padding:** hustý pracovní obsah používá přibližně `12–22px`, velké panely `30px`.

### Inputs / Fields

- **Style:** světlé pozadí, `1px` pravidlo, `8–12px` radius a výška `43–45px`; globální hledání má více levého prostoru pro ikonu.
- **Focus:** vínová změna hranice a společný viditelný focus outline.
- **Error / Disabled:** problém používá rezavý význam; disabled stav nesmí být sdělen pouze barvou.

### Navigation

- **Style:** sans-serif labels s výškou `42px`, transparentní základní plochou a vínovým aktivním podtržením.
- **Desktop:** primární oblasti a sekundární skupiny tvoří jeden pracovní pás bez horizontálního skrolu na cílových desktopových šířkách.
- **Mobile:** primární pás může skrolovat lokálně uvnitř svého kontejneru; sekundární navigace se zalamuje a skupinové labely se při úzké šířce skrývají.

### Tree Context Card

Kliknutí na osobu ve stromu má okamžitě ukázat kompaktní kontextovou kartu ve stejném pracovním prostoru. Karta kombinuje jméno, životní metadata, důkazní souhrn a akce pro nastavení středu, otevření profilu nebo zrušení výběru; na mobilu se stejný význam překládá do karet větví.

## Do's and Don'ts

### Do:

- **Do** keep the archive paper, ink typography, and restrained semantic accents as the default visual voice.
- **Do** keep evidence state, focus, and next actions legible through text, structure, and more than color alone.
- **Do** preserve local context in the workbench: filters, proof links, and the selected tree person belong beside the decision.
- **Do** keep desktop density intentional at 1440/1024 and provide a functional, locally scrolling mobile fallback.

### Don't:

- **Don't** turn the genealogy archive into a decorative family-tree poster or a gallery of disconnected cards.
- **Don't** add new brand colors, invented genealogical facts, external dependencies, or decorative historical ornament.
- **Don't** rely on a kicker/eyebrow, emoji, or color alone to carry meaning.
- **Don't** make the full document horizontally overflow when a local work surface can contain the width.
