// Checks the sample dataset (an invented family) and the application modules
// that work on it: model, tree, views, map and history context.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const RKModel = require('../src/model.js');
const RKTree = require('../src/tree.js');
const RKViews = require('../src/views.js');
const RKMap = require('../src/map.js');
const RKHistory = require('../src/history.js');
const RKFullTree = require('../src/full-tree.js');
const ELK = require('../src/vendor/elk.bundled.js');

const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
// The sample in examples/ukazka always stays; src/data holds the chronicle in
// use (a copy of the sample until `node scripts/init.mjs` starts your own).
const sample = read('examples/ukazka/genealogy.json');
const current = read('src/data/genealogy.json');
const history = read('src/data/history.json');
const datasets = [['ukázka', sample], ['src/data', current]];

test('datasets pass the structural validation', () => {
  for (const [name, data] of datasets) assert.deepEqual(RKModel.validateDataset(data), [], name);
});

test('every claim has a known evidence state and at least one existing source', () => {
  for (const [, data] of datasets) checkClaims(data);
});

function checkClaims(data) {
  const sources = new Set(data.sources.map((entry) => entry.id));
  for (const claim of data.claims) {
    assert.ok(['verified', 'supported', 'family-record', 'hypothesis'].includes(claim.evidence), claim.id);
    assert.ok(claim.sourceIds.length > 0 && claim.sourceIds.every((id) => sources.has(id)), claim.id);
  }
}

test('places on the map have valid coordinates and media files exist', () => {
  for (const [, data] of datasets) checkPlacesAndMedia(data);
});

function checkPlacesAndMedia(data) {
  for (const place of data.places.filter((entry) => entry.lat !== undefined)) {
    assert.ok(Math.abs(place.lat) <= 90 && Math.abs(place.lon) <= 180, place.id);
  }
  for (const media of data.media) {
    const file = media.file.includes('/') ? `assets/${media.file}` : `assets/optimized/${media.file}`;
    assert.ok(fs.statSync(file).size > 0, file);
  }
}

test('sample shows every evidence state, a hypothesis, a conflict and an unknown parent', () => {
  const states = new Set(sample.claims.map((claim) => claim.evidence));
  assert.deepEqual([...states].sort(), ['family-record', 'hypothesis', 'supported', 'verified']);
  assert.ok(sample.relationships.some((link) => link.evidence === 'hypothesis'));
  const janBirth = sample.claims.filter((claim) => claim.subjectId === 'kalina-jan-1862' && /naroz|narod/.test(claim.text));
  assert.ok(janBirth.length >= 2, 'conflicting birth years stay side by side');
  const parentsOfMarie = sample.relationships.filter((link) => link.type === 'parent-child' && link.to === 'kalinova-marie-1934');
  assert.equal(parentsOfMarie.length, 1, 'Marie has only a known father');
  assert.ok(sample.sources.some((entry) => entry.type === 'foreign-family-tree' && /ověření/.test(entry.reliabilityNote)));
  assert.equal(sample.media.length, 1);
});

test('ahnentafel numbers follow the book convention across five generations', () => {
  const { idOf } = RKModel.getAhnentafel(sample, sample.meta.defaultPersonId);
  assert.equal(idOf.get(1), 'kalinova-tereza-1992');
  assert.equal(idOf.get(2), 'kalina-petr-1961');
  assert.equal(idOf.get(3), 'kalinova-jana-1964');
  assert.equal(idOf.get(4), 'kalina-josef-1931');
  assert.equal(idOf.get(5), 'kalinova-marie-1934');
  assert.equal(idOf.get(8), 'kalina-vaclav-1898');
  assert.equal(idOf.get(10), 'brabec-frantisek-1905');
  assert.equal(idOf.get(11), undefined, 'unknown mother of Marie is not invented');
  assert.equal(idOf.get(16), 'kalina-jan-1862');
  assert.equal(idOf.get(32), 'kalina-matej-1830');
});

test('family, search and direct line work on the sample', () => {
  const family = RKModel.getFamily(sample, 'kalina-josef-1931', { extended: true });
  assert.deepEqual(family.parents.map((person) => person.id).sort(), ['kalina-vaclav-1898', 'kalinova-ludmila-1902']);
  assert.ok(family.siblings.some((person) => person.id === 'kalina-antonin-1934'));
  assert.ok(RKModel.searchDataset(sample, 'kovar', {}).people.some((person) => person.id === 'kalina-vaclav-1898'), 'accent-insensitive search');
  assert.equal(new Set(RKModel.getDirectLine(sample, sample.meta.defaultPersonId).map((person) => person.id)).size, 13);
});

test('pedigree shows names, numbers, link certainty and the unknown mother slot', () => {
  const html = RKTree.renderFamilyTree(sample, sample.meta.defaultPersonId, 'direct', 5);
  assert.match(html, /tree-node-name">Josef Kalina</);
  assert.match(html, /tree-node-number" aria-hidden="true">16</);
  assert.match(html, /tree-node-extra">roz\. Brabcová/);
  assert.match(RKTree.renderTreeView(sample, { focusPersonId: sample.meta.defaultPersonId, treeMode: 'direct' }), /tree-evidence-legend/);
  const model = RKTree.createTreeModel(sample, sample.meta.defaultPersonId, 'direct');
  assert.ok(RKTree.getUnknownSlots(model).slots.length > 0, 'an empty card marks the unknown parent');
});

test('full family tree lays out the sample with the embedded ELK', async () => {
  const graph = RKFullTree.buildGraph(sample, sample.meta.defaultPersonId);
  const visible = RKFullTree.getVisibleGraph(graph, { expandAll: true });
  const layout = await RKFullTree.layoutGraph(visible, { ELK, generationRanks: RKFullTree.getGenerationRanks(visible) });
  assert.equal(layout.children.length, sample.people.length);
  assert.ok(layout.children.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y)));
});

test('views render the overview, a person, a place, a source and the claim list', () => {
  assert.match(RKViews.renderOverview(sample), /Rodová kronika/);
  const person = RKViews.renderPersonDetail(sample, 'kalina-jan-1862');
  assert.match(person, /Jan Kalina/);
  assert.match(person, /1863/);
  assert.match(RKViews.renderPlaceDetail(sample, 'lipova-lhota'), /Lipová Lhota/);
  assert.match(RKViews.renderSourceDetail(sample, 'src-strom-online-kalina'), /vyžadují ověření/);
  const hypotheses = RKViews.renderClaims(sample, { filters: { evidence: 'hypothesis' } });
  assert.match(hypotheses, /Matěj Kalina/);
  assert.doesNotMatch(hypotheses, /Ludmila Kalinová byla rozená Dolejšová/);
  assert.match(RKViews.renderTimeline(sample, { filters: {} }), /Antonín Kalina odešel do Kanady/);
  assert.match(RKViews.renderMedia(sample, { filters: {} }), /ilustrační kresba/);
});

test('family migration map steps through generations with known places', () => {
  const model = RKMap.buildMigration(sample, RKModel.getAncestorDepths(sample, sample.meta.defaultPersonId));
  assert.ok(model.steps.length >= 3);
  assert.ok(model.steps.every((step) => step.stops.length > 0));
  assert.ok(model.links.length > 0, 'lines join birth places of parents and children');
});

test('history context is valid and pairs general events with a life by dates only', () => {
  assert.deepEqual(RKHistory.validateHistory(history), []);
  const josef = sample.people.find((person) => person.id === 'kalina-josef-1931');
  const context = RKHistory.lifeContext(josef, history.events);
  assert.ok(context.available);
  assert.ok(context.items.length > 0);
  assert.ok(context.items.every((item) => item.event && item.event.date));
});
