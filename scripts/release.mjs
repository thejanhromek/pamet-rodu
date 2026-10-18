// Archival edition ("vydání"): a dated, self-describing copy of the chronicle
// for the long term, and the reference point for "Co je nového" in the next
// family edition.
//
//   node scripts/release.mjs [--dry-run] [--no-pdf] [--no-tag]
//
// It writes releases/<version>/ (not committed):
//   rodova-kronika.html      the family edition, opens offline in a browser
//   kniha.html, kniha.pdf    the printed book (PDF/A-2b when Ghostscript is
//                            found through RK_GHOSTSCRIPT or on PATH)
//   rodova-kronika.ged       GEDCOM 7 with living people kept private
//                            (when scripts/gedcom.mjs is present)
//   data/                    the dataset and its companion files
//   CTI-ME.txt               what the files are and how to open them
//   MANIFEST.sha256          SHA-256 of every file, to check them later
// and a local annotated git tag vydani-<version> (never pushed).
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { COMPANION_FILES } from './lib/load-dataset.mjs';
import { TAG_PREFIX } from './lib/edition-history.mjs';

const run = promisify(execFile);
const exists = (file) => fs.access(file).then(() => true, () => false);

async function findGhostscript() {
  const candidates = [process.env.RK_GHOSTSCRIPT, 'gswin64c', 'gswin32c', 'gs'].filter(Boolean);
  for (const candidate of candidates) {
    try {
      await run(candidate, ['--version']);
      return candidate;
    } catch (_) { /* try next */ }
  }
  return null;
}

async function sha256(file) {
  return crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
}

async function listFiles(directory, base = directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(full, base));
    else files.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return files.sort();
}

export function readme({ version, date, pdfA, gedcom }) {
  return [
    `Rodová kronika – vydání ${version} (${date})`,
    '',
    'Co je v této složce:',
    '  rodova-kronika.html  Celá kronika v jednom souboru. Otevřete ji v libovolném prohlížeči',
    '                       (dvojklikem); nepotřebuje internet ani instalaci.',
    `  kniha.pdf            Tištěná kniha${pdfA ? ' ve formátu PDF/A-2b pro dlouhodobé uchování' : ' (běžné PDF; převod na PDF/A nebyl k dispozici)'}.`,
    '  kniha.html           Táž kniha jako webová stránka.',
    gedcom ? '  rodova-kronika.ged   Rodokmen ve formátu GEDCOM 7, který čtou genealogické programy;\n                       žijící osoby jsou v něm skryté.' : null,
    '  data/                Zdrojová data kroniky (JSON, UTF-8) a doplňkové soubory.',
    '  MANIFEST.sha256      Kontrolní součty: příkazem „sha256sum -c MANIFEST.sha256“ (Linux, macOS)',
    '                       nebo „Get-FileHash“ (Windows) lze ověřit, že se soubory nepoškodily.',
    '',
    'Formáty jsou otevřené (HTML, PDF, JSON, GEDCOM) a čitelné i bez původních programů.',
    'Soubor rodova-kronika.html obsahuje osobní údaje; nezveřejňujte ho.',
    '',
  ].filter((line) => line !== null).join('\n');
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const withPdf = !process.argv.includes('--no-pdf');
  const withTag = !process.argv.includes('--no-tag');
  const data = JSON.parse(await fs.readFile('src/data/genealogy.json', 'utf8'));
  const version = data.meta?.version;
  if (!version) throw new Error('Data nemají meta.version.');
  const date = new Date().toISOString().slice(0, 10);
  const tag = `${TAG_PREFIX}${version}`;
  const target = path.join('releases', version);
  const { stdout: tags } = await run('git', ['tag', '--list', tag]).catch(() => ({ stdout: '' }));
  if (withTag && tags.trim()) throw new Error(`Tag ${tag} už existuje. Zvyš verzi v meta.version, nebo použij --no-tag.`);
  const ghostscript = withPdf ? await findGhostscript() : null;
  const gedcom = await exists('scripts/gedcom.mjs');
  const plan = [
    `Vydání ${version} (${date}) do ${target}/`,
    '  • rodinné vydání (rodova-kronika.html)',
    withPdf ? `  • kniha HTML a PDF${ghostscript ? ' → PDF/A-2b' : ' (bez PDF/A: Ghostscript nenalezen)'}` : '  • kniha HTML (bez PDF)',
    gedcom ? '  • GEDCOM 7 (žijící skryti)' : '  • GEDCOM vynechán (scripts/gedcom.mjs chybí)',
    '  • data/, CTI-ME.txt, MANIFEST.sha256',
    withTag ? `  • git tag ${tag} (lokálně, bez pushe)` : '  • bez git tagu',
  ];
  console.log(plan.join('\n'));
  if (dryRun) {
    console.log('Náhled: nic nebylo vytvořeno (--dry-run).');
    return;
  }
  await fs.mkdir(path.join(target, 'data'), { recursive: true });
  await run(process.execPath, ['scripts/build.mjs', '--output', path.join(target, 'rodova-kronika.html')], { maxBuffer: 64 * 1024 * 1024 });
  await run(process.execPath, ['scripts/build-book.mjs', '--output', path.join(target, 'kniha.html'), ...(withPdf ? ['--pdf'] : [])], { maxBuffer: 64 * 1024 * 1024 });
  let pdfA = false;
  if (withPdf && ghostscript) {
    const pdf = path.join(target, 'kniha.pdf');
    const archival = path.join(target, 'kniha-pdfa.pdf');
    await run(ghostscript, ['-dPDFA=2', '-dBATCH', '-dNOPAUSE', '-dNOOUTERSAVE', '-sColorConversionStrategy=RGB', '-sDEVICE=pdfwrite', '-dPDFACompatibilityPolicy=1', `-sOutputFile=${archival}`, pdf]);
    await fs.rename(archival, pdf);
    pdfA = true;
  }
  if (gedcom) await run(process.execPath, ['scripts/gedcom.mjs', 'export', '--living', 'private', '--output', path.join(target, 'rodova-kronika.ged')], { maxBuffer: 64 * 1024 * 1024 });
  await fs.copyFile('src/data/genealogy.json', path.join(target, 'data', 'genealogy.json'));
  for (const name of Object.values(COMPANION_FILES)) if (await exists(path.join('src/data', name))) await fs.copyFile(path.join('src/data', name), path.join(target, 'data', name));
  await fs.writeFile(path.join(target, 'CTI-ME.txt'), `${readme({ version, date, pdfA, gedcom })}\n`);
  const files = (await listFiles(target)).filter((file) => file !== 'MANIFEST.sha256');
  const manifest = await Promise.all(files.map(async (file) => `${await sha256(path.join(target, file))}  ${file}`));
  await fs.writeFile(path.join(target, 'MANIFEST.sha256'), `${manifest.join('\n')}\n`);
  if (withTag) await run('git', ['tag', '-a', tag, '-m', `Vydání ${version} (${date})`]);
  console.log(`Hotovo: ${target}/ (${files.length + 1} souborů)${withTag ? `, tag ${tag}` : ''}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exit(1); });
}
