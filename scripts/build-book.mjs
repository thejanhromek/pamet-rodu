// Builds a printable family book ("kniha k tisku") for readers who do not use
// a computer: numbered pedigree charts, one chapter per generation with life
// data and family memories, places, sources and a name index. The output is
// a print-ready HTML file; with --pdf it is also printed to PDF through a
// locally installed Edge or Chrome (headless, no network).
//
//   node scripts/build-book.mjs [--ego person-id] [--output dist/rodova-kronika-kniha.html] [--pdf]
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createFamilyEdition } from './family-edition.mjs';

const require = createRequire(import.meta.url);
const RKModel = require('../src/model.js');
const RKPresentation = require('../src/presentation.js');
const RKStory = require('../src/story.js');

const CERTAINTY = {
  verified: 'doloženo původním záznamem',
  supported: 'podpořeno prameny',
  'family-record': 'podle rodinného vyprávění',
  hypothesis: 'nejisté – zatím jen možnost',
};

// Claims about archive search steps read as noise in a book for relatives.
const RESEARCH_DETAIL = /\b(?:scan|scany|sign\.|detail knihy|kontrola|kontrol[ay]|index)\b/i;

const escapeHtml = (value = '') => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

function generationOf(number) {
  return Math.floor(Math.log2(number)) + 1;
}

function generationTitle(generation) {
  return ({ 1: 'Výchozí osoba', 2: 'Rodiče', 3: 'Prarodiče', 4: 'Praprarodiče' })[generation] || `${generation}. generace předků`;
}

// Ahnentafel (Kekule) numbering, shared with the on-screen pedigree.
export function ahnentafel(data, egoId) {
  return RKModel.getAhnentafel(data, egoId);
}

function years(person) {
  const birth = RKPresentation.birthYear(person);
  const deathMatch = String(person?.death?.date || person?.death?.dateText || '').match(/(?<!\d)(\d{4})(?!\d)/);
  const death = deathMatch ? deathMatch[1] : null;
  if (!birth && !death) return '';
  return `${birth ? `* ${birth}` : ''}${birth && death ? ' – ' : ''}${death ? `† ${death}` : ''}`;
}

export function buildBook(source, { egoId, issued = new Date(), history = null } = {}) {
  const data = source.claims?.some((claim) => 'reasoning' in claim) ? createFamilyEdition(source) : source;
  const ego = RKModel.getPerson(data, egoId || data.meta.defaultPersonId);
  if (!ego) throw new Error(`Osoba ${egoId} neexistuje.`);
  const people = new Map(data.people.map((person) => [person.id, person]));
  const places = new Map(data.places.map((place) => [place.id, place]));
  const sourcesById = new Map(data.sources.map((entry) => [entry.id, entry]));
  const { numberOf, idOf } = ahnentafel(data, ego.id);
  const numbers = [...idOf.keys()].sort((a, b) => a - b);
  const sourceNumbers = new Map();
  const cite = (ids = []) => ids.filter((id) => sourcesById.has(id)).map((id) => {
    if (!sourceNumbers.has(id)) sourceNumbers.set(id, sourceNumbers.size + 1);
    return sourceNumbers.get(id);
  });
  const mentions = new Map();
  const mention = (personId, entryNumber) => mentions.set(personId, new Set([...(mentions.get(personId) || []), entryNumber]));
  const relationLabel = (person) => person.id === ego.id ? '' : RKPresentation.relationshipLabel(RKModel.getRelationship(data, ego.id, person.id), person.sex);
  const placeName = (event) => (event?.placeId && places.get(event.placeId)?.name) || event?.placeText || '';
  const nameWithNumber = (person, entryNumber) => {
    mention(person.id, entryNumber);
    const number = numberOf.get(person.id);
    return `${escapeHtml(person.displayName)}${years(person) ? ` <span class="years">(${escapeHtml(years(person))})</span>` : ''}${number ? ` <span class="ref">→ č. ${number}</span>` : ''}`;
  };

  const placePeople = new Map();
  const notePlace = (placeId, number) => {
    if (!placeId || !places.has(placeId)) return;
    placePeople.set(placeId, new Set([...(placePeople.get(placeId) || []), number]));
  };

  // From the life story only what the entry does not already list: the
  // history the person lived through and their own words from an interview.
  function bookStory(person) {
    const paragraphs = RKStory.lifeStory(data, person.id, { history, now: issued })
      .filter((paragraph) => paragraph.kind === 'history' || (paragraph.kind === 'memories' && !(person.familyNotes || []).length && paragraph.text.includes('V rozhovoru zaznělo')));
    const text = paragraphs.map((paragraph) => paragraph.text.replace(/ Otevřená otázka:.*$/, '')).filter(Boolean);
    return text.length ? `<div class="story story-context">${text.map((line) => `<p>${escapeHtml(line)}</p>`).join('')}</div>` : '';
  }

  function renderEntry(number) {
    const person = people.get(idOf.get(number));
    const family = RKModel.getFamily(data, person.id);
    const relation = relationLabel(person);
    notePlace(person.birth?.placeId, number);
    notePlace(person.death?.placeId, number);
    const facts = [
      person.birth?.dateText || placeName(person.birth) ? ['Narození', [person.birth?.dateText, placeName(person.birth)].filter(Boolean).join(', ')] : null,
      person.death?.dateText || placeName(person.death) ? ['Úmrtí', [person.death?.dateText, placeName(person.death)].filter(Boolean).join(', ')] : null,
      person.occupations?.length ? ['Povolání', person.occupations.join('; ')] : null,
      person.residences?.length ? ['Bydliště', person.residences.join('; ')] : null,
    ].filter(Boolean);
    const partners = [...family.partners, ...(family.coParents || [])];
    const relatives = [
      partners.length ? ['Manžel / manželka', partners] : null,
      family.children.length ? ['Děti', family.children] : null,
      family.siblings.length ? ['Sourozenci', family.siblings] : null,
    ].filter(Boolean);
    const relationshipIds = new Set((data.relationships || []).filter((link) => link.from === person.id || link.to === person.id).map((link) => link.id));
    const claims = data.claims.filter((claim) => ((claim.subjectType === 'person' && claim.subjectId === person.id) || (claim.subjectType === 'relationship' && relationshipIds.has(claim.subjectId)))
      && !RESEARCH_DETAIL.test(claim.text));
    const citations = cite([...(person.sourceIds || []), ...claims.flatMap((claim) => claim.sourceIds || [])]);
    const father = people.get(idOf.get(number * 2));
    const mother = people.get(idOf.get(number * 2 + 1));
    return `<article class="entry" id="osoba-${number}">
      <h3><span class="number">${number}</span> ${escapeHtml(person.displayName)}</h3>
      ${relation ? `<p class="relation">${escapeHtml(relation)}</p>` : ''}
      ${facts.length ? `<dl class="facts">${facts.map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>` : '<p class="muted">Životní data zatím nejsou známa.</p>'}
      ${father || mother ? `<p class="parents"><strong>Rodiče:</strong> ${[father, mother].filter(Boolean).map((parent) => nameWithNumber(parent, number)).join(' a ')}</p>` : ''}
      ${relatives.map(([label, list]) => `<p class="relatives"><strong>${label}:</strong> ${list.map((relative) => nameWithNumber(relative, number)).join(', ')}</p>`).join('')}
      ${(person.familyNotes || []).length ? `<div class="story">${person.familyNotes.map((note) => `<p>${escapeHtml(note)}</p>`).join('')}</div>` : ''}
      ${bookStory(person)}
      ${claims.length ? `<div class="claims"><h4>Co víme a jak jisté to je</h4><ul>${claims.map((claim) => `<li>${escapeHtml(claim.text)} <span class="certainty">– ${CERTAINTY[claim.evidence] || 'jistota neuvedena'}</span></li>`).join('')}</ul></div>` : ''}
      ${citations.length ? `<p class="citations">Prameny: ${[...new Set(citations)].sort((a, b) => a - b).map((n) => `[${n}]`).join(' ')}</p>` : ''}
    </article>`;
  }

  // Four-generation charts: the first starts at the person, further charts
  // continue from every fourth-generation ancestor whose parents are known.
  const chartRoots = [1];
  for (let index = 0; index < chartRoots.length; index += 1) {
    const root = chartRoots[index];
    for (let slot = root * 8; slot < root * 8 + 8; slot += 1) {
      if (idOf.has(slot) && (idOf.has(slot * 2) || idOf.has(slot * 2 + 1))) chartRoots.push(slot);
    }
  }
  const chartOf = new Map(chartRoots.map((root, index) => [root, index + 1]));

  function chartBox(number, column, row, span, lastColumn) {
    const person = people.get(idOf.get(number));
    const continues = column === lastColumn && chartOf.has(number) ? ` <span class="continues">→ tab. ${chartOf.get(number)}</span>` : '';
    const style = `grid-column:${column + 1};grid-row:${row + 1} / span ${span}`;
    if (!person) return `<div class="chart-box is-empty" style="${style}"><span class="chart-number">${number}</span><span class="muted">neznámý</span></div>`;
    const birthPlace = placeName(person.birth);
    return `<div class="chart-box${column >= 3 ? ' is-compact' : ''}" style="${style}"><span class="chart-number">${number}</span><strong>${escapeHtml(person.displayName)}</strong><span>${escapeHtml(years(person) || 'data neznámá')}${continues}</span>${birthPlace ? `<span>${escapeHtml(birthPlace)}</span>` : ''}</div>`;
  }

  // A chart shows only as many generations as are known in it, and an
  // "unknown" box only where the child of that slot is known.
  function renderChart(root, index) {
    let depth = 0;
    for (let column = 1; column < 4; column += 1) {
      const count = 2 ** column;
      for (let offset = 0; offset < count; offset += 1) if (idOf.has(root * count + offset)) depth = column;
    }
    const rows = 2 ** depth;
    const boxes = [];
    for (let column = 0; column <= depth; column += 1) {
      const count = 2 ** column;
      const span = rows / count;
      for (let offset = 0; offset < count; offset += 1) {
        const number = root * count + offset;
        if (column > 0 && !idOf.has(Math.floor(number / 2))) continue;
        boxes.push(chartBox(number, column, offset * span, span, depth));
      }
    }
    const rootPerson = people.get(idOf.get(root));
    // Small charts (one or two generations) share a page instead of taking a whole sheet.
    return `<section class="chart-page${depth <= 1 && index > 1 ? ' chart-small' : ''}"><header><h2>Vývodová tabulka ${index}</h2><p>${escapeHtml(rootPerson.displayName)} a ${rootPerson.sex === 'female' ? 'její' : 'jeho'} předci${root === 1 ? '' : ` (pokračování od čísla ${root})`}. Otec je vždy nahoře, matka pod ním.</p></header><div class="chart-grid" style="grid-template-columns:${[0.8, 0.95, 1.05, 1.35].slice(0, depth + 1).map((size) => `${size}fr`).join(' ')};grid-template-rows:repeat(${rows}, 1fr);height:${Math.min(166, 30 + rows * 18)}mm">${boxes.join('')}</div></section>`;
  }

  const generations = new Map();
  for (const number of numbers) generations.set(generationOf(number), [...(generations.get(generationOf(number)) || []), number]);
  const chapters = [...generations].map(([generation, list]) => `<section class="chapter"><h2>${generationTitle(generation)}</h2>${generation > 1 ? `<p class="chapter-lead">${list.length} ${list.length === 1 ? 'osoba' : list.length < 5 ? 'osoby' : 'osob'} v této generaci. Čísla odpovídají vývodovým tabulkám.</p>` : ''}${list.map(renderEntry).join('')}</section>`).join('');

  const placeList = [...placePeople].sort((a, b) => places.get(a[0]).name.localeCompare(places.get(b[0]).name, 'cs'))
    .map(([placeId, set]) => `<li><strong>${escapeHtml(places.get(placeId).name)}</strong>${places.get(placeId).region ? `, ${escapeHtml(places.get(placeId).region)}` : ''} – č. ${[...set].sort((a, b) => a - b).join(', ')}</li>`).join('');
  const sourceList = [...sourceNumbers].sort((a, b) => a[1] - b[1]).map(([id, number]) => {
    const entry = sourcesById.get(id);
    return `<li value="${number}">${escapeHtml(entry.title)}<span class="muted"> · ${escapeHtml(RKPresentation.sourceTypeLabel(entry.type))}${entry.publisher ? `, ${escapeHtml(entry.publisher)}` : ''}</span></li>`;
  }).join('');
  for (const number of numbers) mention(idOf.get(number), number);
  const index = [...mentions].map(([personId, set]) => ({ person: people.get(personId), set })).filter(({ person }) => person)
    .sort((a, b) => a.person.displayName.localeCompare(b.person.displayName, 'cs'))
    .map(({ person, set }) => `<li><span>${escapeHtml(person.displayName)}${years(person) ? ` <span class="years">(${escapeHtml(years(person))})</span>` : ''}</span><span>${numberOf.has(person.id) ? `<strong>${numberOf.get(person.id)}</strong>` : `viz ${[...set].sort((a, b) => a - b).join(', ')}`}</span></li>`).join('');
  const photos = (data.media || []).filter((item) => item.dataUri && item.kind !== 'audio-clip');
  const allYears = numbers.map((number) => RKPresentation.birthYear(people.get(idOf.get(number)))).filter(Boolean);
  const oldest = allYears.length ? Math.min(...allYears) : null;
  const issuedText = `${issued.getDate()}. ${issued.getMonth() + 1}. ${issued.getFullYear()}`;

  return `<!doctype html>
<html lang="cs">
<head>
<meta charset="utf-8">
<title>${escapeHtml(data.meta.title || 'Rodová kronika')} – kniha předků: ${escapeHtml(ego.displayName)}</title>
<style>
@page { size: A4; margin: 20mm 20mm 22mm; @bottom-center { content: counter(page); font: 10pt Georgia, serif; color: #444; } }
@page cover { @bottom-center { content: none; } }
@page chart { size: A4 landscape; margin: 12mm 14mm 14mm; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; color: #111; background: #fff; font: 12.5pt/1.5 Georgia, 'Times New Roman', serif; }
@media screen { body { max-width: 190mm; margin: 0 auto; padding: 12mm 0; } .chart-page { position: relative; left: 50%; width: 270mm; margin: 12mm 0; transform: translateX(-50%); } }
h1, h2, h3, h4 { font-weight: 400; line-height: 1.2; break-after: avoid; }
.muted { color: #555; }
.cover { page: cover; display: flex; flex-direction: column; justify-content: center; min-height: 240mm; text-align: center; }
.cover h1 { margin: 0; font-size: 40pt; }
.cover .subtitle { margin: 10mm 0 0; font-size: 18pt; }
.cover .meta { margin-top: 30mm; color: #444; font-size: 12pt; }
.howto { break-before: page; }
.howto h2, .chapter > h2, .back h2 { margin: 0 0 6mm; font-size: 24pt; border-bottom: 1px solid #999; padding-bottom: 3mm; }
.howto dl { margin: 0; }
.howto dt { font-weight: 700; margin-top: 3mm; }
.howto dd { margin: 0 0 0 6mm; }
.chart-page { page: chart; break-before: page; break-inside: avoid; }
.chart-page.chart-small { break-before: auto; margin-top: 8mm; }
.chart-page header h2 { margin: 0; font-size: 18pt; }
.chart-page header p { margin: 1mm 0 4mm; font-size: 10.5pt; color: #333; }
.chart-grid { display: grid; gap: 1.6mm 6mm; }
.chart-box { position: relative; display: flex; flex-direction: column; justify-content: center; padding: 1.5mm 2.5mm 1.5mm 9mm; border: 0.4mm solid #333; border-radius: 2mm; font-size: 9.5pt; line-height: 1.25; overflow: hidden; }
.chart-box strong { font-size: 10.5pt; }
.chart-box.is-empty { border-style: dashed; border-color: #999; }
.chart-number { position: absolute; top: 1.5mm; left: 2mm; font: 700 8.5pt/1 system-ui, sans-serif; color: #444; }
.chart-grid .chart-box:nth-child(1) { justify-content: center; font-size: 11pt; }
.chart-grid .chart-box:nth-child(1) strong { font-size: 14pt; }
.continues { font-style: italic; font-size: 8.5pt; color: #333; white-space: nowrap; }
.chart-box.is-compact { padding: 0.8mm 2mm 0.8mm 8mm; font-size: 8.5pt; line-height: 1.15; }
.chart-box.is-compact strong { font-size: 9.5pt; }
.chart-box.is-compact .chart-number { top: 1mm; }
.chapter { break-before: page; }
.chapter-lead { margin: -2mm 0 6mm; color: #444; }
.entry { margin: 0 0 9mm; padding-bottom: 6mm; border-bottom: 0.3mm solid #ccc; }
.entry h3 { margin: 0; font-size: 17pt; }
.entry .number { display: inline-block; min-width: 10mm; margin-right: 2mm; padding: 0.5mm 2mm; border: 0.4mm solid #111; border-radius: 1.5mm; font: 700 11pt/1.3 system-ui, sans-serif; text-align: center; vertical-align: 2pt; }
.entry .relation { margin: 1mm 0 3mm; font-style: italic; color: #333; }
.facts { display: grid; grid-template-columns: 28mm 1fr; gap: 0.5mm 4mm; margin: 0 0 3mm; }
.facts div { display: contents; }
.facts dt { color: #444; }
.facts dd { margin: 0; }
.parents, .relatives { margin: 1.5mm 0; }
.years { color: #444; }
.ref { color: #444; font-size: 10.5pt; white-space: nowrap; }
.story { margin: 4mm 0; padding: 3mm 5mm; border-left: 1mm solid #888; background: #f4f4f4; }
.story p { margin: 0 0 2mm; }
.story p:last-child { margin: 0; }
.claims h4 { margin: 4mm 0 1.5mm; font-size: 12.5pt; font-weight: 700; }
.claims ul { margin: 0; padding-left: 6mm; }
.claims li { margin-bottom: 1.5mm; }
.certainty { font-style: italic; color: #333; }
.citations { margin: 3mm 0 0; font-size: 10.5pt; color: #444; }
.back { break-before: page; }
.places-list, .sources-list { padding-left: 8mm; }
.places-list li, .sources-list li { margin-bottom: 1.5mm; }
.sources-list { font-size: 10.5pt; }
.name-index { columns: 2; column-gap: 10mm; padding: 0; list-style: none; font-size: 11pt; }
.name-index li { display: flex; justify-content: space-between; align-items: baseline; gap: 3mm; padding: 0.6mm 0; border-bottom: 0.2mm solid #e2e2e2; break-inside: avoid; }
.name-index li > span:last-child { flex: none; white-space: nowrap; }
.photos figure { margin: 0 0 8mm; break-inside: avoid; text-align: center; }
.photos img { max-width: 100%; max-height: 105mm; border: 0.3mm solid #999; }
.photos figcaption { margin-top: 2mm; font-size: 11pt; }
</style>
</head>
<body>
<section class="cover">
  <h1>${escapeHtml(data.meta.title || 'Rodová kronika')}</h1>
  <p class="subtitle">Předkové osoby<br><strong>${escapeHtml(ego.displayName)}</strong>${years(ego) ? ` (${escapeHtml(years(ego))})` : ''}</p>
  <p class="meta">${numbers.length - 1} předků v ${generations.size - 1} generacích${oldest ? `, nejstarší zápis z roku ${oldest}` : ''}<br>Vydáno ${issuedText}</p>
</section>
<section class="howto">
  <h2>Jak tuto knihu číst</h2>
  <p>Kniha popisuje předky osoby <strong>${escapeHtml(ego.displayName)}</strong>. Každý předek má své <strong>číslo</strong>. Výchozí osoba má číslo 1. Otec kterékoli osoby má číslo dvojnásobné, matka o jedno vyšší: otec čísla 1 je 2, matka 3; rodiče čísla 2 jsou 4 a 5 a tak dále. Podle čísla najdete osobu ve vývodových tabulkách i v kapitolách.</p>
  <p>Vztah pod jménem (například „prababička“) je vždy uveden z pohledu osoby ${escapeHtml(ego.displayName)}.</p>
  <p>U toho, co o lidech víme, je napsáno, jak jisté to je:</p>
  <dl>
    <dt>doloženo původním záznamem</dt><dd>potvrzuje to matrika nebo jiný původní dokument,</dd>
    <dt>podpořeno prameny</dt><dd>souhlasí s tím více zdrojů, ale původní zápis zatím nebyl přečten,</dd>
    <dt>podle rodinného vyprávění</dt><dd>vychází to ze vzpomínek a rodinných zápisků,</dd>
    <dt>nejisté – zatím jen možnost</dt><dd>je to pravděpodobné, ale ještě to není ověřeno.</dd>
  </dl>
  <p>Čísla v hranatých závorkách, například [12], odkazují na seznam pramenů na konci knihy. Na úplném konci je abecední rejstřík jmen.</p>
</section>
${chartRoots.map((root, index) => renderChart(root, index + 1)).join('')}
${chapters}
${placeList ? `<section class="back"><h2>Místa</h2><p>Obce, kde se předkové narodili nebo zemřeli, s čísly osob.</p><ul class="places-list">${placeList}</ul></section>` : ''}
${photos.length ? `<section class="back photos"><h2>Obrazová příloha</h2>${photos.map((item) => `<figure><img src="${item.dataUri}" alt="${escapeHtml(item.title)}"><figcaption>${escapeHtml(item.title)}</figcaption></figure>`).join('')}</section>` : ''}
${sourceList ? `<section class="back"><h2>Prameny</h2><ol class="sources-list">${sourceList}</ol></section>` : ''}
<section class="back"><h2>Rejstřík jmen</h2><p>Tučné číslo je číslo předka; „viz“ odkazuje na osobu, u které je dotyčný zmíněn.</p><ul class="name-index">${index}</ul></section>
</body>
</html>
`;
}

function browserPath() {
  const candidates = [
    process.env.RK_BROWSER,
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean);
  return candidates.find((candidate) => { try { return require('node:fs').existsSync(candidate); } catch (_) { return false; } });
}

export async function printPdf(htmlPath, pdfPath) {
  const browser = browserPath();
  if (!browser) throw new Error('Pro PDF je potřeba Edge nebo Chrome (cestu lze zadat v RK_BROWSER).');
  await promisify(execFile)(browser, ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', `--print-to-pdf=${path.resolve(pdfPath)}`, pathToFileURL(path.resolve(htmlPath)).href], { timeout: 180000 });
}

async function main() {
  const argument = (name, fallback) => {
    const index = process.argv.indexOf(`--${name}`);
    return index >= 0 ? process.argv[index + 1] : fallback;
  };
  const source = JSON.parse(await fs.readFile(argument('data', 'src/data/genealogy.json'), 'utf8'));
  const data = createFamilyEdition(source);
  // Print uses the source JPEGs: the PDF keeps them compressed and sharper,
  // while WebP previews would be stored losslessly and bloat the file.
  for (const media of (data.media || []).filter((item) => item.kind !== 'audio-clip')) {
    const jpeg = `assets/source/${String(media.file).replace(/\.webp$/i, '.jpg')}`;
    for (const [file, type] of [[jpeg, 'image/jpeg'], [`assets/optimized/${media.file}`, 'image/webp']]) {
      try {
        media.dataUri = `data:${type};base64,${(await fs.readFile(file)).toString('base64')}`;
        break;
      } catch (_) { /* Try the next variant; a missing image only leaves it out of the appendix. */ }
    }
  }
  const egoId = argument('ego', data.meta.defaultPersonId);
  const output = argument('output', egoId === data.meta.defaultPersonId ? 'dist/rodova-kronika-kniha.html' : `dist/rodova-kronika-kniha-${egoId}.html`);
  await fs.mkdir(path.dirname(output), { recursive: true });
  const history = JSON.parse(await fs.readFile('src/data/history.json', 'utf8'));
  await fs.writeFile(output, buildBook(data, { egoId, history }));
  console.log(`Kniha: ${output}`);
  if (process.argv.includes('--pdf')) {
    const pdf = output.replace(/\.html$/, '.pdf');
    await printPdf(output, pdf);
    console.log(`PDF: ${pdf}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exit(1); });
}
