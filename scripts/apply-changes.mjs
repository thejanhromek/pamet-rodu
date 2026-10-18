// Applies a change set ("dávka změn", format rk-changes/1) downloaded from the
// research edition (editor, register transcription, photo regions) or made by
// scripts/import-suggestions.mjs or scripts/gedcom.mjs import.
//
//   node scripts/apply-changes.mjs zmeny.json [--dry-run] [--data src/data/genealogy.json] [--title "…"]
//
// It prints every change, validates the result (references, schema, and the
// plausibility checks: a new error-level finding stops it) and only then
// writes the files. The main dataset gets a patch version bump and a
// changelog entry. Nothing is written with --dry-run.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readCompanions, COMPANION_FILES } from './lib/load-dataset.mjs';
import { validateWithSchema, validateCompanions, formatSchemaErrors } from './lib/validate-data.mjs';

const require = createRequire(import.meta.url);
const RKChanges = require('../src/changes.js');
const RKModel = require('../src/model.js');
const RKChecks = require('../src/checks.js');

const FILE_KEYS = { 'media-notes': 'mediaNotes', gazetteer: 'gazetteer', registers: 'registers', 'history-local': 'historyLocal' };

const argument = (name, fallback = null) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
};

// Keeps the file's line endings and two-space indentation.
async function writeJson(file, value) {
  let eol = '\n';
  try {
    if ((await fs.readFile(file, 'utf8')).includes('\r\n')) eol = '\r\n';
  } catch (_) { /* new file */ }
  await fs.writeFile(file, `${JSON.stringify(value, null, 2).replace(/\n/g, eol)}${eol}`);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export async function applyChangeFile(changePath, { dataPath = 'src/data/genealogy.json', dryRun = false, title = null, log = console.log } = {}) {
  const set = JSON.parse(await fs.readFile(changePath, 'utf8'));
  const directory = path.dirname(dataPath);
  const data = JSON.parse(await fs.readFile(dataPath, 'utf8'));
  const companions = await readCompanions(directory);
  const targets = { genealogy: data };
  for (const [file, key] of Object.entries(FILE_KEYS)) if (companions[key]) targets[file] = companions[key];

  log(`Dávka: ${set.title || path.basename(changePath)}${set.author ? ` (${set.author})` : ''}, ${set.ops?.length || 0} změn`);
  for (const op of set.ops || []) log(`  • ${RKChanges.describeOp(op)}`);

  const result = RKChanges.applyChangeSet(targets, set);
  if (result.errors.length) throw new Error(`Dávku nelze použít:\n  ${result.errors.join('\n  ')}`);

  const next = result.targets;
  const referenceErrors = RKModel.validateDataset(next.genealogy);
  const schemaErrors = await validateWithSchema(next.genealogy);
  const companionErrors = await validateCompanions(Object.fromEntries(Object.entries(FILE_KEYS).map(([file, key]) => [key, next[file]])));
  const problems = [
    ...referenceErrors.map((error) => `  ${error.code} ${error.id}${error.sourceId ? ` → ${error.sourceId}` : ''}${error.personId ? ` → ${error.personId}` : ''}`),
  ];
  if (problems.length || schemaErrors.length || companionErrors.length) {
    throw new Error(`Po změnách by data nebyla v pořádku:\n${problems.join('\n')}\n${formatSchemaErrors([...schemaErrors, ...companionErrors])}`.trim());
  }
  const before = new Set(RKChecks.runChecks(data).filter((finding) => finding.severity === 'error').map((finding) => finding.key));
  const newErrors = RKChecks.runChecks(next.genealogy).filter((finding) => finding.severity === 'error' && !before.has(finding.key));
  if (newErrors.length) throw new Error(`Změny by zavedly nevěrohodné údaje:\n  ${newErrors.map((finding) => finding.message).join('\n  ')}`);

  if (result.touched.includes('genealogy')) {
    const meta = next.genealogy.meta;
    meta.version = RKChanges.nextPatchVersion(meta.version);
    meta.updatedAt = today();
    next.genealogy.changelog ||= [];
    const taken = new Set(next.genealogy.changelog.map((entry) => entry.id));
    next.genealogy.changelog.unshift({
      id: RKChanges.slugId(`change-${today()}-${title || set.title || 'davka-zmen'}`, { taken }),
      date: today(),
      title: title || set.title || 'Dávka změn',
      categories: [...new Set(set.ops.filter((op) => (op.file || 'genealogy') === 'genealogy').map((op) => op.collection))],
      items: set.ops.map((op) => RKChanges.describeOp(op)),
    });
  }

  if (dryRun) {
    log('Náhled: nic nebylo zapsáno (--dry-run).');
    return { written: [], next };
  }
  const written = [];
  for (const file of result.touched) {
    const target = file === 'genealogy' ? dataPath : path.join(directory, COMPANION_FILES[FILE_KEYS[file]]);
    await writeJson(target, next[file]);
    written.push(target);
  }
  log(`Zapsáno: ${written.join(', ')}${result.touched.includes('genealogy') ? ` (verze ${next.genealogy.meta.version})` : ''}`);
  log('Dál: node scripts/build.mjs a testy.');
  return { written, next };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const changePath = process.argv.slice(2).find((value, index, all) => !value.startsWith('--') && !['--data', '--title'].includes(all[index - 1]));
  if (!changePath) {
    console.error('Použití: node scripts/apply-changes.mjs zmeny.json [--dry-run] [--data src/data/genealogy.json] [--title "…"]');
    process.exit(1);
  }
  try {
    await applyChangeFile(changePath, { dataPath: argument('data', 'src/data/genealogy.json'), dryRun: process.argv.includes('--dry-run'), title: argument('title') });
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
