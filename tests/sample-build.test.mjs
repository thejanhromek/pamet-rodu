// Build, family edition, printed book, audiobook and password protection on
// the sample dataset. Temporary files go to the system temp folder.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createFamilyEdition, loadEditionOverrides } from '../scripts/family-edition.mjs';
import { buildBook } from '../scripts/build-book.mjs';
import { bookToChapters } from '../scripts/build-audiobook.mjs';
import { encryptHtml, wrapperHtml } from '../scripts/protect.mjs';

const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = async (file) => JSON.parse(await fs.readFile(path.join(root, file), 'utf8'));
// The sample in examples/ukazka always stays; src/data holds the chronicle in use.
const sample = await read('examples/ukazka/genealogy.json');
const current = await read('src/data/genealogy.json');

async function withTempDir(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rodova-kronika-test-'));
  try { return await fn(dir); } finally { await fs.rm(dir, { recursive: true, force: true }); }
}

async function buildTo(dir, extra = []) {
  const output = path.join(dir, 'kronika.html');
  await run(process.execPath, ['scripts/build.mjs', '--output', output, ...extra], { cwd: root, maxBuffer: 50 * 1024 * 1024 });
  return fs.readFile(output, 'utf8');
}

test('build creates one self-contained HTML file that works from file://', () => withTempDir(async (dir) => {
  const html = await buildTo(dir);
  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /<main[^>]+id="view-root"/);
  assert.match(html, /window\.RK_DATA=/);
  assert.match(html, /window\.RK_HISTORY=/);
  assert.match(html, /window\.RK_WORLD_OUTLINE=/);
  assert.match(html, /BSD 2-Clause License/, 'vendored library licenses are embedded');
  assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+rel="stylesheet"|url\(["']?https?:/i, 'no network assets');
  assert.doesNotMatch(html, /__INLINE_(?:CSS|DATA|JS)__/);
  assert.equal((html.match(/data:image\/webp;base64,/g) || []).length, current.media.filter((media) => /\.webp$/.test(media.file)).length);
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);
  const sandbox = { window: {} };
  vm.runInNewContext(scripts[0], sandbox);
  assert.equal(sandbox.window.RK_DATA.meta.defaultPersonId, current.meta.defaultPersonId);
  assert.doesNotThrow(() => new vm.Script(scripts.at(-1)), 'embedded application JavaScript parses');
}));

test('build keeps replacement tokens of an arbitrary dataset literally', () => withTempDir(async (dir) => {
  const name = "Literal $& $' $` $$";
  const dataPath = path.join(dir, 'data.json');
  await fs.writeFile(dataPath, JSON.stringify({
    meta: { version: '1.0.0', defaultPersonId: 'literal' },
    people: [{ id: 'literal', displayName: name, sex: 'unknown', lineage: 'self' }],
    relationships: [], events: [], places: [], claims: [], sources: [], media: [], researchTasks: [], changelog: [],
  }));
  const html = await buildTo(dir, ['--data', dataPath]);
  const sandbox = { window: {} };
  vm.runInNewContext([...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)][0][1], sandbox);
  assert.equal(sandbox.window.RK_DATA.people[0].displayName, name);
}));

test('family edition hides research workflow and keeps evidence', () => {
  const family = createFamilyEdition(current);
  assert.deepEqual(family.researchTasks, []);
  assert.deepEqual(family.changelog, []);
  assert.ok(family.claims.every((claim) => !Object.hasOwn(claim, 'reasoning')));
  assert.equal(family.people.length, current.people.length);
  const sources = new Set(family.sources.map((entry) => entry.id));
  for (const claim of family.claims) assert.ok(claim.sourceIds.every((id) => sources.has(id)), claim.id);
});

test('family edition applies the optional overrides file', () => {
  const overrides = loadEditionOverrides(path.join(root, 'examples/ukazka/family-edition.json'));
  const family = createFamilyEdition(sample, overrides);
  assert.ok(!family.claims.some((claim) => claim.id === 'claim-pracovni-poznamka-strom'), 'omitted claim');
  assert.match(family.claims.find((claim) => claim.id === 'claim-jan-birth-1863-census').text, /o rok později než matrika/);
  assert.match(family.people.find((person) => person.id === 'kalina-matej-1830').familyNotes[0], /zatím nevíme jistě/);
  const withoutOverrides = createFamilyEdition(sample, {});
  assert.ok(withoutOverrides.claims.some((claim) => claim.id === 'claim-pracovni-poznamka-strom'));
  const researcher = createFamilyEdition({ ...sample, people: [{ id: 'x', displayName: 'X', notes: ['Rodinný příběh podle vyprávění uživatele.'] }] }, overrides);
  assert.match(researcher.people[0].familyNotes[0], /Terezy Kalinové/);
});

test('printed book and audiobook describe the ancestors of the default person', () => {
  const html = buildBook(createFamilyEdition(sample, loadEditionOverrides(path.join(root, 'examples/ukazka/family-edition.json'))), { issued: new Date(2026, 9, 18) });
  assert.match(html, /@page \{ size: A4/);
  assert.match(html, /Vývodová tabulka 1/);
  assert.match(html, /Rejstřík jmen/);
  assert.match(html, /Tereza Kalinová/);
  assert.match(html, /Lipová Lhota/);
  const chapters = bookToChapters(html);
  assert.equal(chapters[0].title, 'Úvod');
  assert.equal(chapters.at(-1).title, 'Místa');
  for (const chapter of chapters) assert.doesNotMatch(chapter.text, /<[a-z/]|&amp;/, chapter.title);
});

test('password protection round-trips and hides the content', async () => {
  const html = '<!doctype html><title>Rodová kronika</title><p>Tajný obsah kroniky</p>';
  const payload = await encryptHtml(html, 'testovaci-heslo', { iterations: 1000 });
  const wrapper = wrapperHtml(payload);
  assert.doesNotMatch(wrapper, /Tajný obsah/);
  assert.match(wrapper, /type="password"/);
  const bytes = (b64) => Uint8Array.from(Buffer.from(b64, 'base64'));
  const baseKey = await webcrypto.subtle.importKey('raw', new TextEncoder().encode('testovaci-heslo'), 'PBKDF2', false, ['deriveKey']);
  const key = await webcrypto.subtle.deriveKey({ name: 'PBKDF2', salt: bytes(payload.salt), iterations: payload.iterations, hash: 'SHA-256' }, baseKey, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const plain = new TextDecoder().decode(await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(payload.iv) }, key, bytes(payload.data)));
  assert.equal(plain, html);
  await assert.rejects(encryptHtml(html, '123'), /alespoň 6 znaků/);
});
