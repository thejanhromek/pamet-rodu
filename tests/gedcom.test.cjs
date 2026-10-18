const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const RKGedcom = require('../src/gedcom.js');
const RKModel = require('../src/model.js');

// Invented three-generation family; nothing here comes from a real dataset.
const sample = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'gedcom-sample.json'), 'utf8'));
const NOW = new Date('2026-10-18T12:00:00Z');

const recordOf = (tree, xref) => tree.byXref[xref.replace(/@/g, '')];
const sub = (node, tag) => node.children.find((item) => item.tag === tag);
const subs = (node, tag) => node.children.filter((item) => item.tag === tag);
const countType = (items, type) => items.filter((item) => item.type === type).length;

test('chronicle dates become GEDCOM dates', () => {
  const value = (date, extra) => RKGedcom.toGedcomDate(date, extra)?.value;
  assert.equal(value('1920'), '1920');
  assert.equal(value('1920-11'), 'NOV 1920');
  assert.equal(value('1920-11-20'), '20 NOV 1920');
  assert.equal(value('1875', { dateText: 'asi 1875' }), 'ABT 1875');
  assert.equal(value(undefined, { dateText: 'kolem 1901' }), 'ABT 1901');
  assert.equal(value('1925', { endDate: '1927' }), 'BET 1925 AND 1927');
  assert.equal(value(undefined, { dateText: '1950–1955' }), 'BET 1950 AND 1955');
  assert.equal(value(undefined, { dateText: 'mezi 1925 a 1927' }), 'BET 1925 AND 1927');
  assert.equal(value(undefined, { dateText: 'před 1938' }), 'BEF 1938');
  assert.equal(RKGedcom.toGedcomDate('1920-11-20', { dateText: '20. 11. 1920' }).phrase, '');
  assert.equal(RKGedcom.toGedcomDate('1920', { dateText: '1920 podle indexu' }).phrase, '1920 podle indexu');
  assert.deepEqual(RKGedcom.toGedcomDate(undefined, { dateText: 'datum neznámé' }), { value: '', phrase: 'datum neznámé' });
  assert.equal(RKGedcom.toGedcomDate(undefined, {}), null);

  const back = (value, phrase) => RKGedcom.fromGedcomDate(value, phrase);
  assert.deepEqual(back('20 NOV 1920'), { qualifier: 'exact', dateText: '20. 11. 1920', date: '1920-11-20' });
  assert.deepEqual(back('NOV 1920'), { qualifier: 'exact', dateText: 'listopad 1920', date: '1920-11' });
  assert.deepEqual(back('ABT 1850'), { qualifier: 'about', dateText: 'asi 1850', date: '1850' });
  assert.deepEqual(back('BET 1800 AND 1810'), { qualifier: 'between', dateText: 'mezi 1800 a 1810', date: '1800', endDate: '1810' });
  assert.equal(back('@#DJULIAN@ 1 JAN 1700').date, '1700-01-01');
  assert.equal(back('INT 5 MAY 1890 (pátého máje)').dateText, 'pátého máje');
  assert.equal(back('1920', 'podle indexu').dateText, 'podle indexu');
});

test('export writes GEDCOM 7 header, people, families, places and media', () => {
  const { text, xrefOf } = RKGedcom.toGedcom(sample, { now: NOW });
  assert.match(text, /^0 HEAD\r\n1 GEDC\r\n2 VERS 7\.0\r\n1 CHAR UTF-8\r\n/);
  assert.match(text, /0 TRLR\r\n$/);
  const tree = RKGedcom.parseGedcom(text);
  assert.deepEqual(tree.errors, []);
  assert.equal(tree.version, '7.0');
  assert.equal(xrefOf['p-praded'], '@I1@');
  assert.equal(xrefOf['src-krest'], '@S1@');
  assert.equal(xrefOf['m-foto'], '@O1@');
  assert.equal(xrefOf['r-pradedove'], xrefOf['r-praded-ded'], 'partnership and its children share one family');

  const kvido = recordOf(tree, xrefOf['p-praded']);
  assert.equal(sub(kvido, 'NAME').value, 'Kvido /Zelenoplot/');
  assert.equal(sub(kvido, 'SEX').value, 'M');
  const birth = sub(kvido, 'BIRT');
  assert.equal(sub(birth, 'DATE').value, '14 MAR 1871');
  const place = sub(birth, 'PLAC');
  assert.equal(place.value, 'Horní Fiktivov, Smyšlený kraj, Česko');
  assert.equal(sub(sub(place, 'MAP'), 'LATI').value, 'N49.1234');
  assert.equal(sub(sub(place, 'MAP'), 'LONG').value, 'E17.5');
  assert.equal(subs(kvido, 'BIRT').length, 1, 'birth event merges into the person birth');
  assert.equal(sub(sub(kvido, 'DEAT'), 'DATE').value, '1940');
  assert.equal(sub(sub(kvido, 'BURI'), 'DATE').value, 'ABT 1940');
  assert.equal(sub(kvido, 'OCCU').value, 'mlynář');
  assert.ok(subs(kvido, 'NOTE').some((note) => note.value.startsWith('Tvrzení (ověřeno): Kvido byl mlynář.\nOdůvodnění:')));
  assert.equal(sub(sub(kvido, 'OBJE') && kvido, 'OBJE').pointer, 'O1');

  const berta = recordOf(tree, xrefOf['p-prababicka']);
  const names = subs(berta, 'NAME');
  assert.equal(names[0].value, 'Berta /Zelenoplotová/');
  assert.equal(names[1].value, 'Berta /Kmínková/');
  assert.equal(sub(names[1], 'TYPE').value, 'MAIDEN');
  assert.equal(sub(berta, 'SEX').value, 'F');
  assert.equal(sub(sub(berta, 'BIRT'), 'DATE').value, 'ABT 1875');
  assert.equal(sub(sub(berta, 'DEAT'), 'DATE').value, 'BEF 1938');

  const ota = recordOf(tree, xrefOf['p-ded']);
  assert.equal(sub(sub(ota, 'BIRT'), 'DATE').value, 'FEB 1899');
  assert.equal(sub(sub(ota, 'DEAT'), 'DATE').value, 'BET 1950 AND 1955');
  assert.equal(sub(sub(sub(ota, 'RESI'), 'PLAC'), 'MAP'), undefined);
  const census = sub(ota, 'CENS');
  assert.equal(sub(sub(sub(census, 'PLAC'), 'MAP'), 'LATI').value, 'S12.5');
  assert.equal(sub(sub(sub(census, 'PLAC'), 'MAP'), 'LONG').value, 'W45.25');
  assert.equal(sub(census, 'ASSO').pointer, xrefOf['p-pratetka'].replace(/@/g, ''));
  assert.equal(sub(sub(sub(ota, 'ASSO'), 'ROLE'), 'PHRASE').value, 'sourozenec');

  const family = recordOf(tree, xrefOf['r-pradedove']);
  assert.equal(sub(family, 'HUSB').pointer, 'I1');
  assert.equal(sub(family, 'WIFE').pointer, 'I2');
  assert.equal(sub(sub(family, 'MARR'), 'DATE').value, '2 MAY 1898');
  const grandparents = recordOf(tree, xrefOf['r-dedove']);
  assert.equal(sub(sub(grandparents, 'MARR'), 'DATE').value, 'BET 1925 AND 1927');
  assert.ok(subs(grandparents, 'NOTE').some((note) => note.value.includes('Ota a Lída byli manželé.')));
  const coparents = recordOf(tree, xrefOf['r-druha-teta']);
  assert.equal(sub(coparents, '_RKCOPARENTS').value, 'Y');

  const source = recordOf(tree, xrefOf['src-krest']);
  assert.equal(sub(source, 'TITL').value, 'Matrika narozených, fiktivní farnost');
  assert.equal(sub(source, 'PUBL').value, 'Smyšlený archiv');
  assert.equal(sub(source, 'WWW').value, 'https://archiv.example/matrika/1');
  assert.equal(sub(source, 'TEXT').value, 'Kvido, syn mlynáře\n@ poznámka na okraji');
  assert.match(text, /\r\n2 CONT @@ poznámka na okraji\r\n/, 'a leading @ is escaped');

  const photo = recordOf(tree, xrefOf['m-foto']);
  assert.equal(sub(photo, 'FILE').value, 'assets/optimized/foto-mlyn.webp');
  assert.equal(sub(sub(photo, 'FILE'), 'FORM').value, 'image/webp');
  const clip = recordOf(tree, xrefOf['m-hlas']);
  assert.equal(sub(clip, 'FILE').value, 'assets/interviews/vymysleny/clips/01.webm');
  assert.equal(sub(sub(clip, 'FILE'), 'FORM').value, 'audio/webm');

  const placeNote = tree.records.find((record) => record.tag === 'SNOTE');
  assert.match(placeNote.value, /^Místo Horní Fiktivov.*V obci stál mlýn\./);
});

test('citations carry QUAY from the evidence state', () => {
  const { text, xrefOf } = RKGedcom.toGedcom(sample, { now: NOW });
  const tree = RKGedcom.parseGedcom(text);
  const quay = (node) => sub(sub(node, 'SOUR'), 'QUAY')?.value;
  assert.deepEqual(RKGedcom.QUAY, { verified: 3, supported: 2, 'family-record': 1, hypothesis: 0 });
  const kvido = recordOf(tree, xrefOf['p-praded']);
  assert.equal(quay(sub(kvido, 'BIRT')), '3');
  assert.equal(quay(sub(kvido, 'BURI')), '0');
  assert.equal(quay(sub(recordOf(tree, xrefOf['r-pradedove']), 'MARR')), '2');
  assert.equal(quay(sub(recordOf(tree, xrefOf['r-dedove']), 'MARR')), '1');
  const hypothesisNote = subs(recordOf(tree, xrefOf['r-ded-teta']), 'NOTE').find((note) => note.value.includes('Otcem Hany'));
  assert.match(hypothesisNote.value, /^Tvrzení \(hypotéza\)/);
  assert.equal(quay(hypothesisNote), '0');
  assert.equal(sub(kvido, 'SOUR').children.find((item) => item.tag === 'QUAY'), undefined, 'a plain person source has no QUAY');
});

test('living people are reduced to a name in private mode', () => {
  const hidden = RKGedcom.livingPeople(sample, NOW);
  assert.deepEqual([...hidden].sort(), ['p-teta', 'p-vnuk', 'p-vnukova-zena']);

  const included = RKGedcom.toGedcom(sample, { now: NOW });
  assert.match(included.text, /Jindřich \/Zelenoplot\//);

  const { text, xrefOf } = RKGedcom.toGedcom(sample, { living: 'private', now: NOW });
  const tree = RKGedcom.parseGedcom(text);
  for (const id of hidden) {
    const record = recordOf(tree, xrefOf[id]);
    assert.equal(sub(record, 'NAME').value, 'Žijící osoba');
    assert.deepEqual([...new Set(record.children.map((item) => item.tag))].filter((tag) => !['NAME', 'FAMC', 'FAMS'].includes(tag)), [], id);
  }
  assert.doesNotMatch(text, /Jindřich|Tereza|Hana|pekárnou|pekařem|Voněl|1950-01|5 JAN 1950|p-vnuk/);
  assert.equal(xrefOf['m-hlas'], undefined, 'media of a living person are left out');
  const vypraveni = recordOf(tree, xrefOf['src-vypraveni']);
  assert.equal(sub(vypraveni, 'TEXT'), undefined, 'a source cited for a living person loses its transcription');
  const family = recordOf(tree, xrefOf['r-ded-vnuk']);
  assert.ok(subs(family, 'CHIL').some((node) => `@${node.pointer}@` === xrefOf['p-vnuk']), 'family links stay');
  assert.match(sub(recordOf(tree, xrefOf['p-praded']), 'NAME').value, /Kvido/);
});

test('export → parse → candidates keeps people and family links', () => {
  const { text } = RKGedcom.toGedcom(sample, { now: NOW });
  const candidates = RKGedcom.gedcomToCandidates(RKGedcom.parseGedcom(text), { fileName: 'vzorek.ged' });
  assert.equal(candidates.people.length, sample.people.length);
  for (const type of ['parent-child', 'spouse', 'sibling']) {
    assert.equal(countType(candidates.relationships, type), countType(sample.relationships, type), type);
  }
  const importSource = candidates.sources[0];
  assert.equal(importSource.title, 'import GEDCOM vzorek.ged');
  assert.ok(candidates.people.every((person) => /^gedcom-I\d+$/.test(person.id) && person.sourceIds.includes(importSource.id)));
  assert.ok(candidates.people.every((person) => person.notes[0].includes('vyžaduje ověření')));
  assert.ok([...candidates.relationships, ...candidates.events].every((item) => item.evidence === 'hypothesis'));

  const kvido = candidates.people[0];
  assert.equal(kvido.displayName, 'Kvido Zelenoplot');
  assert.deepEqual(kvido.birth, { date: '1871-03-14', dateText: '14. 3. 1871', placeId: kvido.birth.placeId, placeText: 'Horní Fiktivov, Smyšlený kraj, Česko' });
  const place = candidates.places.find((item) => item.id === kvido.birth.placeId);
  assert.deepEqual([place.name, place.region, place.country, place.lat, place.lon], ['Horní Fiktivov', 'Smyšlený kraj', 'Česko', 49.1234, 17.5]);
  const berta = candidates.people[1];
  assert.deepEqual(berta.surnames, ['Zelenoplotová', 'Kmínková']);
  assert.equal(berta.birth.date, '1875');
  assert.equal(berta.birth.dateText, 'asi 1875');
  const marriage = candidates.events.find((event) => event.type === 'marriage' && event.endDate);
  assert.deepEqual([marriage.date, marriage.endDate, marriage.personIds.length], ['1925', '1927', 2]);

  const merged = {
    ...sample,
    people: [...sample.people, ...candidates.people], relationships: [...sample.relationships, ...candidates.relationships],
    events: [...sample.events, ...candidates.events], places: [...sample.places, ...candidates.places], sources: [...sample.sources, ...candidates.sources],
  };
  assert.deepEqual(RKModel.validateDataset(merged), [], 'candidates fit the data contract');
});

test('candidates are matched by name base and birth year', () => {
  const { text } = RKGedcom.toGedcom(sample, { now: NOW });
  const candidates = RKGedcom.gedcomToCandidates(RKGedcom.parseGedcom(text), { fileName: 'vzorek.ged' });
  const matches = RKGedcom.matchCandidates(candidates, sample);
  sample.people.forEach((person, index) => {
    const best = matches.find((match) => match.candidateId === candidates.people[index].id);
    assert.equal(best.personId, person.id, person.displayName);
  });
  assert.equal(RKGedcom.surnameStem('Pelyňková'), RKGedcom.surnameStem('Pelyňka'));
  assert.equal(RKGedcom.surnameStem('Hájková'), RKGedcom.surnameStem('Hájek'));
  assert.equal(RKGedcom.surnameStem('Malá'), RKGedcom.surnameStem('Malý'));

  const data = { people: [{ id: 'x', displayName: 'Anna Nováková', surnames: ['Nováková'], sex: 'female', birth: { date: '1880' } }] };
  const one = (birth, name = 'Anna Novak') => RKGedcom.matchCandidates({ people: [{ id: 'c', displayName: name, surnames: [name.split(' ')[1]], sex: 'female', birth }] }, data);
  assert.equal(one({ date: '1882' })[0].score, 0.8);
  assert.equal(one({ date: '1883' }).length, 0, 'more than two years apart');
  assert.equal(one({ date: '1880' }, 'Anna Novakova')[0].score, 1);
  assert.equal(one(undefined, 'Anička Nováková').length, 0);
  const nickname = (value, part) => (part === 'given' && /^aničk/i.test(value) ? 'anna' : RKGedcom.normalizeName(value).replace(/ova$/, ''));
  const custom = RKGedcom.matchCandidates({ people: [{ id: 'c', displayName: 'Anička Nováková', surnames: ['Nováková'], sex: 'female' }] }, data, { nameKey: nickname });
  assert.equal(custom.length, 1);
  assert.match(custom[0].reasons.join(' '), /rok narození nelze porovnat/);
});

test('GEDCOM 5.5.1 is read tolerantly: BOM, CRLF, CONT/CONC, gaps and family links', () => {
  const lines = [
    '﻿0 HEAD',
    '1 SOUR TESTPROG',
    '1 GEDC',
    '2 VERS 5.5.1',
    '2 FORM LINEAGE-LINKED',
    '1 CHAR UTF-8',
    '',
    '0 @I1@ INDI',
    '1 NAME Bedřich /Mlhovec/',
    '1 SEX M',
    '1 BIRT',
    '2 DATE ABT 1850',
    '2 PLAC Mlhov, Neexistující kraj, Utopie',
    '3 MAP',
    '4 LATI N50.5',
    '4 LONG W3.25',
    '1 DEAT',
    '2 DATE BET 1900 AND 1905',
    '1 OCCU tkadlec',
    '1 NOTE Dlouhá pozn',
    '2 CONC ámka pokračuje',
    '2 CONT na dalším řádku',
    '2 CONT @@ zavináč',
    '1 FAMS @F1@',
    '1 SOUR @S1@',
    '2 PAGE str. 3',
    '2 QUAY 2',
    '0 @I2@ INDI',
    '1 NAME Dobromila /Mlhovcová/',
    '1 SEX F',
    '1 FAMS @F1@',
    '0 @I3@ INDI',
    '  1 NAME Ctibor /Mlhovec/',
    '1 SEX M',
    '1 CHR',
    '3 DATE @#DJULIAN@ 2 FEB 1880',
    '1 FAMC @F1@',
    '0 @F1@ FAM',
    '1 HUSB @I1@',
    '1 WIFE @I2@',
    '1 MARR',
    '2 DATE 12 JAN 1875',
    '0 @S1@ SOUR',
    '1 TITL Kronika obce',
    '1 TEXT První řádek',
    '2 CONC  a jeho konec',
    '0 TRLR',
  ];
  const tree = RKGedcom.parseGedcom(lines.join('\r\n'));
  assert.equal(tree.version, '5.5.1');
  assert.deepEqual(tree.errors, []);
  const bedrich = tree.byXref.I1;
  assert.equal(sub(bedrich, 'NOTE').value, 'Dlouhá poznámka pokračuje\nna dalším řádku\n@ zavináč');
  assert.equal(sub(tree.byXref.S1, 'TEXT').value, 'První řádek a jeho konec');
  assert.equal(sub(sub(tree.byXref.I3, 'CHR'), 'DATE').value, '@#DJULIAN@ 2 FEB 1880', 'a level gap attaches to the last node');

  const candidates = RKGedcom.gedcomToCandidates(tree, { fileName: 'cizi strom.ged' });
  assert.equal(candidates.sources[0].id, 'gedcom-import-cizi-strom-ged');
  assert.equal(candidates.people.length, 3);
  const [father, mother, son] = candidates.people;
  assert.equal(father.id, 'gedcom-I1');
  assert.deepEqual(father.birth, { date: '1850', dateText: 'asi 1850', placeId: 'gedcom-place-1', placeText: 'Mlhov, Neexistující kraj, Utopie' });
  assert.deepEqual(father.death, { dateText: 'mezi 1900 a 1905' });
  assert.deepEqual(father.occupations, ['tkadlec']);
  assert.ok(father.sourceIds.includes('gedcom-S1'));
  assert.equal(mother.sex, 'female');
  assert.deepEqual(candidates.places[0], { id: 'gedcom-place-1', name: 'Mlhov', country: 'Utopie', region: 'Neexistující kraj', lat: 50.5, lon: -3.25, coordinatesStatus: 'gedcom-import' });
  assert.deepEqual(candidates.relationships.map((relation) => [relation.type, relation.from, relation.to]), [
    ['spouse', father.id, mother.id], ['parent-child', father.id, son.id], ['parent-child', mother.id, son.id],
  ], 'children linked only by FAMC are found');
  const christening = candidates.events.find((event) => event.type === 'baptism');
  assert.equal(christening.date, '1880-02-02');
  assert.equal(candidates.events.find((event) => event.type === 'marriage').date, '1875-01-12');
  assert.equal(candidates.sources[1].title, 'Kronika obce');
});
