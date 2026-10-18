// Files corrections and memories that relatives sent from the chronicle.
// Every message prepared by the feedback form ends with a short block
// "[RK-NAVRH v1 {...}]". Paste one or more e-mails into text files (or pipe
// them in) and run:
//
//   node scripts/import-suggestions.mjs zprava1.txt zprava2.eml [--out research/suggestions]
//   Get-Clipboard | node scripts/import-suggestions.mjs -
//
// For each message it keeps the original wording in research/suggestions/
// and writes one change set: a family-record source with the message and a
// claim with the status "family-record" about the person or place it
// concerns. Nothing reaches the data until the researcher reviews the change
// set and applies it with scripts/apply-changes.mjs.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const RKComponents = require('../src/components.js');
const RKChanges = require('../src/changes.js');

const KIND_LABELS = { doplneni: 'doplnění', oprava: 'oprava', vzpominka: 'vzpomínka', fotka: 'kdo je na fotografii' };
const CLAIM_SUBJECTS = new Set(['person', 'place', 'event', 'relationship', 'source']);

// Splits pasted text into messages: each one ends with its block.
export function splitMessages(text) {
  const normalized = String(text).replace(/\r\n/g, '\n');
  const parts = [];
  let rest = normalized;
  for (;;) {
    const match = rest.match(/\[RK-NAVRH v1 \{[^\]\n]*\}\]/);
    if (!match) break;
    const end = match.index + match[0].length;
    parts.push(rest.slice(0, end));
    rest = rest.slice(end);
  }
  return parts;
}

export function suggestionsToChanges(messages, data, { now = new Date() } = {}) {
  const taken = RKChanges.takenIds(data);
  const ops = [];
  const notes = [];
  messages.forEach((message, index) => {
    if (!message.text) {
      notes.push(`Zpráva ${index + 1} je prázdná – přeskočeno.`);
      return;
    }
    const date = message.date || now.toISOString().slice(0, 10);
    const from = message.name || 'příbuzný';
    const sourceId = RKChanges.slugId(`src-navrh-${date}-${from}`, { taken });
    taken.add(sourceId);
    ops.push({ op: 'add', collection: 'sources', item: {
      id: sourceId, title: `Zpráva od ${from} (${date.split('-').reverse().map(Number).join('. ')}): ${KIND_LABELS[message.kind] || message.kind}`, type: 'family-record',
      origin: `Návrh poslaný z rodové kroniky e-mailem${message.topic ? `; téma: ${message.topic}` : ''}.`, transcriptionLines: message.text.split('\n').map((line) => line.trim()).filter(Boolean),
    } });
    const [subjectType, subjectId] = String(message.subject || '').split(':');
    let claimSubject = null;
    if (CLAIM_SUBJECTS.has(subjectType) && (data[`${subjectType === 'person' ? 'people' : `${subjectType}s`}`] || []).some((item) => item.id === subjectId)) claimSubject = { subjectType, subjectId };
    if (subjectType === 'media') {
      const media = (data.media || []).find((item) => item.id === subjectId);
      if (media?.sourceId) claimSubject = { subjectType: 'source', subjectId: media.sourceId };
    }
    if (claimSubject) {
      const claimId = RKChanges.slugId(`claim-navrh-${date}-${from}`, { taken });
      taken.add(claimId);
      ops.push({ op: 'add', collection: 'claims', item: {
        id: claimId, ...claimSubject, text: message.text.replace(/\s*\n\s*/g, ' '), evidence: 'family-record',
        reasoning: `Sdělení: ${from}, ${date} (${KIND_LABELS[message.kind] || message.kind}). Před použitím posoudit a případně opravit stávající tvrzení novým tvrzením s odkazem na tento pramen.`,
        sourceIds: [sourceId],
      } });
    } else {
      notes.push(`Zpráva od ${from}: předmět „${message.subject || '—'}“ v datech není; vznikl jen pramen, tvrzení doplň ručně.`);
    }
  });
  const set = { ...RKChanges.createChangeSet({ author: 'import-suggestions', title: 'Návrhy od příbuzných', now }), ops };
  return { set, notes };
}

async function main() {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf('--out');
  const outDir = outIndex >= 0 ? args[outIndex + 1] : 'research/suggestions';
  const files = args.filter((value, index) => !value.startsWith('--') && args[index - 1] !== '--out');
  let text = '';
  if (!files.length || files.includes('-')) text += await new Promise((resolve) => { let input = ''; process.stdin.setEncoding('utf8'); process.stdin.on('data', (chunk) => { input += chunk; }); process.stdin.on('end', () => resolve(input)); });
  for (const file of files.filter((value) => value !== '-')) text += `\n${await fs.readFile(file, 'utf8')}`;
  const raw = splitMessages(text);
  const messages = raw.map((part) => RKComponents.parseFeedbackMessage(part)).filter(Boolean);
  if (!messages.length) {
    console.error('Nenalezena žádná zpráva s blokem [RK-NAVRH v1 …].');
    process.exit(1);
  }
  const data = JSON.parse(await fs.readFile('src/data/genealogy.json', 'utf8'));
  const { set, notes } = suggestionsToChanges(messages, data);
  await fs.mkdir(outDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  await fs.writeFile(path.join(outDir, `${stamp}-zpravy.json`), `${JSON.stringify({ importedAt: new Date().toISOString(), messages: messages.map((message, index) => ({ ...message, raw: raw[index] })) }, null, 2)}\n`);
  const changePath = path.join(outDir, `${stamp}-zmeny.json`);
  await fs.writeFile(changePath, `${JSON.stringify(set, null, 2)}\n`);
  console.log(`Zpráv: ${messages.length}. Dávka změn: ${changePath}`);
  for (const note of notes) console.log(`  ! ${note}`);
  console.log(`Náhled: node scripts/apply-changes.mjs ${changePath} --dry-run`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exit(1); });
}
