import fs from 'node:fs/promises';
import path from 'node:path';
import { createFamilyEdition } from './family-edition.mjs';
import { loadDataset, mergeHistory } from './lib/load-dataset.mjs';
import { validateWithSchema, formatSchemaErrors } from './lib/validate-data.mjs';
import { attachClipWords } from './lib/interview-words.mjs';
import { lightImage } from './lib/light-media.mjs';
import { previousEditionDiff } from './lib/edition-history.mjs';
import { simplifyGeometry } from './lib/simplify-geo.mjs';

// Editions built from the same code:
//   family    the chronicle for relatives (default)
//   research  full research data plus the "Badatelna" tools; never shared
//   light     the family edition without recordings and with smaller images
const EDITIONS = {
  family: { output: 'dist/rodova-kronika.html', label: 'Rodinné vydání' },
  research: { output: 'dist/rodova-kronika-badatel.html', label: 'Badatelské vydání' },
  light: { output: 'dist/rodova-kronika-lehka.html', label: 'Lehké vydání' },
};

// Scripts in dependency order; every module registers itself on globalThis.
const SCRIPTS = [
  'src/vendor/leaflet.js', 'src/vendor/leaflet.markercluster.js', 'src/vendor/elk.bundled.js',
  'src/model.js', 'src/names.js', 'src/presentation.js', 'src/components.js', 'src/history.js', 'src/kinship.js', 'src/story.js',
  'src/stats.js', 'src/questions.js', 'src/edition-diff.js', 'src/family-views.js', 'src/full-tree.js', 'src/tree.js', 'src/map.js', 'src/views.js',
];
const RESEARCH_SCRIPTS = [
  'src/schema-lite.js', 'src/checks.js', 'src/research-queue.js', 'src/changes.js', 'src/gedcom.js', 'src/dna.js', 'src/research-views.js',
];

const read = (file) => fs.readFile(file, 'utf8');
const exists = (file) => fs.access(file).then(() => true, () => false);
const argument = (name) => {
  const prefix = `--${name}=`;
  const inline = process.argv.find((value) => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : null;
};
const inlineJson = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

const edition = argument('edition') || 'family';
if (!EDITIONS[edition]) throw new Error(`Neznámé vydání „${edition}“. Možnosti: ${Object.keys(EDITIONS).join(', ')}.`);
const DEFAULT_DATA = 'src/data/genealogy.json';
const dataPath = argument('data') || DEFAULT_DATA;
const outputPath = argument('output') || EDITIONS[edition].output;

const { data: sourceData, companions, merged } = await loadDataset(dataPath);
const schemaErrors = await validateWithSchema(sourceData);
if (schemaErrors.length) throw new Error(`Data neodpovídají schématu (schema/kronika.schema.json):\n${formatSchemaErrors(schemaErrors)}`);

const isFamilyFacing = edition !== 'research';
const data = isFamilyFacing && dataPath === DEFAULT_DATA ? createFamilyEdition(merged) : merged;
if (isFamilyFacing) delete data.registers;
if (edition === 'research') {
  const dnaPath = argument('dna') || (dataPath === DEFAULT_DATA ? 'research/dna.json' : path.join(path.dirname(dataPath), 'dna.json'));
  if (await exists(dnaPath)) data.dna = JSON.parse(await read(dnaPath));
  // Reviewed exceptions for the data health panel.
  const acceptedPath = dataPath === DEFAULT_DATA ? 'research/accepted-findings.json' : path.join(path.dirname(dataPath), 'accepted-findings.json');
  if (await exists(acceptedPath)) data.acceptedFindings = JSON.parse(await read(acceptedPath)).accepted || [];
}
if (isFamilyFacing && dataPath === DEFAULT_DATA) {
  const changes = await previousEditionDiff(sourceData, { dataPath });
  if (changes) data.editionChanges = changes;
}

const template = await read('src/template.html');
const css = await read('src/styles.css');
// The light edition carries a simplified outline and no full-tree layout engine.
const worldOutline = JSON.parse(await read('src/data/world-outline.json'));
const worldGeometry = edition === 'light' ? simplifyGeometry(worldOutline, { tolerance: 0.05 }) : worldOutline;
const givenNames = JSON.parse(await read('src/data/given-names.json'));
// General history context, shared by every dataset; local events apply only
// to people connected with their places.
const history = mergeHistory(JSON.parse(await read(argument('history') || 'src/data/history.json')), companions);
const leafletCss = await read('src/vendor/leaflet.css');
const markerClusterCss = await read('src/vendor/MarkerCluster.css');
const thirdPartyLicenses = await Promise.all(['src/vendor/leaflet-LICENSE.txt', 'src/vendor/markercluster-LICENSE.txt', 'src/vendor/elk-LICENSE.txt'].map(read));
const scriptFiles = [...SCRIPTS.filter((file) => edition !== 'light' || !file.endsWith('elk.bundled.js')), ...(edition === 'research' ? RESEARCH_SCRIPTS : []), 'src/app.js'];
const scripts = await Promise.all(scriptFiles.map(read));
let schema = null;
if (edition === 'research') schema = JSON.parse(await read('schema/kronika.schema.json'));

// Image previews live in assets/optimized; interview clips and other media
// name their path below assets/ (e.g. interviews/<id>/clips/x.webm). A dataset
// may also carry ready data URIs (test fixtures).
const mediaTypes = { webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webm: 'audio/webm', m4a: 'audio/mp4', mp3: 'audio/mpeg', ogg: 'audio/ogg' };
await attachClipWords(data.media || [], { interviewsDirectory: 'assets/interviews' });
for (const media of data.media || []) {
  if (edition === 'light' && media.kind === 'audio-clip') {
    delete media.dataUri;
    delete media.file;
    media.omitted = 'light-edition';
    continue;
  }
  if (!media.file) continue;
  let file = media.file.includes('/') ? `assets/${media.file}` : `assets/optimized/${media.file}`;
  if (edition === 'light' && /\.(?:webp|jpe?g|png)$/i.test(file)) file = await lightImage(file);
  const content = await fs.readFile(file);
  if (!content.length) throw new Error(`Empty media file: ${media.file}`);
  const type = mediaTypes[path.extname(file).slice(1).toLowerCase()];
  if (!type) throw new Error(`Unsupported media type: ${media.file}`);
  media.dataUri = `data:${type};base64,${content.toString('base64')}`;
  delete media.file;
}

const inlineData = [
  `window.RK_EDITION=${inlineJson(edition)};`,
  `window.RK_WORLD_OUTLINE=${inlineJson(worldGeometry)};`,
  `window.RK_HISTORY=${inlineJson(history)};`,
  `window.RK_GIVEN_NAMES=${inlineJson(givenNames)};`,
  schema ? `window.RK_SCHEMA=${inlineJson(schema)};` : '',
  `window.RK_DATA=${inlineJson(data)};`,
].join('');

const html = template
  .replaceAll('__ARTIFACT_VERSION__', EDITIONS[edition].label)
  .replace('/*__INLINE_CSS__*/', () => `${leafletCss}\n${markerClusterCss}\n${css}`)
  .replace('/*__INLINE_DATA__*/', () => inlineData)
  .replace('/*__INLINE_JS__*/', () => scripts.join('\n'))
  .replace('<!doctype html>', () => `<!doctype html>\n<!-- Vendored library licenses:\n${thirdPartyLicenses.join('\n')}\n-->`);

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, html);
