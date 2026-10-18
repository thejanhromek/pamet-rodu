// A printed questionnaire for a relative who does not use a computer: what
// the chronicle does not know about them, their parents and grandparents,
// with room to write the answers.
//
//   node scripts/questionnaire.mjs --person <id> [--pdf] [--output dist/dotaznik-<id>.html]
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createFamilyEdition } from './family-edition.mjs';
import { loadDataset } from './lib/load-dataset.mjs';
import { printPdf } from './build-book.mjs';

const require = createRequire(import.meta.url);
const RKQuestions = require('../src/questions.js');

const escapeHtml = (value = '') => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

export function buildQuestionnaire(data, personId, { now = new Date() } = {}) {
  const person = (data.people || []).find((item) => item.id === personId);
  if (!person) throw new Error(`Osoba ${personId} neexistuje.`);
  const questions = RKQuestions.questionsFor(data, personId, { now, limit: 30 });
  const keeper = data.meta?.feedback?.email ? ` nebo pošlete na ${escapeHtml(data.meta.feedback.email)}` : '';
  return `<!doctype html>
<html lang="cs"><head><meta charset="utf-8"><title>Dotazník – ${escapeHtml(person.displayName)}</title>
<style>
  @page { size: A4; margin: 18mm 18mm 20mm; }
  body { font: 13pt/1.5 Georgia, 'Times New Roman', serif; color: #1d2722; }
  h1 { font-size: 22pt; margin: 0 0 4mm; }
  .intro { font-size: 12pt; color: #444; margin-bottom: 8mm; }
  ol { padding-left: 7mm; }
  li { margin-bottom: 7mm; break-inside: avoid; }
  .lines { margin-top: 2mm; }
  .lines span { display: block; height: 9mm; border-bottom: 1px solid #999; }
  footer { margin-top: 10mm; font-size: 10pt; color: #666; }
</style></head>
<body>
  <h1>Pro: ${escapeHtml(person.displayName)}</h1>
  <p class="intro">Píšeme rodovou kroniku a na některé věci zatím neznáme odpověď. Napište prosím, co víte – stačí i útržek vzpomínky nebo „nevím“. Vyplněný dotazník předejte správci kroniky${keeper}. Děkujeme.</p>
  ${questions.length ? `<ol>${questions.map((question) => `<li>${escapeHtml(question.text)}<div class="lines"><span></span><span></span><span></span></div></li>`).join('')}</ol>` : '<p>Kronika teď nemá žádné otevřené otázky.</p>'}
  <p>Něco dalšího, co by v kronice nemělo chybět?</p><div class="lines"><span></span><span></span><span></span><span></span></div>
  <footer>Vytištěno ${now.getDate()}. ${now.getMonth() + 1}. ${now.getFullYear()} z rodové kroniky.</footer>
</body></html>
`;
}

async function main() {
  const argument = (name, fallback) => {
    const index = process.argv.indexOf(`--${name}`);
    return index >= 0 ? process.argv[index + 1] : fallback;
  };
  const personId = argument('person');
  if (!personId) {
    console.error('Použití: node scripts/questionnaire.mjs --person <id> [--pdf] [--output soubor.html]');
    process.exit(1);
  }
  const { merged } = await loadDataset(argument('data', 'src/data/genealogy.json'));
  const data = createFamilyEdition(merged);
  const output = argument('output', `dist/dotaznik-${personId}.html`);
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, buildQuestionnaire(data, personId));
  console.log(`Dotazník: ${output}`);
  if (process.argv.includes('--pdf')) {
    const pdf = output.replace(/\.html$/, '.pdf');
    await printPdf(output, pdf);
    console.log(`PDF: ${pdf}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exit(1); });
}
