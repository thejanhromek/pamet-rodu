import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { loadDataset, mergeCompanions, mergeHistory } from '../scripts/lib/load-dataset.mjs';
import { validateWithSchema, validateCompanions, loadSchema } from '../scripts/lib/validate-data.mjs';

const require = createRequire(import.meta.url);
const RKSchema = require('../src/schema-lite.js');
const FIXTURE = 'tests/fixtures/sample-family/data.json';

test('the sample dataset and its companion files match the schema', async () => {
  const { data, companions } = await loadDataset(FIXTURE);
  assert.deepEqual(await validateWithSchema(data), []);
  assert.deepEqual(await validateCompanions(companions), []);
});

test('the schema reports the exact place of a mistake', async () => {
  const { data } = await loadDataset(FIXTURE);
  const broken = structuredClone(data);
  broken.people[1].sex = 'muž';
  broken.events[0].date = '14. 3. 1990';
  broken.claims[0].sourceIds = [];
  broken.relationships[0].evidence = 'jisté';
  delete broken.places[0].name;
  const errors = await validateWithSchema(broken);
  const paths = errors.map((error) => error.path);
  for (const expected of ['people[1].sex', 'events[0].date', 'claims[0].sourceIds', 'relationships[0].evidence', 'places[0].name']) {
    assert.ok(paths.includes(expected), `${expected} in ${paths.join(', ')}`);
  }
});

test('the small validator handles references, alternatives and items', () => {
  const schema = {
    $defs: { year: { type: 'integer', minimum: 1000 } },
    type: 'object',
    properties: { years: { type: 'array', items: { $ref: '#/$defs/year' } }, note: { anyOf: [{ type: 'string' }, { type: 'null' }] } },
  };
  assert.deepEqual(RKSchema.validate(schema, { years: [1850], note: null }), []);
  assert.equal(RKSchema.validate(schema, { years: [850, 'x'], note: 1 }).length, 3);
});

test('companion files join by ID without touching the dataset', async () => {
  const { data, companions, merged } = await loadDataset(FIXTURE);
  assert.equal(merged.places.find((place) => place.id === 'litomysl').historical.historicalNames[0].name, 'Leitomischl');
  assert.equal(merged.media.find((media) => media.id === 'media-photo-1955').regions.length, 3);
  assert.equal(merged.registers.length, 3);
  assert.equal(data.places[0].historical, undefined, 'source data unchanged');
  assert.equal(mergeHistory({ events: [{ id: 'x' }] }, companions).events.length, 1 + companions.historyLocal.events.length);
  assert.deepEqual(mergeCompanions(data, {}).places, data.places);
});

test('the schema file is valid JSON with a draft 2020-12 header', async () => {
  const schema = await loadSchema();
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.ok(schema.$defs.companions.gazetteer && schema.$defs.companions.historyLocal);
});
