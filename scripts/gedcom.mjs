// GEDCOM 7.0 export of the chronicle and import of a foreign GEDCOM file as
// candidates for review.
//
//   node scripts/gedcom.mjs export [--data src/data/genealogy.json] [--output dist/rodova-kronika.ged] [--living private]
//   node scripts/gedcom.mjs import soubor.ged [--data src/data/genealogy.json] [--output research/imports/<jméno>.candidates.json]
//
// The import never writes to the dataset. It stores the candidates with the
// matches against existing people and, next to them, a batch of changes
// (<jméno>.changes.json, format rk-changes/1) for later review.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RKGedcom = require('../src/gedcom.js');

function parseArgs(argv) {
  const options = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const [key, inline] = arg.slice(2).split('=');
      options[key] = inline ?? argv[++i];
    } else {
      options._.push(arg);
    }
  }
  return options;
}

// Paths given on the command line are relative to the current directory, defaults to the project.
const resolve = (value, fallback) => (value ? path.resolve(process.cwd(), value) : path.resolve(projectRoot, fallback));

async function readJson(file) {
  return JSON.parse((await fs.readFile(file, 'utf8')).replace(/^﻿/, ''));
}

async function writeFile(file, content) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content, 'utf8');
}

async function runExport(options) {
  const dataFile = resolve(options.data, 'src/data/genealogy.json');
  const output = resolve(options.output, 'dist/rodova-kronika.ged');
  const living = options.living || 'include';
  if (!['include', 'private'].includes(living)) throw new Error('--living musí být include nebo private.');
  const data = await readJson(dataFile);
  const { text } = RKGedcom.toGedcom(data, { living, now: options.now ? new Date(options.now) : new Date() });
  const tree = RKGedcom.parseGedcom(text);
  if (tree.errors.length) throw new Error(`Vygenerovaný GEDCOM má neplatné řádky: ${tree.errors.slice(0, 3).map((error) => error.line).join(', ')}`);
  await writeFile(output, text);
  const count = (tag) => tree.records.filter((record) => record.tag === tag).length;
  console.log(`GEDCOM 7.0 → ${path.relative(projectRoot, output)} (${count('INDI')} osob, ${count('FAM')} rodin, ${count('SOUR')} pramenů, ${count('OBJE')} médií, žijící: ${living}).`);
}

async function runImport(options) {
  const input = options._[1];
  if (!input) throw new Error('Zadej soubor: node scripts/gedcom.mjs import soubor.ged');
  const file = path.resolve(process.cwd(), input);
  const fileName = path.basename(file);
  const base = fileName.replace(/\.ged(?:com)?$/i, '');
  const output = resolve(options.output, `research/imports/${base}.candidates.json`);
  const changesFile = output.replace(/(?:\.candidates)?\.json$/i, '') + '.changes.json';
  const data = await readJson(resolve(options.data, 'src/data/genealogy.json'));
  const tree = RKGedcom.parseGedcom(await fs.readFile(file, 'utf8'));
  const candidates = RKGedcom.gedcomToCandidates(tree, { fileName });
  // Register spellings and Latin/German given names match the Czech forms.
  const RKNames = require('../src/names.js');
  const nameKey = (value, part) => (part === 'given' ? RKNames.givenNameKey(value) : RKNames.phoneticKey(RKNames.surnameStems(value).at(-1) || ''));
  const matches = RKGedcom.matchCandidates(candidates, data, { nameKey });
  const createdAt = new Date().toISOString();
  const ops = [];
  for (const [collection, items] of Object.entries(candidates)) {
    for (const item of items) ops.push({ op: 'add', file: 'genealogy', collection, id: item.id, item });
  }
  await writeFile(output, `${JSON.stringify({
    format: 'rk-gedcom-candidates/1', createdAt, file: fileName, gedcomVersion: tree.version,
    parseErrors: tree.errors, candidates, matches,
  }, null, 2)}\n`);
  await writeFile(changesFile, `${JSON.stringify({ format: 'rk-changes/1', createdAt, author: 'gedcom-import', ops }, null, 2)}\n`);
  console.log(`${candidates.people.length} osob, ${candidates.relationships.length} vazeb, ${candidates.events.length} událostí; ${matches.length} možných shod.`);
  console.log(`Kandidáti: ${path.relative(projectRoot, output)}`);
  console.log(`Dávka změn: ${path.relative(projectRoot, changesFile)} (genealogy.json se nemění)`);
  if (tree.errors.length) console.warn(`Přeskočeno ${tree.errors.length} neplatných řádků.`);
}

const options = parseArgs(process.argv.slice(2));
const command = options._[0];
try {
  if (command === 'export') await runExport(options);
  else if (command === 'import') await runImport(options);
  else throw new Error('Použití: node scripts/gedcom.mjs export|import …');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
