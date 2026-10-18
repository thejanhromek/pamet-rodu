(function registerStats(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.RKStats = api;
})(globalThis, function createStats() {
  'use strict';

  // "Rod v číslech": simple figures per birth period (25-year bands): how long
  // people lived, how old they were at their first marriage, how many children
  // they had, how many children died young and what they did for a living.
  // Every figure carries `n`, the number of people it is based on, because
  // family data are thin and uneven.

  const BAND = 25;
  const yearOf = (entry) => Number(String(entry?.date || entry?.dateText || '').match(/(?<!\d)(1\d{3}|20\d{2})(?!\d)/)?.[1]) || null;

  function average(values) {
    return values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10 : null;
  }

  function computeStats(data, { band = BAND } = {}) {
    const people = data.people || [];
    const byId = new Map(people.map((person) => [person.id, person]));
    const childrenOf = new Map();
    for (const link of data.relationships || []) {
      if (link.type !== 'parent-child') continue;
      childrenOf.set(link.from, [...(childrenOf.get(link.from) || []), link.to]);
    }
    const firstMarriage = new Map();
    for (const event of data.events || []) {
      if (event.type !== 'marriage') continue;
      const year = yearOf(event);
      if (!year) continue;
      for (const id of event.personIds || []) if (!firstMarriage.has(id) || firstMarriage.get(id) > year) firstMarriage.set(id, year);
    }

    const bands = new Map();
    for (const person of people) {
      const born = yearOf(person.birth);
      if (!born) continue;
      const from = Math.floor(born / band) * band;
      if (!bands.has(from)) bands.set(from, { from, to: from + band - 1, people: [] });
      bands.get(from).people.push(person);
    }

    const result = [...bands.values()].sort((a, b) => a.from - b.from).map((entry) => {
      const lifespans = [];
      const marriageAges = { male: [], female: [] };
      const childCounts = [];
      let childDeaths = 0;
      let childrenBorn = 0;
      const occupations = new Map();
      for (const person of entry.people) {
        const born = yearOf(person.birth);
        const died = yearOf(person.death);
        if (died && died >= born) lifespans.push(died - born);
        const married = firstMarriage.get(person.id);
        if (married && married >= born && marriageAges[person.sex]) marriageAges[person.sex].push(married - born);
        const children = (childrenOf.get(person.id) || []).map((id) => byId.get(id)).filter(Boolean);
        if (children.length) childCounts.push(children.length);
        for (const occupation of person.occupations || []) {
          // Counted case-insensitively, shown as first written.
          const label = String(occupation).split(/[,(;]/)[0].trim();
          const key = label.toLocaleLowerCase('cs');
          if (!key) continue;
          const entry = occupations.get(key) || { label, count: 0 };
          entry.count += 1;
          occupations.set(key, entry);
        }
      }
      // Children born in this period: how many are recorded as dying before five.
      for (const person of entry.people) {
        childrenBorn += 1;
        const born = yearOf(person.birth);
        const died = yearOf(person.death);
        if (died !== null && died - born < 5) childDeaths += 1;
      }
      return {
        label: `${entry.from}–${entry.to}`,
        from: entry.from,
        to: entry.to,
        people: entry.people.length,
        lifespan: { average: average(lifespans), n: lifespans.length },
        marriageAge: {
          male: { average: average(marriageAges.male), n: marriageAges.male.length },
          female: { average: average(marriageAges.female), n: marriageAges.female.length },
        },
        children: { average: average(childCounts), n: childCounts.length },
        childDeaths: { count: childDeaths, of: childrenBorn },
        occupations: [...occupations.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'cs')).slice(0, 3).map((entry) => [entry.label, entry.count]),
      };
    });
    return { band, bands: result, peopleWithBirth: result.reduce((sum, entry) => sum + entry.people, 0), peopleTotal: people.length };
  }

  return { computeStats };
});
