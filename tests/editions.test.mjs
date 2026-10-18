import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const FIXTURE = 'tests/fixtures/sample-family/data.json';

async function buildFixture(edition) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), `rk-edition-${edition}-`));
  const output = path.join(directory, 'kronika.html');
  await run(process.execPath, ['scripts/build.mjs', '--data', FIXTURE, '--edition', edition, '--output', output], { maxBuffer: 20 * 1024 * 1024 });
  const html = await fs.readFile(output, 'utf8');
  await fs.rm(directory, { recursive: true, force: true });
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);
  const sandbox = { window: {} };
  vm.runInNewContext(scripts[0], sandbox);
  return { html, globals: sandbox.window };
}

test('the family edition carries no research tools', async () => {
  const { html, globals } = await buildFixture('family');
  assert.equal(globals.RK_EDITION, 'family');
  assert.ok(!html.includes('root.RKChecks'), 'checks only in the research edition');
  assert.ok(!html.includes('window.RK_SCHEMA'));
  assert.equal(globals.RK_DATA.registers, undefined, 'register catalogue is research data');
  assert.ok(html.includes('root.RKNames'));
  assert.ok(globals.RK_GIVEN_NAMES.groups.length > 50);
  assert.equal(globals.RK_DATA.places.find((place) => place.id === 'litomysl').historical.historicalNames[0].name, 'Leitomischl');
  assert.equal(globals.RK_DATA.media.find((media) => media.id === 'media-photo-1955').regions.length, 3);
  assert.ok(globals.RK_HISTORY.events.some((event) => event.id === 'local-1845-pozar'), 'local history is merged');
});

test('the research edition adds the tools, the schema and the full data', async () => {
  const { html, globals } = await buildFixture('research');
  assert.equal(globals.RK_EDITION, 'research');
  for (const name of ['RKChecks', 'RKResearchQueue', 'RKChanges', 'RKSchema', 'RKResearchViews']) assert.ok(html.includes(`root.${name}`), name);
  assert.ok(html.indexOf('root.RKResearchViews') < html.indexOf('root.RKApp'), 'research views load before the app');
  assert.equal(globals.RK_SCHEMA.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(globals.RK_DATA.registers.length, 3);
  assert.equal(globals.RK_DATA.researchTasks.length, 1);
});

test('the light edition leaves out recordings but keeps their words', async () => {
  const { html, globals } = await buildFixture('light');
  assert.ok(!html.includes('ELKNode'), 'no full-tree layout engine');
  assert.ok(globals.RK_WORLD_OUTLINE.simplified, 'simplified world outline');
  const clip = globals.RK_DATA.media.find((media) => media.kind === 'audio-clip');
  assert.equal(clip.dataUri, undefined);
  assert.equal(clip.omitted, 'light-edition');
  assert.ok(clip.quote && clip.words.length);
});

test('an unknown edition name stops the build', async () => {
  await assert.rejects(run(process.execPath, ['scripts/build.mjs', '--data', FIXTURE, '--edition', 'tajne', '--output', path.join(os.tmpdir(), 'x.html')]), /Neznámé vydání/);
});
