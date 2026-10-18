const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const RKResearchQueue = require('../src/research-queue.js');

const load = (name) => JSON.parse(fs.readFileSync(`tests/fixtures/sample-family/${name}.json`, 'utf8'));
const data = () => ({ ...load('data'), registers: load('registers').registers });
const NOW = new Date('2026-10-18');

test('gaps in the direct line become questions with years, place and register', () => {
  const items = RKResearchQueue.buildQueue(data(), { now: NOW });
  const jan = items.find((item) => item.id === 'missing-parent:jan-kadlec-1870:parents');
  assert.ok(jan, 'parents of the oldest ancestor are unknown');
  assert.equal(jan.number, 16);
  assert.equal(jan.generation, 4);
  assert.deepEqual(jan.yearRange, [1870, 1870]);
  assert.equal(jan.placeId, 'litomysl');
  assert.deepEqual(jan.registers.map((register) => register.signature), ['1001'], 'births register of the parish covering 1870');
  assert.ok(jan.hints.includes('src-foreign-tree'), 'the foreign tree is a lead');
  assert.deepEqual(jan.relatedTaskIds, ['task-jan-baptism']);
  const mother = items.find((item) => item.id === 'missing-parent:jana-kadlecova-fialova-1962:mother');
  assert.equal(mother.title, 'Kdo byla matka: Jana Kadlecová, roz. Fialová?');
  assert.ok(mother.recent, 'registers younger than a century are not public');
  assert.deepEqual(mother.registers, []);
});

test('hypothetical links ask for verification; recent links do not', () => {
  const items = RKResearchQueue.buildQueue(data(), { now: NOW });
  const weak = items.filter((item) => item.kind === 'weak-link');
  assert.ok(weak.some((item) => item.personId === 'frantisek-kadlec-1898' && item.role === 'jan-kadlec-1870' && item.evidence === 'hypothesis'));
  assert.ok(!weak.some((item) => item.personId === 'adam-kadlec-1990'), 'living memory is not a register question');
});

test('the best questions come first: close generations with a known register', () => {
  const items = RKResearchQueue.buildQueue(data(), { now: NOW });
  const scores = items.map((item) => item.score);
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
  assert.equal(items[0].registers.length > 0, true);
  const summary = RKResearchQueue.summarize(items);
  assert.equal(summary.total, items.length);
  assert.ok(summary.withRegister >= 2);
});

test('missing marriages and deaths are found from couples and old lives', () => {
  const sample = data();
  sample.events = sample.events.filter((event) => event.id !== 'ev-vaclavf-ludmila-marriage');
  delete sample.people.find((person) => person.id === 'vaclav-fiala-1905').death;
  const items = RKResearchQueue.buildQueue(sample, { now: NOW });
  const marriage = items.find((item) => item.kind === 'missing-marriage');
  assert.equal(marriage.personId, 'vaclav-fiala-1905');
  assert.equal(marriage.spouseId, 'ludmila-fialova-habrmanova-1908');
  assert.deepEqual(marriage.yearRange, [1929, 1935]);
  assert.ok(items.some((item) => item.kind === 'missing-death' && item.personId === 'vaclav-fiala-1905'));
});

test('a different chosen person gives a different queue', () => {
  const items = RKResearchQueue.buildQueue(data(), { egoId: 'karel-fiala-1935', now: NOW });
  assert.ok(items.every((item) => !String(item.personId).includes('kadlec')), 'only Karel’s ancestors');
  assert.deepEqual(RKResearchQueue.buildQueue(data(), { egoId: 'nobody' }), []);
});
