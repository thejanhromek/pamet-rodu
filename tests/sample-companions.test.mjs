// Companion files of the sample (gazetteer, local history, register catalogue,
// photo regions) join the dataset and feed the research edition.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { loadDataset } from '../scripts/lib/load-dataset.mjs';

const require = createRequire(import.meta.url);
const RKQueue = require('../src/research-queue.js');
const RKChecks = require('../src/checks.js');
const { merged: sample } = await loadDataset('examples/ukazka/genealogy.json');

test('sample companions join places, media and registers by ID', () => {
  const place = sample.places.find((entry) => entry.id === 'lipova-lhota');
  assert.ok(place.historical.historicalNames.some((name) => name.lang === 'de'));
  const photo = sample.media.find((media) => media.id === 'media-statek');
  assert.equal(photo.dateText, 'léto 1955');
  const people = new Set(sample.people.map((person) => person.id));
  for (const region of photo.regions) {
    assert.ok(region.x >= 0 && region.y >= 0 && region.x + region.w <= 1 && region.y + region.h <= 1, region.id);
    if (region.personId) assert.ok(people.has(region.personId), region.id);
  }
  assert.ok(photo.regions.some((region) => !region.personId && region.kind === 'face'), 'an unknown face waits for a name');
  const placeIds = new Set(sample.places.map((entry) => entry.id));
  for (const register of sample.registers) assert.ok(register.placeIds.every((id) => placeIds.has(id)), register.id);
});

test('research queue on the sample points to known registers and data checks pass', () => {
  const queue = RKQueue.buildQueue(sample, { registers: sample.registers });
  assert.ok(queue.length > 0);
  assert.ok(queue.some((item) => item.registers.length > 0), 'some open questions already have a register to search');
  assert.equal(RKChecks.summarize(RKChecks.runChecks(sample)).error, 0);
});
