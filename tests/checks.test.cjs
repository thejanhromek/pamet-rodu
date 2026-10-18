const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const RKChecks = require('../src/checks.js');

const fixture = () => JSON.parse(fs.readFileSync('tests/fixtures/sample-family/data.json', 'utf8'));
const codes = (findings, severity) => findings.filter((item) => !severity || item.severity === severity).map((item) => item.code);
const person = (data, id) => data.people.find((item) => item.id === id);

test('the sample family has no impossible facts', () => {
  const findings = RKChecks.runChecks(fixture(), { now: new Date('2026-10-18') });
  assert.deepEqual(codes(findings, 'error'), []);
  assert.ok(codes(findings).includes('POSSIBLE_DUPLICATE'), 'Jan Kadlec / Johann Kadletz');
  assert.ok(codes(findings).includes('VERIFIED_WITHOUT_PRIMARY'));
  assert.ok(codes(findings).includes('UNUSED_SOURCE'));
  assert.ok(codes(findings).includes('PLACE_WITHOUT_COORDINATES'));
});

test('parents too young or too old, and births after a parent died', () => {
  const data = fixture();
  person(data, 'jana-kadlecova-fialova-1962').birth = { date: '1980-01-01', dateText: '1. 1. 1980' };
  person(data, 'petr-kadlec-1960').death = { date: '1988-01-01', dateText: '1. 1. 1988' };
  person(data, 'josef-kadlec-1930').birth = { date: '1880', dateText: '1880' };
  const findings = RKChecks.runChecks(data);
  const errors = codes(findings, 'error');
  assert.ok(errors.includes('MOTHER_TOO_YOUNG'), 'mother 10 at birth');
  assert.ok(errors.includes('BORN_AFTER_PARENT_DEATH'), 'Eva 1993 after father 1988');
  assert.ok(errors.includes('FATHER_TOO_OLD') || codes(findings).includes('FATHER_OLD'), 'father 80 at birth');
});

test('hedged dates soften errors into warnings', () => {
  const data = fixture();
  person(data, 'jana-kadlecova-fialova-1962').birth = { dateText: 'asi 1980' };
  const findings = RKChecks.runChecks(data);
  assert.ok(!codes(findings, 'error').includes('MOTHER_TOO_YOUNG'));
  assert.ok(codes(findings, 'warning').includes('MOTHER_YOUNG'));
});

test('events after death, death before birth and child marriages', () => {
  const data = fixture();
  person(data, 'frantisek-kadlec-1898').death = { date: '1920-01-01', dateText: '1. 1. 1920' };
  person(data, 'karel-fiala-1935').death = { date: '1930', dateText: '1930' };
  person(data, 'anezka-kadlecova-simkova-1902').birth = { date: '1920', dateText: '1920' };
  const errors = codes(RKChecks.runChecks(data), 'error');
  assert.ok(errors.includes('EVENT_AFTER_DEATH'), 'workshop 1925');
  assert.ok(errors.includes('DEATH_BEFORE_BIRTH'));
  assert.ok(errors.includes('MARRIAGE_TOO_YOUNG'), 'married 1927 at 7');
});

test('reviewed findings can be accepted with a reason and keep a stable key', () => {
  const first = RKChecks.runChecks(fixture());
  const duplicate = first.find((item) => item.code === 'POSSIBLE_DUPLICATE');
  assert.equal(duplicate.key, 'POSSIBLE_DUPLICATE:jan-kadlec-1870,johann-kadletz-1871');
  const second = RKChecks.runChecks(fixture(), { accepted: [{ key: duplicate.key, reason: 'Různé osoby, ověřeno v matrice.' }] });
  assert.equal(second.find((item) => item.key === duplicate.key).accepted, 'Různé osoby, ověřeno v matrice.');
  assert.equal(RKChecks.summarize(second).accepted, 1);
});
