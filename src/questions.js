(function registerQuestions(root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const model = isNode ? require('./model.js') : root.RKModel;
  const api = factory(model);
  if (isNode) module.exports = api;
  root.RKQuestions = api;
})(globalThis, function createQuestions(model) {
  'use strict';

  // Questions for a relative: what the chronicle does not know about them,
  // their parents and grandparents (and those generations' brothers and
  // sisters). Questions only name what is already in the chronicle; they
  // never reveal new facts about living people.

  const yearOf = (entry) => Number(String(entry?.date || entry?.dateText || '').match(/(?<!\d)(1\d{3}|20\d{2})(?!\d)/)?.[1]) || null;
  const verb = (person, male, female, neutral) => (person?.sex === 'male' ? male : person?.sex === 'female' ? female : neutral);

  // The person, up to two generations of ancestors and their siblings.
  function circle(data, personId) {
    const depths = model.getAncestorDepths(data, personId);
    const members = new Map();
    for (const [id, depth] of depths) {
      if (depth > 2) continue;
      members.set(id, depth);
      if (depth >= 1) for (const sibling of model.getFamily(data, id).siblings) if (!members.has(sibling.id)) members.set(sibling.id, depth);
    }
    return members;
  }

  function questionsFor(data, personId, { now = new Date(), limit = 14 } = {}) {
    const people = new Map((data.people || []).map((person) => [person.id, person]));
    if (!people.has(personId)) return [];
    const currentYear = now.getFullYear();
    const parentsOf = new Map();
    for (const link of data.relationships || []) if (link.type === 'parent-child') parentsOf.set(link.to, [...(parentsOf.get(link.to) || []), link.from]);
    const questions = [];
    const add = (person, kind, text, depth, extra = {}) => questions.push({ id: `${kind}:${person.id}${extra.key ? `:${extra.key}` : ''}`, kind, personId: person.id, depth, text, ...extra });
    const circleMembers = circle(data, personId);

    for (const [id, depth] of circleMembers) {
      const person = people.get(id);
      const name = person.displayName;
      const parents = (parentsOf.get(id) || []).map((parentId) => people.get(parentId)).filter(Boolean);
      const isAncestor = model.getAncestorDepths(data, personId).has(id);
      if (isAncestor && parents.length < 2) {
        const missing = !parents.length ? 'rodiče' : parents[0].sex === 'male' ? 'maminka' : parents[0].sex === 'female' ? 'tatínek' : 'druhý rodič';
        add(person, 'parents', missing === 'rodiče' ? `Víte, jak se jmenovali rodiče – ${name}? Odkud pocházeli?` : `Víte, jak se jmenoval${missing === 'maminka' ? 'a' : ''} ${missing} – ${name}?`, depth);
      }
      const born = yearOf(person.birth);
      if (!born || !person.birth?.placeId) {
        add(person, 'birth', !born ? `Kdy a kde ${verb(person, 'se narodil', 'se narodila', 'se narodil(a)')} ${name}?` : `Kde přesně ${verb(person, 'se narodil', 'se narodila', 'se narodil(a)')} ${name} (rok ${born})? Víte obec, případně číslo domu?`, depth);
      }
      if (!person.death && born && currentYear - born > 100) {
        add(person, 'death', `Kdy a kde ${verb(person, 'zemřel', 'zemřela', 'zemřel(a)')} ${name}? Víte, kde ${verb(person, 'je pohřben', 'je pohřbena', 'je pohřben(a)')}?`, depth);
      }
      if (!person.occupations?.length && born && currentYear - born > 18) {
        add(person, 'work', `Čím ${verb(person, 'se živil', 'se živila', 'se živil(a)')} ${name}?`, depth);
      }
      for (const claim of (data.claims || []).filter((item) => item.subjectType === 'person' && item.subjectId === id && item.evidence === 'hypothesis').slice(0, 2)) {
        add(person, 'hypothesis', `Kronika zatím jen předpokládá: „${claim.text.replace(/\s+/g, ' ').slice(0, 160)}“ Víte, jestli je to pravda?`, depth, { key: claim.id });
      }
    }
    // Unknown faces on photos of the circle.
    for (const media of data.media || []) {
      if (!(media.personIds || []).some((id) => circleMembers.has(id))) continue;
      const unknown = (media.regions || []).filter((region) => !region.personId);
      if (unknown.length) {
        const anchor = people.get((media.personIds || []).find((id) => circleMembers.has(id)));
        add(anchor, 'photo', `Na fotografii „${media.title}“ ${unknown.length === 1 ? 'je jedna osoba, kterou neznáme' : `jsou ${unknown.length} osoby, které neznáme`}. Poznáte ${unknown.length === 1 ? 'ji' : 'je'}?`, circleMembers.get(anchor.id), { key: media.id, mediaId: media.id });
      }
    }
    const order = { parents: 0, photo: 1, hypothesis: 2, birth: 3, death: 4, work: 5 };
    return questions.sort((a, b) => a.depth - b.depth || order[a.kind] - order[b.kind]).slice(0, limit);
  }

  return { questionsFor };
});
