const test = require('node:test');
const assert = require('node:assert/strict');
const RKDna = require('../src/dna.js');

// Synthetic fixture: invented ids and aliases, no real people.
const data = {
  people: ['p-self', 'p-gf-pat', 'p-gm-pat', 'p-gf-mat', 'p-gm-mat'].map((id) => ({ id, displayName: id })),
};
const branches = {
  'p-gf-pat': { side: 'paternal', ancestorId: 'p-gf-pat', label: 'otcův otec' },
  'p-gm-pat': { side: 'paternal', ancestorId: 'p-gm-pat', label: 'otcova matka' },
  'p-gf-mat': { side: 'maternal', ancestorId: 'p-gf-mat', label: 'matčin otec' },
  'p-gm-mat': { side: 'maternal', ancestorId: 'p-gm-mat', label: 'matčina matka' },
};
const branchOf = (ancestorId) => branches[ancestorId] || null;

const m = (id, sharedCm, sharedMatchIds = [], extra = {}) => ({ id, testId: 't-1', alias: `alias-${id}`, sharedCm, sharedMatchIds, ...extra });
// Four groups (a, b, c, d), one match x shared with groups a and c, one lone
// match, and two matches outside the default 90–400 cM window.
const matches = [
  m('a1', 380, ['a2', 'a3', 'x'], { knownRelation: { commonAncestorIds: ['p-gf-pat'], relationship: '2c' } }),
  m('a2', 250, ['a1', 'a3']),
  m('a3', 120, ['a1']),
  m('b1', 300, ['b2', 'b3'], { knownRelation: { commonAncestorIds: ['p-gm-pat'] } }),
  m('b2', 200, ['b1']),
  m('b3', 95, ['b2']),
  m('c1', 290, ['c2'], { knownRelation: { commonAncestorIds: ['p-gf-mat', 'p-gm-mat'] } }),
  m('c2', 180, ['c3']),
  m('c3', 110, []),
  m('x', 150, ['c2']),
  m('d1', 210, ['d2', 'd3'], { knownRelation: { commonAncestorIds: ['p-gm-mat'] } }),
  m('d2', 160, ['d3'], { knownRelation: { commonAncestorIds: ['p-gf-pat'] } }),
  m('d3', 100, []),
  m('lone', 140, ['far']),
  m('close', 1500, ['a1']),
  m('far', 40, ['lone']),
];
const dna = { tests: [{ id: 't-1', personId: 'p-self', company: 'Testovací firma', testedAt: '2026-01' }], matches };

test('source cites the Shared cM Project 4.0 with licence and URL', () => {
  assert.match(RKDna.SOURCE.author, /Bettinger/);
  assert.equal(RKDna.SOURCE.license, 'CC BY 4.0');
  assert.match(RKDna.SOURCE.url, /^https:\/\//);
  for (const range of RKDna.RANGES) {
    assert.ok(range.min <= range.avg && range.avg <= range.max, range.key);
    assert.match(range.label, /[a-zá-ž]/);
  }
  const keys = RKDna.RANGES.map((range) => range.key);
  for (const key of ['parent', 'sibling', 'grandparent', 'aunt-uncle', '1c', '1c1r', 'half-1c', '3c2r', '5c', '5c3r']) assert.ok(keys.includes(key), key);
  assert.equal(new Set(keys).size, keys.length);
});

test('relationship candidates contain the value and are ordered by distance from the average', () => {
  const keys = (cm) => RKDna.relationshipCandidates(cm).map((candidate) => candidate.key);
  const check = (cm) => {
    const list = RKDna.relationshipCandidates(cm);
    assert.ok(list.length > 0, String(cm));
    for (const candidate of list) assert.ok(candidate.min <= cm && cm <= candidate.max, `${cm} ${candidate.key}`);
    for (let i = 1; i < list.length; i += 1) assert.ok(Math.abs(cm - list[i - 1].avg) <= Math.abs(cm - list[i].avg));
    return list;
  };

  const parent = check(3400);
  assert.deepEqual(keys(3400).slice(0, 2), ['parent', 'child']);
  assert.ok(keys(3400).includes('sibling'));
  assert.equal(parent[0].label, 'rodič');

  const near850 = check(850);
  assert.deepEqual(near850.slice(0, 2).map((c) => c.key), ['great-aunt-uncle', 'great-niece-nephew']);
  assert.ok(keys(850).includes('1c') && keys(850).includes('half-aunt-uncle'));
  assert.ok(!keys(850).includes('parent') && !keys(850).includes('2c'));

  const near200 = check(200);
  assert.deepEqual(near200.slice(0, 2).map((c) => c.key), ['half-great-great-aunt-uncle', 'half-great-great-niece-nephew']);
  assert.ok(keys(200).includes('2c') && keys(200).includes('1c2r'));
  assert.ok(near200.some((c) => c.label === 'bratranec / sestřenice z 2. kolena'));

  const near30 = check(30);
  assert.equal(near30[0].key, '4c1r');
  assert.ok(keys(30).includes('5c3r') && keys(30).includes('3c'));
  assert.ok(!keys(30).includes('1c'));
  assert.ok(near30.some((c) => c.label === 'bratranec / sestřenice z 4. kolena, o generaci posunutý'));

  assert.deepEqual(RKDna.relationshipCandidates(5000), []);
  assert.deepEqual(RKDna.relationshipCandidates('abc'), []);
});

test('Leeds clustering finds four groups, one overlap and the unassigned match', () => {
  const result = RKDna.leedsClusters(matches, { minCm: 90, maxCm: 400 });
  assert.deepEqual(result.clusters.map((cluster) => cluster.matchIds), [
    ['a1', 'a2', 'a3'],
    ['b1', 'b2', 'b3'],
    ['c1', 'c2', 'c3'],
    ['d1', 'd2', 'd3'],
  ]);
  assert.deepEqual(result.clusters.map((cluster) => cluster.id), ['cluster-1', 'cluster-2', 'cluster-3', 'cluster-4']);
  assert.deepEqual(result.overlaps, [{ matchId: 'x', clusterIds: ['cluster-1', 'cluster-3'] }]);
  assert.deepEqual(result.unassigned, ['lone']);
  const all = JSON.stringify(result);
  assert.ok(!all.includes('close') && !all.includes('far'), 'matches outside the window are ignored');

  assert.deepEqual(RKDna.leedsClusters(matches).clusters.length, 4, 'defaults to 90–400 cM');
  assert.deepEqual(RKDna.leedsClusters([], {}), { clusters: [], unassigned: [], overlaps: [] });
});

test('clusters get branches from known common ancestors; disagreements are conflicts', () => {
  const { clusters } = RKDna.leedsClusters(matches);
  const result = RKDna.assignClustersToBranches(clusters, matches, branchOf);
  assert.deepEqual(result.assignments.map((a) => [a.clusterId, a.branches.map((b) => b.ancestorId), a.evidenceMatchIds]), [
    ['cluster-1', ['p-gf-pat'], ['a1']],
    ['cluster-2', ['p-gm-pat'], ['b1']],
    ['cluster-3', ['p-gf-mat', 'p-gm-mat'], ['c1']],
  ]);
  assert.equal(result.assignments[0].branches[0].side, 'paternal');
  assert.deepEqual(result.conflicts.map((c) => c.clusterId), ['cluster-4']);
  assert.deepEqual(result.conflicts[0].branches.map((b) => [b.branch.side, b.evidenceMatchIds]), [['maternal', ['d1']], ['paternal', ['d2']]]);
  assert.deepEqual(result.unknown, []);

  const bySide = RKDna.assignClustersToBranches(clusters, matches, (id) => branchOf(id)?.side);
  assert.deepEqual(bySide.assignments.map((a) => [a.clusterId, a.branches]), [['cluster-1', ['paternal']], ['cluster-2', ['paternal']], ['cluster-3', ['maternal']]]);
  assert.deepEqual(bySide.conflicts.map((c) => c.clusterId), ['cluster-4']);

  const none = RKDna.assignClustersToBranches(clusters, matches, () => null);
  assert.deepEqual(none.unknown, ['cluster-1', 'cluster-2', 'cluster-3', 'cluster-4']);
});

test('validation reports broken links and numbers, and warns on full-name aliases', () => {
  assert.deepEqual(RKDna.validateDna(dna, data), { errors: [], warnings: [] });

  const broken = {
    tests: [{ id: 't-1', personId: 'p-nobody', company: 'Firma' }],
    matches: [
      { id: 'm1', testId: 't-404', alias: 'Xaver Testovič', sharedCm: '120', sharedMatchIds: ['m-404'] },
      { id: 'm2', testId: 't-1', alias: 'modrá-sova', sharedCm: 80, longestCm: 90, knownRelation: { personId: 'p-nobody', commonAncestorIds: ['p-none'] } },
      { id: 'm3', testId: 't-1', alias: 'strýček od lesa', sharedCm: 60 },
      { id: 'm4', testId: 't-1', alias: 'Ota Ukázka Vzorová', sharedCm: 30 },
      { id: 'm4', testId: 't-1', alias: '', sharedCm: -1 },
    ],
  };
  const { errors, warnings } = RKDna.validateDna(broken, data);
  for (const expected of [/p-nobody/, /neznámý test t-404/, /m1: sharedCm/, /m-404/, /longestCm je větší/, /p-none/, /Duplicitní.*m4/, /chybí alias/]) {
    assert.ok(errors.some((error) => expected.test(error)), `missing error ${expected}`);
  }
  assert.ok(!errors.some((error) => /celé jméno/.test(error)), 'alias check never raises an error');
  assert.equal(warnings.filter((warning) => /celé jméno/.test(warning)).length, 2);
  assert.ok(warnings.some((warning) => warning.startsWith('m1:')) && warnings.some((warning) => warning.startsWith('m4:')));
  assert.ok(!warnings.some((warning) => warning.startsWith('m3:')), 'a descriptive alias with lower-case words is fine');
});
