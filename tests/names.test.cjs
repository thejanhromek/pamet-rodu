const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const RKNames = require('../src/names.js');
const RKModel = require('../src/model.js');

const data = JSON.parse(fs.readFileSync('tests/fixtures/sample-family/data.json', 'utf8'));

test('surname spellings from German and Czech registers share one key', () => {
  for (const variant of ['Chládek', 'Hlládek']) assert.equal(RKNames.phoneticKey(variant), RKNames.phoneticKey('Hládek'));
  assert.equal(RKNames.phoneticKey('Kadletz'), RKNames.phoneticKey('Kadlec'));
  assert.equal(RKNames.phoneticKey('Schimek'), RKNames.phoneticKey('Šimek'));
  assert.notEqual(RKNames.phoneticKey('Kadlec'), RKNames.phoneticKey('Fiala'));
});

test('female surnames lead back to the masculine form', () => {
  assert.ok(RKNames.surnameStems('Hájková').includes('hajek'), 'fleeting e');
  assert.ok(RKNames.surnameStems('Vrbová').includes('vrba'));
  assert.ok(RKNames.surnameStems('Kadlecová').includes('kadlec'));
  assert.ok(RKNames.surnameStems('Dvorská').includes('dvorsky'));
  assert.deepEqual(RKNames.surnameStems('Fiala'), ['fiala']);
});

test('Latin and German given names map to the Czech name', () => {
  for (const variant of ['Joannes', 'Johann', 'Hans', 'Jan']) assert.equal(RKNames.givenNameKey(variant), 'jan');
  assert.equal(RKNames.givenNameKey('Wenzel'), 'vaclav');
  assert.equal(RKNames.givenNameKey('Maria'), RKNames.givenNameKey('Marie'));
  assert.equal(RKNames.givenNameKey('Xaverius'), RKNames.phoneticKey('Xaverius'), 'unknown names fall back to their sound');
});

test('people compare by name variants, including maiden names', () => {
  const byId = new Map(data.people.map((person) => [person.id, person]));
  assert.equal(RKNames.nameSimilarity(byId.get('jan-kadlec-1870'), byId.get('johann-kadletz-1871')), 1);
  assert.ok(RKNames.tokenMatchesPerson('Šimek', byId.get('anezka-kadlecova-simkova-1902')), 'maiden name Šimková');
  assert.ok(!RKNames.tokenMatchesPerson('Fiala', byId.get('josef-kadlec-1930')));
});

test('global search finds people under register spellings and says why', () => {
  const results = RKModel.globalSearch(data, 'Joannes Kadletz').groups.people;
  const ids = results.map((person) => person.id);
  assert.ok(ids.includes('jan-kadlec-1870'));
  const viaVariant = RKModel.globalSearch(data, 'Kadletz').groups.people.find((person) => person.id === 'josef-kadlec-1930');
  assert.ok(viaVariant, 'Kadletz sounds like Kadlec');
  assert.match(viaVariant.matchReason, /^Podobné jméno/);
  assert.equal(RKModel.globalSearch(data, 'Kadlec').groups.people.find((person) => person.id === 'josef-kadlec-1930').fuzzy, undefined, 'exact matches stay exact');
});
