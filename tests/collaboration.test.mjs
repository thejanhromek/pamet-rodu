import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { splitMessages, suggestionsToChanges } from '../scripts/import-suggestions.mjs';
import { buildQuestionnaire } from '../scripts/questionnaire.mjs';
import { readme } from '../scripts/release.mjs';

const require = createRequire(import.meta.url);
const RKComponents = require('../src/components.js');
const RKChanges = require('../src/changes.js');
const RKQuestions = require('../src/questions.js');
const RKEditionDiff = require('../src/edition-diff.js');
const RKHistory = require('../src/history.js');
const RKFamilyViews = require('../src/family-views.js');
const RKModel = require('../src/model.js');

const load = (name) => JSON.parse(fs.readFileSync(`tests/fixtures/sample-family/${name}.json`, 'utf8'));
const data = () => {
  const sample = load('data');
  const notes = load('media-notes').media;
  const gazetteer = load('gazetteer').places;
  for (const media of sample.media) Object.assign(media, notes[media.id] || {});
  for (const place of sample.places) if (gazetteer[place.id]) place.historical = gazetteer[place.id];
  return sample;
};
const NOW = new Date('2026-10-18T10:00:00Z');

test('a prepared message carries a short machine-readable block and reads back', () => {
  const message = RKComponents.feedbackMessage({ topic: 'Josef Kadlec (* 1930)', context: 'Osoba: Josef Kadlec\nID: josef-kadlec-1930', text: 'Děda byl i kovář.\nUměl podkovat koně.', name: 'Teta Eva', kind: 'oprava', subject: 'person:josef-kadlec-1930', date: NOW });
  assert.match(message.body, /\[RK-NAVRH v1 \{"k":"oprava","s":"person:josef-kadlec-1930","d":"2026-10-18"\}\]$/);
  const links = RKComponents.feedbackLinks('spravce@example.com', message);
  assert.ok(links.mailto.length < 2000);
  assert.deepEqual(RKComponents.parseFeedbackMessage(links.copy), { kind: 'oprava', subject: 'person:josef-kadlec-1930', date: '2026-10-18', text: 'Děda byl i kovář.\nUměl podkovat koně.', name: 'Teta Eva', topic: 'Josef Kadlec (* 1930)' });
  assert.equal(RKComponents.parseFeedbackMessage('bez bloku'), null);
  assert.match(RKComponents.feedbackForm(data(), { subject: 'person:x', kind: 'fotka' }), /data-feedback-subject="person:x"[\s\S]*<option value="fotka" selected>/);
});

test('pasted e-mails become a change set with a family-record source and claim', () => {
  const sample = data();
  const one = RKComponents.feedbackLinks('a@example.com', RKComponents.feedbackMessage({ topic: 'x', text: 'Karel byl také hasič.', name: 'Eva', kind: 'doplneni', subject: 'person:karel-fiala-1935', date: NOW })).copy;
  const two = RKComponents.feedbackLinks('a@example.com', RKComponents.feedbackMessage({ topic: 'foto', text: 'Vpravo je strýc Alois.', name: 'Eva', kind: 'fotka', subject: 'media:media-photo-1955', date: NOW })).copy;
  const three = RKComponents.feedbackMessage({ text: 'Neznámý předmět.', kind: 'oprava', subject: 'person:nikdo', date: NOW }).body;
  const parts = splitMessages(`${one}\n\n----\n${two}\n${three}`);
  assert.equal(parts.length, 3);
  const messages = parts.map((part) => RKComponents.parseFeedbackMessage(part));
  const { set, notes } = suggestionsToChanges(messages, sample, { now: NOW });
  assert.deepEqual(RKChanges.validateChangeSet(set), []);
  const claims = set.ops.filter((op) => op.collection === 'claims').map((op) => op.item);
  assert.deepEqual(claims.map((claim) => [claim.subjectType, claim.subjectId, claim.evidence]), [['person', 'karel-fiala-1935', 'family-record'], ['source', 'src-family-notes', 'family-record']]);
  assert.equal(set.ops.filter((op) => op.collection === 'sources').length, 3);
  assert.match(notes.join(' '), /person:nikdo/);
  assert.deepEqual(RKChanges.applyChangeSet({ genealogy: sample }, set).errors, []);
});

test('questions ask about gaps of the person, parents and grandparents only', () => {
  const questions = RKQuestions.questionsFor(data(), 'petr-kadlec-1960', { now: NOW });
  const texts = questions.map((question) => question.text).join('\n');
  assert.match(texts, /Víte, jak se jmenovali rodiče – Marie Kadlecová, roz\. Vrbová\?/);
  assert.match(texts, /Na fotografii „Svatba Josefa a Marie“ je jedna osoba, kterou neznáme/);
  assert.doesNotMatch(texts, /Jan Kadlec/, 'great-grandparents are outside the circle');
  assert.ok(questions.every((question) => question.depth <= 2));
  const profile = RKFamilyViews.renderQuestions(data(), 'josef-kadlec-1930');
  assert.match(profile, /Víte něco víc\?[\s\S]*data-question-answer=/);
  const html = buildQuestionnaire(data(), 'petr-kadlec-1960', { now: NOW });
  assert.match(html, /<h1>Pro: Petr Kadlec<\/h1>/);
  assert.match(html, /spravce@example\.com/);
});

test('what is new compares two editions for the family', () => {
  const previous = data();
  const current = data();
  current.people.push({ id: 'nova', displayName: 'Nová Osoba' });
  current.relationships.find((link) => link.id === 'rel-jan-frantisek').evidence = 'verified';
  current.claims.find((claim) => claim.id === 'claim-frantisek-workshop').evidence = 'verified';
  const diff = RKEditionDiff.diffEditions(previous, current);
  assert.equal(diff.empty, false);
  assert.deepEqual(diff.newPeople, [{ id: 'nova', displayName: 'Nová Osoba' }]);
  assert.deepEqual(diff.strengthened.map((link) => [link.id, link.was, link.now]), [['rel-jan-frantisek', 'hypothesis', 'verified']]);
  assert.deepEqual(diff.newlyVerified.map((claim) => claim.id), ['claim-frantisek-workshop']);
  assert.equal(RKEditionDiff.diffEditions(previous, previous).empty, true);
  const html = RKFamilyViews.renderWhatsNew({ ...current, editionChanges: { ...diff, sinceVersion: '1.1.0', sinceDate: '2026-09-01' } });
  assert.match(html, /Co je nového od vydání 1\.1\.0 \(1\. 9\. 2026\)/);
  assert.match(html, /1 nová osoba/);
});

test('the gazetteer gives old names, jurisdictions and house histories', () => {
  const sample = data();
  const litomysl = sample.places.find((place) => place.id === 'litomysl');
  const html = RKFamilyViews.renderPlaceHistory(sample, litomysl);
  assert.match(html, /Leitomischl <span class="muted">\(německy\)<\/span>/);
  assert.match(html, /panství Litomyšl \(…–1848\)/);
  const houses = RKFamilyViews.houseHistory(sample, litomysl);
  assert.equal(houses[0][0], '12');
  assert.deepEqual(houses[0][1].slice(0, 3).map((entry) => entry.year), [1870, 1898, 1930]);
  assert.equal(RKModel.globalSearch(sample, 'Leitomischl').groups.places[0].id, 'litomysl');
});

test('local history belongs only to people connected with its places', () => {
  const sample = data();
  const events = load('history-local').events;
  const karel = sample.people.find((person) => person.id === 'karel-fiala-1935');
  const josef = sample.people.find((person) => person.id === 'josef-kadlec-1930');
  const forKarel = RKHistory.lifeContext(karel, events, { data: sample, currentYear: 2026 }).items.map((item) => item.event.id);
  const forJosef = RKHistory.lifeContext(josef, events, { data: sample, currentYear: 2026 }).items.map((item) => item.event.id);
  assert.deepEqual(forKarel, ['local-1950-druzstvo']);
  assert.deepEqual(forJosef, []);
  assert.deepEqual(RKHistory.validateHistory({ events }), []);
  assert.match(RKHistory.validateHistory({ events: [{ ...events[0], placeIds: [] }] }).join(), /placeIds/);
});

test('the archive edition explains its files to future readers', () => {
  const text = readme({ version: '2.0.0', date: '2030-01-01', pdfA: true, gedcom: true });
  assert.match(text, /vydání 2\.0\.0 \(2030-01-01\)/);
  assert.match(text, /PDF\/A-2b/);
  assert.match(text, /GEDCOM 7/);
  assert.match(text, /sha256sum -c MANIFEST\.sha256/);
});
