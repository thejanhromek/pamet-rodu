const test = require('node:test');
const assert = require('node:assert/strict');
const RKPresentation = require('../src/presentation.js');
const RKTree = require('../src/tree.js');
const RKViews = require('../src/views.js');

const knownPerson = {
  id: 'known',
  displayName: 'František Kalina',
  lineage: 'self',
  birth: { date: '1915-01-12', dateText: '12. 1. 1915', placeId: 'lipova' },
};
const approximatePerson = {
  id: 'approximate',
  displayName: 'Jan Novák',
  lineage: 'direct',
  birth: { dateText: 'pravděpodobně 6. 6. 1920' },
};
const missingBirthPerson = {
  id: 'missing-birth',
  displayName: 'Marie Svobodová',
  lineage: 'collateral',
};

const data = {
  meta: { defaultPersonId: knownPerson.id },
  people: [knownPerson, approximatePerson, missingBirthPerson],
  relationships: [{ id: 'known-approximate', type: 'parent-child', from: knownPerson.id, to: approximatePerson.id }],
  places: [{ id: 'lipova', name: 'Lipová', country: 'Česko', region: 'Lipovsko' }],
  events: [{ id: 'event-1', title: 'Událost', type: 'birth', date: '1920', dateText: '1920', personIds: [approximatePerson.id], placeId: 'lipova' }],
  claims: [],
  sources: [{ id: 'source-1', title: 'Pramen', type: 'family-record' }],
  media: [{ id: 'media-1', title: 'Fotografie', kind: 'family-photo', file: 'photo.webp', sourceId: 'source-1', personIds: [missingBirthPerson.id] }],
  researchTasks: [{ id: 'task-1', title: 'Úkol', priority: 1, status: 'open', expectedPayoff: 'Přínos', nextAction: 'Další krok', personIds: [missingBirthPerson.id] }],
  changelog: [],
};

test('person choice labels include a known birth year, including an approximate dateText year', () => {
  assert.equal(RKPresentation.personChoiceLabel(knownPerson), 'František Kalina · * 1915');
  assert.equal(RKPresentation.personChoiceLabel(approximatePerson), 'Jan Novák · * 1920');
});

test('person choice labels explicitly identify a missing birth year', () => {
  assert.equal(RKPresentation.personChoiceLabel(missingBirthPerson), 'Marie Svobodová · rok narození neznámý');
});

test('tree and view person choices use the shared birth-year labels', () => {
  const tree = RKTree.renderTreeView(data, { focusPersonId: knownPerson.id, treeMode: 'direct' });
  const media = RKViews.renderMedia(data, { filters: {} });
  const research = RKViews.renderResearch(data, { filters: {} });

  assert.match(tree, /<option value="František Kalina · \* 1915">/);
  assert.match(media, />Marie Svobodová · rok narození neznámý<\/option>/);
  assert.match(research, />Jan Novák · \* 1920<\/option>/);
});

test('compact person links and selected person filter chips use the shared labels', () => {
  const personDetail = RKViews.renderPersonDetail(data, knownPerson.id);
  const placeDetail = RKViews.renderPlaceDetail(data, 'lipova');
  const eventDetail = RKViews.renderEventDetail(data, 'event-1');
  const mediaDetail = RKViews.renderMediaDetail(data, 'media-1');
  const researchDetail = RKViews.renderResearchTaskDetail(data, 'task-1');
  const search = RKViews.renderGlobalSearchResults(data, 'František');
  const media = RKViews.renderMedia(data, { filters: { personId: knownPerson.id } });

  assert.match(personDetail, />Jan Novák · \* 1920<\/button>/);
  assert.match(placeDetail, />František Kalina · \* 1915<\/button>/);
  assert.match(eventDetail, />Jan Novák · \* 1920<\/button>/);
  assert.match(mediaDetail, />Marie Svobodová · rok narození neznámý<\/button>/);
  assert.match(researchDetail, />Marie Svobodová · rok narození neznámý<\/button>/);
  assert.match(search, />František Kalina · \* 1915<\/strong>/);
  assert.match(media, /Osoba: František Kalina · \* 1915/);
});
