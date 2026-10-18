const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const RKKinship = require('../src/kinship.js');
const RKPresentation = require('../src/presentation.js');
const RKStory = require('../src/story.js');
const RKStats = require('../src/stats.js');
const RKMap = require('../src/map.js');
const RKFamilyViews = require('../src/family-views.js');

const load = (name) => JSON.parse(fs.readFileSync(`tests/fixtures/sample-family/${name}.json`, 'utf8'));
const data = () => {
  const sample = load('data');
  const notes = load('media-notes').media;
  for (const media of sample.media) Object.assign(media, notes[media.id] || {});
  return sample;
};
const history = { events: [
  { id: 'h-war', date: '1939-09-01', endDate: '1945-05-08', title: 'Druhá světová válka', summary: 'Válka.', category: 'war', sources: [{ title: 'x', url: 'https://example.com' }] },
  { id: 'h-local', date: '1950', title: 'Vznik místního družstva', summary: 'x', category: 'politics', placeIds: ['policka'], sources: [{ title: 'x', url: 'https://example.com' }] },
] };
const NOW = new Date('2026-10-18');

test('kinship finds the chain through the closest common ancestral couple', () => {
  const cousin = RKKinship.kinshipPath(data(), 'adam-kadlec-1990', 'lucie-kadlecova-1990');
  assert.deepEqual(cousin.path, ['adam-kadlec-1990', 'petr-kadlec-1960', 'josef-kadlec-1930', 'frantisek-kadlec-1898', 'vaclav-kadlec-1934', 'tomas-kadlec-1962', 'lucie-kadlecova-1990']);
  assert.deepEqual(cousin.commonAncestorIds, ['frantisek-kadlec-1898', 'anezka-kadlecova-simkova-1902']);
  assert.equal(cousin.half, false);
  assert.equal(RKPresentation.relationshipLabel(cousin.relationship, 'female'), 'sestřenice z druhého kolena');
  const spouseOfUncle = RKKinship.kinshipPath(data(), 'adam-kadlec-1990', 'marie-kadlecova-vrbova-1932');
  assert.equal(spouseOfUncle.path.at(-1), 'marie-kadlecova-vrbova-1932');
});

test('half siblings are told apart from full siblings', () => {
  const sample = data();
  sample.people.push({ id: 'half', displayName: 'Nevlastní Kadlec', sex: 'male' }, { id: 'other-mother', displayName: 'Jiná matka', sex: 'female' });
  sample.relationships.push({ id: 'h1', type: 'parent-child', from: 'petr-kadlec-1960', to: 'half' }, { id: 'h2', type: 'parent-child', from: 'other-mother', to: 'half' });
  assert.equal(RKKinship.kinshipPath(sample, 'adam-kadlec-1990', 'half').half, true);
  assert.equal(RKKinship.kinshipPath(sample, 'adam-kadlec-1990', 'eva-kadlecova-1993').half, false);
});

test('Czech wording covers relatives a generation apart', () => {
  const label = (up, down, sex = 'male') => RKPresentation.relationshipLabel({ kind: 'blood', up, down }, sex);
  assert.equal(label(2, 3), 'syn bratrance či sestřenice');
  assert.equal(label(3, 2, 'female'), 'sestřenice rodiče');
  assert.equal(label(4, 1, 'female'), 'praprateta');
  assert.equal(label(3, 3), 'bratranec z druhého kolena');
  assert.equal(label(1, 4), 'pravnuk sourozence');
});

test('the life story tells the known, marks the uncertain and names the gaps', () => {
  const sample = data();
  const story = RKStory.storyText(sample, 'frantisek-kadlec-1898', { history, now: NOW });
  assert.match(story, /František Kadlec se narodil 20\. 2\. 1898 \(Litomyšl\)\./);
  assert.match(story, /Jeho otcem byl možná Jan Kadlec – zatím neověřeno\./);
  assert.match(story, /Jméno jeho matky zatím neznáme\./);
  assert.match(story, /Roku 1927 uzavřel sňatek \(Litomyšl\) \(podle rodinného vyprávění\)\. Manželkou se stala Anežka/);
  assert.match(story, /Měl 2 děti: Josef Kadlec, Václav Kadlec\./);
  assert.match(story, /1939–1945 – Druhá světová válka \(na začátku mu bylo 41 let\)/);
  assert.match(story, /V rozhovoru zaznělo: „Děda František měl dílnu v domě číslo dvanáct\.“/);
  assert.match(story, /Zemřel 3\. 8\. 1960 \(Litomyšl\), ve věku asi 62 let\./);
  const jana = RKStory.storyText(sample, 'jana-kadlecova-fialova-1962', { now: NOW });
  assert.match(jana, /Jméno její matky zatím neznáme\./, 'feminine agreement');
  assert.doesNotMatch(jana, /Zemřel/, 'no death for the living');
  assert.match(RKFamilyViews.renderStory(sample, 'josef-kadlec-1930', { history }), /<h3>Životní příběh<\/h3>/);
});

test('statistics per birth period carry the size of their sample', () => {
  const result = RKStats.computeStats(data());
  const band = result.bands.find((entry) => entry.from === 1925);
  assert.equal(band.people, 5);
  assert.deepEqual(band.lifespan, { average: 72.3, n: 3 });
  assert.equal(band.marriageAge.male.n, 1);
  assert.equal(band.marriageAge.male.average, 25);
  assert.match(RKFamilyViews.renderStats(data()), /Rod v číslech[\s\S]*n = 2/);
});

test('lives side by side: the direct line by generation, estimates marked', () => {
  const rows = RKFamilyViews.lifelineRows(data(), { egoId: 'adam-kadlec-1990', now: NOW });
  assert.equal(rows[0].person.id, 'jan-kadlec-1870', 'oldest generation first');
  assert.equal(rows.find((row) => row.person.id === 'adam-kadlec-1990').endKind, 'living');
  assert.equal(rows.find((row) => row.person.id === 'jan-kadlec-1870').endKind, 'known');
  assert.deepEqual(rows.find((row) => row.person.id === 'josef-kadlec-1930').marriages, [1955]);
  const html = RKFamilyViews.renderLifelines(data(), { egoPersonId: 'adam-kadlec-1990' }, { now: NOW, history });
  assert.match(html, /<g class="life-row life-living" data-person-id="adam-kadlec-1990"/);
  assert.match(html, /Druhá světová válka/);
  assert.doesNotMatch(html, /Vznik místního družstva/, 'local events are not drawn as national bands');
});

test('the family film follows births and moves year by year', () => {
  const film = RKMap.buildFilm(data());
  assert.equal(film.from, 1870);
  assert.ok(film.links.some((link) => link.move && link.fromPlaceId === 'skutec' && link.toPlaceId === 'policka'));
  assert.ok(film.links.some((link) => link.parentId === 'vaclav-fiala-1905' || link.parentId === 'ludmila-fialova-habrmanova-1908'));
  const caption = RKFamilyViews.filmCaption(data(), film, 1935, 5, history);
  assert.match(caption.html, /Narození:[\s\S]*Karel Fiala/);
  assert.match(caption.text, /^Roky 1931 až 1935\. Narození: Václav Kadlec, Karel Fiala\. Stěhování: Ludmila Fialová/);
  assert.match(RKFamilyViews.filmCaption(data(), film, 1950, 5, history).html, /Vznik místního družstva/, 'local history of film places');
});

test('photos show named frames, ask about unknown faces and give the person cut-outs', () => {
  const sample = data();
  const media = sample.media.find((item) => item.id === 'media-photo-1955');
  const figure = RKFamilyViews.renderMediaFigure(sample, media);
  assert.match(figure, /class="media-region media-region-face"[^>]*data-person-id="josef-kadlec-1930"/);
  assert.match(figure, /data-region-unknown="r3"[^>]*><span>Kdo to je\?<\/span>/);
  assert.match(figure, /Datace:<\/strong> 7\. 5\. 1955 \(podle rodinného vyprávění\)/);
  const photos = RKFamilyViews.renderPersonPhotos(sample, 'marie-kadlecova-vrbova-1932');
  assert.match(photos, /data-region-thumb data-media-ref="media-photo-1955" data-x="0\.56"/);
  assert.equal(RKFamilyViews.renderPersonPhotos(sample, 'adam-kadlec-1990'), '');
});

test('interview words become clickable, timed spans', () => {
  const clip = data().media.find((item) => item.kind === 'audio-clip');
  const html = RKFamilyViews.renderClipWords(clip);
  assert.match(html, /<span class="clip-word" data-word-time="0\.6">František<\/span>/);
});
