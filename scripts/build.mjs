import fs from 'node:fs/promises';
import path from 'node:path';
import { createFamilyEdition } from './family-edition.mjs';

const read = (file) => fs.readFile(file, 'utf8');
const argument = (name) => {
  const prefix = `--${name}=`;
  const inline = process.argv.find((value) => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : null;
};
const template = await read('src/template.html');
const css = await read('src/styles.css');
const dataPath = argument('data') || 'src/data/genealogy.json';
const outputPath = argument('output') || 'dist/rodova-kronika.html';
const sourceData = JSON.parse(await read(dataPath));
const data = dataPath === 'src/data/genealogy.json' ? createFamilyEdition(sourceData) : sourceData;
const worldGeometry = JSON.parse(await read('src/data/world-outline.json'));
// General history context, shared by every dataset; it holds no personal data.
const history = JSON.parse(await read(argument('history') || 'src/data/history.json'));
const leafletCss = await read('src/vendor/leaflet.css');
const markerClusterCss = await read('src/vendor/MarkerCluster.css');
const thirdPartyLicenses = await Promise.all(['src/vendor/leaflet-LICENSE.txt', 'src/vendor/markercluster-LICENSE.txt', 'src/vendor/elk-LICENSE.txt'].map(read));
const scripts = await Promise.all([
  'src/vendor/leaflet.js', 'src/vendor/leaflet.markercluster.js', 'src/vendor/elk.bundled.js',
  'src/model.js', 'src/presentation.js', 'src/components.js', 'src/history.js', 'src/full-tree.js', 'src/tree.js', 'src/map.js', 'src/views.js', 'src/app.js',
].map(read));

// Image previews live in assets/optimized; interview clips and other media
// name their path below assets/ (e.g. interviews/<id>/clips/x.webm).
const mediaTypes = { webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webm: 'audio/webm', m4a: 'audio/mp4', mp3: 'audio/mpeg', ogg: 'audio/ogg' };
for (const media of data.media) {
  const file = media.file.includes('/') ? `assets/${media.file}` : `assets/optimized/${media.file}`;
  const content = await fs.readFile(file);
  if (!content.length) throw new Error(`Empty media file: ${media.file}`);
  const type = mediaTypes[path.extname(file).slice(1).toLowerCase()];
  if (!type) throw new Error(`Unsupported media type: ${media.file}`);
  media.dataUri = `data:${type};base64,${content.toString('base64')}`;
  delete media.file;
}

const html = template
  .replaceAll('__ARTIFACT_VERSION__', 'Rodinné vydání')
  .replace('/*__INLINE_CSS__*/', () => `${leafletCss}\n${markerClusterCss}\n${css}`)
  .replace('/*__INLINE_DATA__*/', () => `window.RK_WORLD_OUTLINE=${JSON.stringify(worldGeometry).replace(/</g, '\\u003c')};window.RK_HISTORY=${JSON.stringify(history).replace(/</g, '\\u003c')};window.RK_DATA=${JSON.stringify(data).replace(/</g, '\\u003c')};`)
  .replace('/*__INLINE_JS__*/', () => scripts.join('\n'))
  .replace('<!doctype html>', () => `<!doctype html>\n<!-- Vendored library licenses:\n${thirdPartyLicenses.join('\n')}\n-->`);

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, html);
