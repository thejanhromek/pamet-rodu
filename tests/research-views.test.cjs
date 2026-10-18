const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const RKResearchViews = require('../src/research-views.js');
const RKChanges = require('../src/changes.js');
const RKApp = require('../src/app.js');

const load = (name) => JSON.parse(fs.readFileSync(`tests/fixtures/sample-family/${name}.json`, 'utf8'));
const data = () => ({ ...load('data'), registers: load('registers').registers });

test('research views render the queue, data health, transcription form, editor and DNA', () => {
  RKResearchViews.resetState();
  const sample = data();
  const queue = RKResearchViews.render('research', sample, { filters: {} });
  assert.match(queue, /<h1 id="rv-title">Výzkumná fronta<\/h1>/);
  assert.match(queue, /Kdo byli rodiče: Jan Kadlec\?/);
  assert.match(queue, /href="https:\/\/example\.com\/matriky\/1001"/);
  assert.match(queue, /data-rv-action="transcribe-for"/);
  const health = RKResearchViews.render('health', sample, { filters: { severity: 'warning' } });
  assert.match(health, /Možná tatáž osoba: Jan Kadlec \(1870\) a Johann Kadletz \(1871\)/);
  assert.doesNotMatch(health, /Místo Vysoké Mýto nemá souřadnice/, 'filtered to warnings');
  assert.match(RKResearchViews.render('transcribe', sample, {}), /data-rv-literal="birthDate"[\s\S]*data-rv-interpretation="birthDate"/);
  assert.match(RKResearchViews.render('editor', sample, {}), /data-rv-editor="collection"/);
  assert.match(RKResearchViews.render('dna', sample, {}), /Žádná data DNA/);
  assert.deepEqual(RKResearchViews.navigationItems(sample).map((item) => item.hash), ['badatelna', 'zdravi-dat', 'prepis', 'editor']);
});

test('a baptism transcription becomes a source, an event, a claim and verified parent links', () => {
  const sample = data();
  const draft = RKResearchViews.emptyDraft('N');
  Object.assign(draft.source, { archive: 'Ukázkový archiv', signature: '1001', scan: '23', placeId: 'litomysl' });
  draft.literal = { birthDate: '24. Mai 1870', child: 'Joannes', father: 'Joannes Kadletz Tischler', house: '12' };
  draft.interpretation = { birthDate: '24. 5. 1870', child: 'Jan Kadlec', father: 'Jan Kadlec starší, truhlář', house: '12' };
  draft.links = { child: 'jan-kadlec-1870', father: 'new' };
  draft.newNames = { father: 'Jan Kadlec starší' };
  const { errors, ops } = RKResearchViews.transcriptionToOps(sample, draft);
  assert.deepEqual(errors, []);
  const source = ops.find((op) => op.collection === 'sources').item;
  assert.equal(source.type, 'parish-register');
  assert.deepEqual(source.transcriptionLines, ['Datum narození: 24. Mai 1870', 'Číslo domu: 12', 'Jméno dítěte: Joannes', 'Otec (jméno, povolání, bydliště): Joannes Kadletz Tischler'], 'literal text stays separate');
  const event = ops.find((op) => op.collection === 'events').item;
  assert.equal(event.date, '1870-05-24');
  assert.equal(event.placeText, 'Litomyšl č. 12');
  assert.equal(event.evidence, 'verified');
  const claim = ops.find((op) => op.collection === 'claims').item;
  assert.match(claim.text, /Jméno dítěte: Jan Kadlec/, 'interpretation goes into the claim');
  assert.match(claim.reasoning, /doslovné znění je v prameni/);
  const father = ops.find((op) => op.collection === 'people' && op.op === 'add').item;
  assert.equal(father.sex, 'male');
  const link = ops.find((op) => op.collection === 'relationships').item;
  assert.deepEqual([link.from, link.to, link.evidence], [father.id, 'jan-kadlec-1870', 'verified']);
  assert.deepEqual(RKChanges.applyChangeSet({ genealogy: sample }, { format: 'rk-changes/1', ops }).errors, [], 'the change set applies cleanly');
});

test('an existing link is confirmed instead of duplicated, and the form explains what is missing', () => {
  const sample = data();
  const draft = RKResearchViews.emptyDraft('N');
  Object.assign(draft.source, { signature: '1001', placeId: 'litomysl' });
  draft.literal = { birthDate: '20. 2. 1898', child: 'Franz' };
  draft.interpretation = { birthDate: '20. 2. 1898', child: 'František Kadlec', father: 'Jan Kadlec' };
  draft.links = { child: 'frantisek-kadlec-1898', father: 'jan-kadlec-1870' };
  const { ops } = RKResearchViews.transcriptionToOps(sample, draft);
  const update = ops.find((op) => op.collection === 'relationships');
  assert.equal(update.op, 'update');
  assert.equal(update.id, 'rel-jan-frantisek');
  assert.equal(update.set.evidence, 'verified');
  const empty = RKResearchViews.transcriptionToOps(sample, RKResearchViews.emptyDraft('Z'));
  assert.ok(empty.errors.some((message) => message.includes('Zemřelý')));
  assert.ok(empty.errors.some((message) => message.includes('datum')));
  assert.equal(RKResearchViews.isoFromCzech('3. 8. 1960'), '1960-08-03');
  assert.equal(RKResearchViews.isoFromCzech('kolem 1900'), null);
});

test('the editor turns a form into an add or a minimal update', () => {
  RKResearchViews.resetState();
  const sample = data();
  const editor = RKResearchViews.editorState;
  editor.collection = 'people';
  editor.values = { displayName: 'Anna Vrbová', sex: 'female', 'birth.dateText': '1905', sourceIds: 'src-family-notes' };
  const added = RKResearchViews.editorToOps(sample);
  assert.deepEqual(added.errors, []);
  assert.equal(added.ops[0].item.id, 'anna-vrbova-1905');
  assert.deepEqual(added.ops[0].item.birth, { dateText: '1905', date: '1905' });
  editor.id = 'karel-fiala-1935';
  RKResearchViews.loadEditorItem(sample);
  assert.equal(editor.values['birth.placeId'], 'policka', 'the form starts from the stored record');
  editor.values.occupations = 'pekař, cukrář';
  const updated = RKResearchViews.editorToOps(sample);
  assert.deepEqual(updated.ops[0], { op: 'update', collection: 'people', id: 'karel-fiala-1935', set: { occupations: ['pekař', 'cukrář'] } });
  assert.deepEqual(RKResearchViews.editorToOps(sample).errors.length, 0);
  editor.values.occupations = 'pekař';
  assert.deepEqual(RKResearchViews.editorToOps(sample).errors, ['Nic se nezměnilo.']);
  editor.id = '';
  editor.values = { displayName: 'X', sourceIds: 'src-neni' };
  assert.match(RKResearchViews.editorToOps(sample).errors.join(' '), /Pramen src-neni neexistuje/);
});

test('the research hashes open their views only in the research edition', () => {
  const saved = globalThis.RKResearchViews;
  delete globalThis.RKResearchViews;
  assert.equal(RKApp.viewFromHash('#badatelna'), 'overview');
  globalThis.RKResearchViews = RKResearchViews;
  assert.equal(RKApp.viewFromHash('#badatelna'), 'research');
  assert.equal(RKApp.viewFromHash('#zdravi-dat'), 'health');
  if (saved) globalThis.RKResearchViews = saved;
  else delete globalThis.RKResearchViews;
});
