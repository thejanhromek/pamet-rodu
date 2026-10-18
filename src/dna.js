(function registerDna(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.RKDna = api;
})(globalThis, function createDnaModule() {
  'use strict';

  // Research view of autosomal DNA matches from the optional research/dna.json
  // (researcher edition only). Nothing here knows any person: matches carry a
  // pseudonymous alias, links to the tree go through ids, and branch names come
  // from the caller.

  // Shared cM ranges: Blaine T. Bettinger, The Shared cM Project 4.0 tool v4
  // (March 2020), CC BY 4.0, values as published at
  // https://dnapainter.com/tools/sharedcmv4 (checked 2026-10-18).
  // avg = average shared cM, min–max = the range shown by the tool.
  const SOURCE = {
    title: 'The Shared cM Project 4.0 tool v4',
    author: 'Blaine T. Bettinger',
    date: '2020-03',
    license: 'CC BY 4.0',
    url: 'https://dnapainter.com/tools/sharedcmv4',
    projectUrl: 'https://thegeneticgenealogist.com/',
    checkedAt: '2026-10-18',
  };

  const REMOVED = ['', ', o generaci posunutý', ', o dvě generace posunutý', ', o tři generace posunutý'];
  const cousin = (degree, removed, half) =>
    `${half ? 'polorodý ' : ''}bratranec / sestřenice${degree > 1 ? ` z ${degree}. kolena` : ''}${REMOVED[removed]}`;

  // [key, label, avg, min, max]
  const RANGES = [
    ['parent', 'rodič', 3485, 2376, 3720],
    ['child', 'dítě', 3487, 2376, 3720],
    ['sibling', 'sourozenec', 2613, 1613, 3488],
    ['half-sibling', 'polorodý sourozenec', 1759, 1160, 2436],
    ['grandparent', 'prarodič', 1754, 984, 2462],
    ['grandchild', 'vnouče', 1754, 984, 2462],
    ['aunt-uncle', 'strýc / teta', 1741, 1201, 2282],
    ['niece-nephew', 'synovec / neteř', 1740, 1201, 2282],
    ['half-aunt-uncle', 'polorodý strýc / teta', 871, 492, 1315],
    ['half-niece-nephew', 'polorodý synovec / neteř', 871, 492, 1315],
    ['great-grandparent', 'praprarodič', 887, 485, 1486],
    ['great-grandchild', 'pravnouče', 887, 485, 1486],
    ['great-aunt-uncle', 'prastrýc / prateta', 850, 330, 1467],
    ['great-niece-nephew', 'prasynovec / praneteř', 850, 330, 1467],
    ['half-great-aunt-uncle', 'polorodý prastrýc / prateta', 431, 184, 668],
    ['half-great-niece-nephew', 'polorodý prasynovec / praneteř', 431, 184, 668],
    ['great-great-aunt-uncle', 'praprastrýc / praprateta', 420, 186, 713],
    ['great-great-niece-nephew', 'praprasynovec / prapraneteř', 420, 186, 713],
    ['half-great-great-aunt-uncle', 'polorodý praprastrýc / praprateta', 208, 103, 284],
    ['half-great-great-niece-nephew', 'polorodý praprasynovec / prapraneteř', 208, 103, 284],
    ['1c', cousin(1, 0), 866, 396, 1397],
    ['1c1r', cousin(1, 1), 433, 102, 980],
    ['1c2r', cousin(1, 2), 221, 33, 471],
    ['1c3r', cousin(1, 3), 117, 25, 238],
    ['half-1c', cousin(1, 0, true), 449, 156, 979],
    ['half-1c1r', cousin(1, 1, true), 224, 62, 469],
    ['half-1c2r', cousin(1, 2, true), 125, 16, 269],
    ['half-1c3r', cousin(1, 3, true), 60, 0, 120],
    ['2c', cousin(2, 0), 229, 41, 592],
    ['2c1r', cousin(2, 1), 122, 14, 353],
    ['2c2r', cousin(2, 2), 71, 0, 244],
    ['2c3r', cousin(2, 3), 51, 0, 154],
    ['half-2c', cousin(2, 0, true), 120, 10, 325],
    ['half-2c1r', cousin(2, 1, true), 66, 0, 190],
    ['half-2c2r', cousin(2, 2, true), 48, 0, 144],
    ['3c', cousin(3, 0), 73, 0, 234],
    ['3c1r', cousin(3, 1), 48, 0, 192],
    ['3c2r', cousin(3, 2), 36, 0, 166],
    ['3c3r', cousin(3, 3), 27, 0, 98],
    ['half-3c', cousin(3, 0, true), 48, 0, 168],
    ['half-3c1r', cousin(3, 1, true), 37, 0, 139],
    ['half-3c2r', cousin(3, 2, true), 27, 0, 78],
    ['4c', cousin(4, 0), 35, 0, 139],
    ['4c1r', cousin(4, 1), 28, 0, 126],
    ['4c2r', cousin(4, 2), 22, 0, 93],
    ['4c3r', cousin(4, 3), 19, 0, 60],
    ['5c', cousin(5, 0), 25, 0, 117],
    ['5c1r', cousin(5, 1), 21, 0, 80],
    ['5c2r', cousin(5, 2), 18, 0, 65],
    ['5c3r', cousin(5, 3), 13, 0, 30],
  ].map(([key, label, avg, min, max]) => Object.freeze({ key, label, avg, min, max }));

  const isCm = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;

  // Relationships whose published range contains the value, closest average first.
  function relationshipCandidates(cm) {
    if (!isCm(cm)) return [];
    return RANGES
      .filter((range) => cm >= range.min && cm <= range.max)
      .map((range, order) => ({ range, order, distance: Math.abs(cm - range.avg) }))
      .sort((a, b) => a.distance - b.distance || a.order - b.order)
      .map(({ range }) => ({ ...range }));
  }

  // Shared-match graph restricted to the given ids; links count in both directions.
  function sharedGraph(matches, ids) {
    const graph = new Map([...ids].map((id) => [id, new Set()]));
    for (const match of matches) {
      if (!graph.has(match.id)) continue;
      for (const other of match.sharedMatchIds || []) {
        if (other === match.id || !graph.has(other)) continue;
        graph.get(match.id).add(other);
        graph.get(other).add(match.id);
      }
    }
    return graph;
  }

  // Leeds method: matches within [minCm, maxCm], strongest first. An uncoloured
  // match with shared matches starts a new cluster together with its uncoloured
  // shared matches; one whose shared matches are already coloured joins that
  // cluster. Matches that link two or more clusters are reported as overlaps
  // (both sides, a couple, or endogamy) and left out of the clusters. Matches
  // without shared matches in range stay unassigned.
  function leedsClusters(matches, options = {}) {
    const minCm = options.minCm ?? 90;
    const maxCm = options.maxCm ?? 400;
    const pool = (matches || [])
      .filter((match) => match && match.id && isCm(match.sharedCm) && match.sharedCm >= minCm && match.sharedCm <= maxCm)
      .sort((a, b) => b.sharedCm - a.sharedCm || String(a.id).localeCompare(String(b.id)));
    const graph = sharedGraph(pool, pool.map((match) => match.id));
    const clusterOf = new Map();
    const clusters = [];
    const clustersAround = (id) => [...new Set([...graph.get(id)].filter((other) => clusterOf.has(other)).map((other) => clusterOf.get(other)))];

    for (const { id } of pool) {
      if (clusterOf.has(id) || !graph.get(id).size) continue;
      const around = clustersAround(id);
      if (around.length === 1) {
        clusterOf.set(id, around[0]);
        continue;
      }
      if (around.length > 1) continue;
      const cluster = { id: `cluster-${clusters.length + 1}`, seedId: id, matchIds: [] };
      clusters.push(cluster);
      for (const member of [id, ...graph.get(id)]) if (!clusterOf.has(member)) clusterOf.set(member, cluster.id);
    }

    // A link between two clusters marks one end as the overlap: the match with
    // the smaller share of its links inside its own cluster, then the weaker one.
    const order = new Map(pool.map((match, index) => [match.id, index]));
    const ownShare = (id) => [...graph.get(id)].filter((other) => clusterOf.get(other) === clusterOf.get(id)).length / graph.get(id).size;
    const touched = new Map();
    const touch = (id, clusterIds) => {
      if (!touched.has(id)) touched.set(id, new Set());
      for (const clusterId of clusterIds) touched.get(id).add(clusterId);
    };
    for (const { id } of pool) {
      if (!clusterOf.has(id)) {
        const around = clustersAround(id);
        if (around.length > 1) touch(id, around);
        continue;
      }
      for (const other of graph.get(id)) {
        if (!clusterOf.has(other) || clusterOf.get(other) === clusterOf.get(id)) continue;
        const flagged = ownShare(id) - ownShare(other) || order.get(other) - order.get(id);
        if (flagged < 0) touch(id, [clusterOf.get(id), clusterOf.get(other)]);
      }
    }
    const overlaps = pool.filter((match) => touched.has(match.id))
      .map((match) => ({ matchId: match.id, clusterIds: clusters.map((cluster) => cluster.id).filter((clusterId) => touched.get(match.id).has(clusterId)) }));
    for (const overlap of overlaps) clusterOf.delete(overlap.matchId);
    for (const { id } of pool) if (clusterOf.has(id)) clusters.find((cluster) => cluster.id === clusterOf.get(id)).matchIds.push(id);

    const overlapIds = new Set(overlaps.map((overlap) => overlap.matchId));
    return {
      clusters: clusters.filter((cluster) => cluster.matchIds.length),
      unassigned: pool.map((match) => match.id).filter((id) => !clusterOf.has(id) && !overlapIds.has(id)),
      overlaps,
    };
  }

  const branchKey = (branch) => (typeof branch === 'string' ? branch : branch.key || [branch.side, branch.ancestorId].filter(Boolean).join(':') || JSON.stringify(branch));

  // A cluster gets the branch of the common ancestors documented for its matches.
  // branchOf(ancestorId) returns a string or an object such as
  // { side: 'paternal', ancestorId, label }; null/undefined means unknown.
  // Each match with known ancestors narrows the cluster to the branches it
  // supports (a couple gives two grandparents of one side); when matches leave
  // no common branch, the cluster is returned as a conflict instead.
  function assignClustersToBranches(clusters, matches, branchOf) {
    const byId = new Map((matches || []).map((match) => [match.id, match]));
    const assignments = [];
    const conflicts = [];
    const unknown = [];
    for (const cluster of clusters || []) {
      const found = new Map();
      let common = null;
      for (const matchId of cluster.matchIds || []) {
        const keys = new Set();
        for (const ancestorId of byId.get(matchId)?.knownRelation?.commonAncestorIds || []) {
          const branch = branchOf(ancestorId);
          if (branch == null) continue;
          const key = branchKey(branch);
          if (keys.has(key)) continue;
          keys.add(key);
          if (!found.has(key)) found.set(key, { branch, evidenceMatchIds: [] });
          found.get(key).evidenceMatchIds.push(matchId);
        }
        if (keys.size) common = common ? new Set([...common].filter((key) => keys.has(key))) : keys;
      }
      if (!found.size) unknown.push(cluster.id);
      else if (common.size) {
        const supported = [...common].map((key) => found.get(key));
        assignments.push({
          clusterId: cluster.id,
          branches: supported.map((entry) => entry.branch),
          evidenceMatchIds: [...new Set(supported.flatMap((entry) => entry.evidenceMatchIds))],
        });
      } else conflicts.push({ clusterId: cluster.id, branches: [...found.values()] });
    }
    return { assignments, conflicts, unknown };
  }

  // Two or more capitalised words look like a real full name rather than a pseudonym.
  const FULL_NAME = /^\p{Lu}[\p{Ll}'’-]+(?:\s+\p{Lu}[\p{Ll}'’-]+)+$/u;

  function validateDna(dna, data) {
    const errors = [];
    const warnings = [];
    const people = new Set((data?.people || []).map((person) => person.id));
    const tests = dna?.tests || [];
    const matches = dna?.matches || [];
    if (!Array.isArray(tests) || !Array.isArray(matches)) return { errors: ['tests a matches musí být pole'], warnings };

    const testIds = new Set();
    for (const test of tests) {
      if (!test?.id || testIds.has(test.id)) errors.push(`Duplicitní nebo chybějící id testu: ${test?.id}`);
      testIds.add(test?.id);
      if (!people.has(test?.personId)) errors.push(`${test?.id}: neznámá osoba ${test?.personId}`);
      if (!test?.company) errors.push(`${test?.id}: chybí company`);
    }

    const matchIds = new Set(matches.map((match) => match?.id));
    const seen = new Set();
    for (const match of matches) {
      const id = match?.id;
      if (!id || seen.has(id)) errors.push(`Duplicitní nebo chybějící id shody: ${id}`);
      seen.add(id);
      if (!testIds.has(match?.testId)) errors.push(`${id}: neznámý test ${match?.testId}`);
      if (!isCm(match?.sharedCm)) errors.push(`${id}: sharedCm musí být nezáporné číslo`);
      if (match?.longestCm != null && !isCm(match.longestCm)) errors.push(`${id}: longestCm musí být nezáporné číslo`);
      if (isCm(match?.longestCm) && isCm(match?.sharedCm) && match.longestCm > match.sharedCm) errors.push(`${id}: longestCm je větší než sharedCm`);
      if (match?.segments != null && !(Number.isInteger(match.segments) && match.segments >= 0)) errors.push(`${id}: segments musí být nezáporné celé číslo`);
      const alias = typeof match?.alias === 'string' ? match.alias.trim() : '';
      if (!alias) errors.push(`${id}: chybí alias`);
      else if (FULL_NAME.test(alias)) warnings.push(`${id}: alias „${alias}“ vypadá jako celé jméno; použij pseudonym`);
      for (const other of match?.sharedMatchIds || []) if (!matchIds.has(other)) errors.push(`${id}: neznámá sdílená shoda ${other}`);
      const relation = match?.knownRelation;
      if (relation) {
        if (relation.personId != null && !people.has(relation.personId)) errors.push(`${id}: neznámá osoba ${relation.personId}`);
        for (const ancestorId of relation.commonAncestorIds || []) if (!people.has(ancestorId)) errors.push(`${id}: neznámý společný předek ${ancestorId}`);
        if (relation.relationship != null && !RANGES.some((range) => range.key === relation.relationship)) warnings.push(`${id}: vztah ${relation.relationship} není v tabulce Shared cM Project`);
      }
    }
    return { errors, warnings };
  }

  return { SOURCE, RANGES, relationshipCandidates, leedsClusters, assignClustersToBranches, validateDna };
});
