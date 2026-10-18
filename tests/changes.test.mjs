import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { applyChangeFile } from '../scripts/apply-changes.mjs';

const require = createRequire(import.meta.url);
const RKChanges = require('../src/changes.js');
const FIXTURE_DIR = 'tests/fixtures/sample-family';

async function copyFixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'rk-changes-'));
  for (const file of await fs.readdir(FIXTURE_DIR)) await fs.copyFile(path.join(FIXTURE_DIR, file), path.join(directory, file));
  return directory;
}

const sampleSet = () => ({
  ...RKChanges.createChangeSet({ author: 'test', title: 'Nová prababička', now: new Date('2026-10-18T10:00:00Z') }),
  ops: [
    { op: 'add', collection: 'people', item: { id: 'vrbova-anna-1905', displayName: 'Anna Vrbová', sex: 'female', birth: { date: '1905' } } },
    { op: 'add', collection: 'relationships', item: { id: 'rel-anna-marie', type: 'parent-child', from: 'vrbova-anna-1905', to: 'marie-kadlecova-vrbova-1932', evidence: 'family-record' } },
    { op: 'update', collection: 'people', id: 'marie-kadlecova-vrbova-1932', set: { birth: { placeId: 'policka' } } },
    { op: 'update', file: 'media-notes', collection: 'media', id: 'media-photo-1955', set: { dateEvidence: 'supported' } },
  ],
});

test('a change set is validated before anything is applied', () => {
  assert.deepEqual(RKChanges.validateChangeSet(sampleSet()), []);
  const errors = RKChanges.validateChangeSet({ format: 'rk-changes/1', ops: [{ op: 'move', collection: 'people', id: 'x' }, { op: 'add', file: 'gazetteer', collection: 'people', item: { id: 'y' } }] });
  assert.equal(errors.length, 2);
  assert.match(errors.join(' '), /neznámá operace move/);
});

test('applying returns new copies and merges nested fields', () => {
  const data = { people: [{ id: 'a', displayName: 'A', birth: { date: '1900', dateText: '1900' } }] };
  const { targets, errors } = RKChanges.applyChangeSet({ genealogy: data }, { format: 'rk-changes/1', ops: [{ op: 'update', collection: 'people', id: 'a', set: { birth: { placeId: 'p' }, displayName: 'B' } }] });
  assert.deepEqual(errors, []);
  assert.deepEqual(targets.genealogy.people[0].birth, { date: '1900', dateText: '1900', placeId: 'p' });
  assert.equal(data.people[0].displayName, 'A', 'input unchanged');
  const duplicate = RKChanges.applyChangeSet({ genealogy: data }, { format: 'rk-changes/1', ops: [{ op: 'add', collection: 'people', item: { id: 'a', displayName: 'X' } }] });
  assert.match(duplicate.errors[0], /už v kolekci people existuje/);
});

test('apply-changes writes data and companions with a version bump and a changelog entry', async () => {
  const directory = await copyFixture();
  try {
    const changePath = path.join(directory, 'zmeny.json');
    await fs.writeFile(changePath, JSON.stringify(sampleSet()));
    const log = [];
    const preview = await applyChangeFile(changePath, { dataPath: path.join(directory, 'data.json'), dryRun: true, log: (line) => log.push(line) });
    assert.deepEqual(preview.written, []);
    assert.match(log.join('\n'), /Přidána osoba „Anna Vrbová“/);
    const before = await fs.readFile(path.join(directory, 'data.json'), 'utf8');
    assert.ok(!before.includes('vrbova-anna-1905'), 'dry run wrote nothing');

    await applyChangeFile(changePath, { dataPath: path.join(directory, 'data.json'), log: () => {} });
    const data = JSON.parse(await fs.readFile(path.join(directory, 'data.json'), 'utf8'));
    assert.equal(data.meta.version, '1.2.1');
    assert.equal(data.changelog[0].title, 'Nová prababička');
    assert.ok(data.people.some((person) => person.id === 'vrbova-anna-1905'));
    assert.equal(data.people.find((person) => person.id === 'marie-kadlecova-vrbova-1932').birth.placeId, 'policka');
    const notes = JSON.parse(await fs.readFile(path.join(directory, 'media-notes.json'), 'utf8'));
    assert.equal(notes.media['media-photo-1955'].dateEvidence, 'supported');
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('apply-changes refuses broken references and implausible data', async () => {
  const directory = await copyFixture();
  try {
    const changePath = path.join(directory, 'zmeny.json');
    const dataPath = path.join(directory, 'data.json');
    await fs.writeFile(changePath, JSON.stringify({ format: 'rk-changes/1', ops: [{ op: 'add', collection: 'relationships', item: { id: 'rel-x', type: 'parent-child', from: 'nikdo', to: 'adam-kadlec-1990' } }] }));
    await assert.rejects(applyChangeFile(changePath, { dataPath, log: () => {} }), /RELATIONSHIP_PERSON_MISSING/);
    await fs.writeFile(changePath, JSON.stringify({ format: 'rk-changes/1', ops: [{ op: 'update', collection: 'people', id: 'petr-kadlec-1960', set: { birth: { date: '1925-06-02' } } }] }));
    await assert.rejects(applyChangeFile(changePath, { dataPath, log: () => {} }), /nevěrohodné/);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('IDs are readable and never collide', () => {
  assert.equal(RKChanges.slugId('Jan Kadlec', { suffix: '1870' }), 'jan-kadlec-1870');
  assert.equal(RKChanges.slugId('Jan Kadlec', { suffix: '1870', taken: new Set(['jan-kadlec-1870']) }), 'jan-kadlec-1870-2');
  assert.equal(RKChanges.nextPatchVersion('1.44.9'), '1.44.10');
});
