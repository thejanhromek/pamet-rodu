(function registerResearchQueue(root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const model = isNode ? require('./model.js') : root.RKModel;
  const api = factory(model);
  if (isNode) module.exports = api;
  root.RKResearchQueue = api;
})(globalThis, function createResearchQueue(model) {
  'use strict';

  // Research queue computed from the data: every gap in the direct line
  // (unknown parent, missing birth, marriage or death, a link that is only a
  // hypothesis), the years worth searching, the register that should hold the
  // answer and a score that puts close generations and answerable questions
  // first. It is a suggestion list; the hand-written research tasks stay as
  // they are and are linked to matching items.

  const KIND_WEIGHT = { 'missing-parent': 50, 'weak-link': 40, 'missing-birth': 30, 'missing-marriage': 25, 'missing-death': 15 };
  const REGISTER_KIND = { 'missing-parent': 'N', 'weak-link': 'N', 'missing-birth': 'N', 'missing-marriage': 'O', 'missing-death': 'Z' };
  const KIND_LABELS = {
    'missing-parent': 'Neznámý rodič', 'weak-link': 'Neověřená vazba', 'missing-birth': 'Chybí narození',
    'missing-marriage': 'Chybí sňatek', 'missing-death': 'Chybí úmrtí',
  };
  const REGISTER_LABELS = { N: 'narozených', O: 'oddaných', Z: 'zemřelých' };
  const NAVIGATION_TYPES = new Set(['foreign-family-tree', 'census-index', 'parish-register-index', 'archive-index']);
  const STRENGTH = { hypothesis: 1, 'family-record': 2, supported: 3, verified: 4 };
  const SUBJECT_EXCLUDED = new Set(['death', 'burial', 'burial-site']);
  // Registers younger than about a century are not public; for recent
  // generations the family and civil certificates are the source.
  const PUBLIC_REGISTER_AGE = 100;
  const FAMILY_KNOWLEDGE_AGE = 75;

  function yearOf(entry) {
    const match = String(entry?.date || entry?.dateText || '').match(/(?<!\d)(1\d{3}|20\d{2})(?!\d)/);
    return match ? Number(match[1]) : null;
  }

  const verb = (person, male, female, neutral) => (person?.sex === 'male' ? male : person?.sex === 'female' ? female : neutral);

  function indexData(data) {
    const people = new Map((data.people || []).map((person) => [person.id, person]));
    const parentsOf = new Map();
    const childrenOf = new Map();
    const linkOf = new Map();
    for (const link of data.relationships || []) {
      if (link.type !== 'parent-child' || !people.has(link.from) || !people.has(link.to)) continue;
      parentsOf.set(link.to, [...(parentsOf.get(link.to) || []), link.from]);
      childrenOf.set(link.from, [...(childrenOf.get(link.from) || []), link.to]);
      linkOf.set(`${link.from}>${link.to}`, link);
    }
    const claimEvidence = new Map();
    for (const claim of data.claims || []) {
      if (claim.subjectType !== 'relationship') continue;
      const current = claimEvidence.get(claim.subjectId);
      if (!current || (STRENGTH[claim.evidence] || 0) > (STRENGTH[current] || 0)) claimEvidence.set(claim.subjectId, claim.evidence);
    }
    const sources = new Map((data.sources || []).map((source) => [source.id, source]));
    return { people, parentsOf, childrenOf, linkOf, claimEvidence, sources };
  }

  // Where the person's own records should be: birth place, then the place of
  // their own events, then the birth place of a child.
  function likelyPlaceId(data, index, personId) {
    const person = index.people.get(personId);
    if (person?.birth?.placeId) return person.birth.placeId;
    const own = (data.events || []).find((event) => (event.personIds || [])[0] === personId && event.placeId && !SUBJECT_EXCLUDED.has(event.type));
    if (own) return own.placeId;
    for (const childId of index.childrenOf.get(personId) || []) {
      const child = index.people.get(childId);
      if (child?.birth?.placeId) return child.birth.placeId;
    }
    const residence = (person?.residences || []).map((text) => (data.places || []).find((place) => text.includes(place.name))).find(Boolean);
    return residence?.id || null;
  }

  function childYears(index, personId) {
    return (index.childrenOf.get(personId) || []).map((id) => yearOf(index.people.get(id)?.birth)).filter(Boolean).sort((a, b) => a - b);
  }

  // Years in which the person was probably born.
  function birthRange(index, personId) {
    const person = index.people.get(personId);
    const known = yearOf(person?.birth);
    if (known) return [known, known];
    const children = childYears(index, personId);
    if (!children.length) return null;
    const first = children[0];
    const last = children[children.length - 1];
    return person?.sex === 'female' ? [Math.max(last - 45, first - 45), first - 16] : [last - 60, first - 18];
  }

  function matchRegisters(registers, placeId, kind, range) {
    if (!placeId || !range) return [];
    return (registers || [])
      .filter((register) => (register.placeIds || []).includes(placeId) && (register.kinds || []).includes(kind) && register.from <= range[1] && register.to >= range[0])
      .map((register) => ({ ...register, covers: register.from <= range[0] && register.to >= range[1] }))
      .sort((a, b) => Number(b.covers) - Number(a.covers) || Number(a.index) - Number(b.index) || a.from - b.from);
  }

  function hintSources(data, index, personId, linkId) {
    const ids = new Set();
    const person = index.people.get(personId);
    for (const id of person?.sourceIds || []) ids.add(id);
    for (const claim of data.claims || []) {
      if ((claim.subjectType === 'person' && claim.subjectId === personId) || (linkId && claim.subjectId === linkId)) for (const id of claim.sourceIds || []) ids.add(id);
    }
    return [...ids].filter((id) => NAVIGATION_TYPES.has(index.sources.get(id)?.type));
  }

  function score(kind, generation, item) {
    let value = KIND_WEIGHT[kind] / (1 + 0.15 * Math.max(0, generation - 1));
    if (item.recent) value -= 20;
    if (item.registers.length) value += item.registers[0].covers ? 25 : 15;
    if (item.yearRange && item.yearRange[1] - item.yearRange[0] <= 10) value += 10;
    if (item.hints.length) value += 10;
    if (!item.placeId) value -= 10;
    return Math.round(value);
  }

  function buildQueue(data, options = {}) {
    const egoId = options.egoId || data.meta?.defaultPersonId;
    const registers = options.registers || data.registers || [];
    const maxGeneration = options.maxGeneration ?? 10;
    const currentYear = (options.now || new Date()).getFullYear();
    const index = indexData(data);
    if (!index.people.has(egoId)) return [];
    const { numberOf } = model.getAhnentafel(data, egoId);
    const items = [];

    const push = (kind, personId, details) => {
      const number = numberOf.get(personId);
      const generation = Math.floor(Math.log2(number));
      const item = {
        id: `${kind}:${personId}${details.role ? `:${details.role}` : ''}`,
        kind, kindLabel: KIND_LABELS[kind], personId, number, generation,
        registerKind: REGISTER_KIND[kind], registerLabel: REGISTER_LABELS[REGISTER_KIND[kind]],
        hints: [], relatedTaskIds: [], ...details,
      };
      item.recent = Boolean(item.yearRange && item.yearRange[1] > currentYear - PUBLIC_REGISTER_AGE);
      item.registers = item.recent ? [] : matchRegisters(registers, item.placeId, item.registerKind, item.yearRange);
      if (item.recent) item.why = `${item.why} Matriky mladší než ${PUBLIC_REGISTER_AGE} let nejsou veřejné: zeptej se rodiny nebo hledej v rodném či oddacím listu.`;
      item.score = score(kind, generation, item);
      items.push(item);
    };

    for (const [personId, number] of numberOf) {
      const generation = Math.floor(Math.log2(number));
      if (generation > maxGeneration) continue;
      const person = index.people.get(personId);
      if (!person) continue;
      const parents = (index.parentsOf.get(personId) || []).map((id) => index.people.get(id));
      const father = parents.find((parent) => parent.sex === 'male');
      const mother = parents.find((parent) => parent.sex === 'female');
      const placeId = likelyPlaceId(data, index, personId);
      const born = birthRange(index, personId);
      const name = person.displayName;

      // Parents are named in the person's own baptism record.
      if (!father || !mother) {
        const role = !father && !mother ? 'parents' : !father ? 'father' : 'mother';
        const question = role === 'parents' ? `Kdo byli rodiče: ${name}?` : role === 'father' ? `Kdo byl otec: ${name}?` : `Kdo byla matka: ${name}?`;
        if (!(parents.length && role === 'parents')) {
          push('missing-parent', personId, {
            role, title: question, placeId, yearRange: born,
            why: born ? `Křestní zápis (${born[0] === born[1] ? born[0] : `asi ${born[0]}–${born[1]}`}) uvádí rodiče i jejich původ.` : 'Rok narození zatím neznáme; nejdřív ho odhadni ze sňatku nebo dětí.',
            hints: hintSources(data, index, personId),
          });
        }
      }

      for (const parent of parents) {
        if (born && born[0] > currentYear - FAMILY_KNOWLEDGE_AGE) break;
        const link = index.linkOf.get(`${parent.id}>${personId}`);
        const evidence = link?.evidence || index.claimEvidence.get(link?.id) || null;
        if (evidence && STRENGTH[evidence] >= STRENGTH.supported) continue;
        const parentWord = verb(parent, 'otcem', 'matkou', 'rodičem');
        push('weak-link', personId, {
          role: parent.id, title: `Ověřit, že ${parent.displayName} je ${parentWord}: ${name}`, placeId, yearRange: born, linkId: link?.id,
          evidence: evidence || 'neuvedeno',
          why: `Vazba je zatím ${evidence === 'hypothesis' ? 'jen hypotéza' : evidence === 'family-record' ? 'podle rodinného podání' : 'bez určené jistoty'}; křestní zápis ji potvrdí nebo vyvrátí.`,
          hints: hintSources(data, index, personId, link?.id),
        });
      }

      if (!yearOf(person.birth) && number > 1) {
        push('missing-birth', personId, {
          title: `Kdy a kde ${verb(person, 'se narodil', 'se narodila', 'se narodil(a)')} ${name}?`, placeId, yearRange: born,
          why: born ? `Podle dětí asi ${born[0]}–${born[1]}.` : 'Bez dalších údajů nelze odhadnout.', hints: hintSources(data, index, personId),
        });
      }

      if (father && mother) {
        const married = (data.events || []).some((event) => event.type === 'marriage' && (event.personIds || []).includes(father.id) && (event.personIds || []).includes(mother.id));
        const children = childYears(index, father.id).filter((year) => childYears(index, mother.id).includes(year));
        if (!married && !items.some((item) => item.kind === 'missing-marriage' && item.coupleKey === `${father.id}+${mother.id}`)) {
          const first = children[0] || yearOf(person.birth);
          const childPlace = person.birth?.placeId || placeId;
          push('missing-marriage', father.id, {
            coupleKey: `${father.id}+${mother.id}`, spouseId: mother.id,
            title: `Sňatek: ${father.displayName} a ${mother.displayName}`, placeId: childPlace,
            yearRange: first ? [first - 6, first] : null,
            why: first ? `První známé dítě ${first}; sňatek bývá rok až pět let před ním. Oddací zápis uvádí rodiče obou snoubenců.` : 'Oddací zápis uvádí rodiče obou snoubenců.',
            hints: [],
          });
        }
      }

      const birthYear = yearOf(person.birth);
      if (!person.death && birthYear && currentYear - birthYear > 100 && number > 1) {
        const lastSeen = Math.max(birthYear, ...childYears(index, personId));
        push('missing-death', personId, {
          title: `Kdy ${verb(person, 'zemřel', 'zemřela', 'zemřel(a)')} ${name}?`, placeId, yearRange: [lastSeen, Math.min(currentYear, birthYear + 100)],
          why: 'Úmrtní zápis uvádí věk, bydliště a často i pozůstalé.', hints: [],
        });
      }
    }

    for (const task of data.researchTasks || []) {
      if (task.status === 'closed') continue;
      for (const item of items) if ((task.personIds || []).includes(item.personId)) item.relatedTaskIds.push(task.id);
    }
    return items.filter((item) => item.number).sort((a, b) => b.score - a.score || a.number - b.number);
  }

  function summarize(items) {
    const byKind = {};
    for (const item of items) byKind[item.kind] = (byKind[item.kind] || 0) + 1;
    return { total: items.length, withRegister: items.filter((item) => item.registers.length).length, byKind };
  }

  return { buildQueue, summarize, KIND_LABELS, REGISTER_LABELS };
});
