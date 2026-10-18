(function registerModel(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.RKModel = api;
})(globalThis, function createModel() {
  'use strict';

  const COLLECTIONS = [
    'people',
    'relationships',
    'events',
    'places',
    'claims',
    'sources',
    'media',
    'researchTasks',
    'changelog',
  ];
  const EVIDENCE_STATES = new Set(['verified', 'supported', 'family-record', 'hypothesis']);

  function collectIds(items, collection, errors) {
    const ids = new Set();
    for (const item of items) {
      if (ids.has(item.id)) errors.push({ code: 'DUPLICATE_ID', collection, id: item.id });
      ids.add(item.id);
    }
    return ids;
  }

  function validateDataset(data) {
    const errors = [];
    const ids = {};

    for (const collection of COLLECTIONS) {
      ids[collection] = collectIds(data[collection] || [], collection, errors);
    }

    for (const relationship of data.relationships || []) {
      if (!ids.people.has(relationship.from) || !ids.people.has(relationship.to)) {
        errors.push({ code: 'RELATIONSHIP_PERSON_MISSING', id: relationship.id });
      }
      for (const sourceId of relationship.sourceIds || []) {
        if (!ids.sources.has(sourceId)) errors.push({ code: 'RELATIONSHIP_SOURCE_MISSING', id: relationship.id, sourceId });
      }
    }

    for (const claim of data.claims || []) {
      if (!EVIDENCE_STATES.has(claim.evidence)) {
        errors.push({ code: 'CLAIM_EVIDENCE_INVALID', id: claim.id, evidence: claim.evidence });
      }
      for (const sourceId of claim.sourceIds || []) {
        if (!ids.sources.has(sourceId)) {
          errors.push({ code: 'CLAIM_SOURCE_MISSING', id: claim.id, sourceId });
        }
      }
    }

    for (const event of data.events || []) {
      for (const personId of event.personIds || []) {
        if (!ids.people.has(personId)) errors.push({ code: 'EVENT_PERSON_MISSING', id: event.id, personId });
      }
      if (event.placeId && !ids.places.has(event.placeId)) errors.push({ code: 'EVENT_PLACE_MISSING', id: event.id, placeId: event.placeId });
      if (event.fromPlaceId && !ids.places.has(event.fromPlaceId)) errors.push({ code: 'EVENT_PLACE_MISSING', id: event.id, placeId: event.fromPlaceId });
      for (const sourceId of event.sourceIds || []) {
        if (!ids.sources.has(sourceId)) errors.push({ code: 'EVENT_SOURCE_MISSING', id: event.id, sourceId });
      }
    }

    for (const media of data.media || []) {
      for (const personId of media.personIds || []) {
        if (!ids.people.has(personId)) errors.push({ code: 'MEDIA_PERSON_MISSING', id: media.id, personId });
      }
      if (media.sourceId && !ids.sources.has(media.sourceId)) errors.push({ code: 'MEDIA_SOURCE_MISSING', id: media.id, sourceId: media.sourceId });
    }

    for (const task of data.researchTasks || []) {
      for (const personId of task.personIds || []) {
        if (!ids.people.has(personId)) errors.push({ code: 'RESEARCH_PERSON_MISSING', id: task.id, personId });
      }
      for (const sourceId of task.sourceIds || []) {
        if (!ids.sources.has(sourceId)) errors.push({ code: 'RESEARCH_SOURCE_MISSING', id: task.id, sourceId });
      }
    }

    return errors;
  }

  function buildIndexes(data) {
    return Object.fromEntries(
      COLLECTIONS.map((collection) => [
        collection,
        new Map((data[collection] || []).map((item) => [item.id, item])),
      ]),
    );
  }

  function getPerson(data, id) {
    return buildIndexes(data).people.get(id) || null;
  }

  function uniquePeople(people) {
    return [...new Map(people.filter(Boolean).map((person) => [person.id, person])).values()];
  }

  function sortPeople(people) {
    return uniquePeople(people).sort((a, b) => a.displayName.localeCompare(b.displayName, 'cs'));
  }

  function getFamily(data, id, options = {}) {
    const focus = getPerson(data, id);
    if (!focus) {
      return { focus: null, parents: [], partners: [], coParents: [], siblings: [], children: [], all: [] };
    }

    const people = buildIndexes(data).people;
    const parentLinks = (data.relationships || []).filter((relationship) => relationship.type === 'parent-child');
    const parentIds = parentLinks.filter((relationship) => relationship.to === id).map((relationship) => relationship.from);
    const childIds = parentLinks.filter((relationship) => relationship.from === id).map((relationship) => relationship.to);
    const partnerIds = (data.relationships || [])
      .filter((relationship) => relationship.type === 'spouse' && (relationship.from === id || relationship.to === id))
      .map((relationship) => (relationship.from === id ? relationship.to : relationship.from));
    const inferredSiblingIds = parentLinks
      .filter((relationship) => parentIds.includes(relationship.from) && relationship.to !== id)
      .map((relationship) => relationship.to);
    const explicitSiblingIds = (data.relationships || [])
      .filter((relationship) => relationship.type === 'sibling' && (relationship.from === id || relationship.to === id))
      .map((relationship) => (relationship.from === id ? relationship.to : relationship.from));

    const parents = sortPeople(parentIds.map((personId) => people.get(personId)));
    const partners = sortPeople(partnerIds.map((personId) => people.get(personId)));
    const siblings = sortPeople([...inferredSiblingIds, ...explicitSiblingIds].map((personId) => people.get(personId)));
    const children = sortPeople(childIds.map((personId) => people.get(personId)));
    // Other parents of the focus person's children, when no spouse record links them.
    const coParents = sortPeople(parentLinks
      .filter((relationship) => childIds.includes(relationship.to) && relationship.from !== id && !partnerIds.includes(relationship.from))
      .map((relationship) => people.get(relationship.from)));
    const all = uniquePeople([
      focus,
      ...parents,
      ...partners,
      ...children,
      ...(options.extended ? siblings : []),
    ]);

    return {
      focus,
      parents,
      partners,
      coParents,
      siblings,
      children,
      all,
    };
  }

  // Loaded lazily: RKNames registers after this module in the browser.
  function namesModule() {
    if (globalThis.RKNames) return globalThis.RKNames;
    if (typeof module === 'object' && module.exports) {
      try { return require('./names.js'); } catch (_) { return null; }
    }
    return null;
  }

  function normalizeText(value = '') {
    return String(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('cs')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function personSearchText(person, placeIndex) {
    const birthPlace = person.birth?.placeId ? placeIndex.get(person.birth.placeId)?.name : '';
    return normalizeText([
      person.displayName,
      ...(person.aliases || []),
      ...(person.surnames || []),
      ...(person.branch || []),
      ...(person.occupations || []),
      ...(person.residences || []),
      ...(person.notes || []),
      birthPlace,
    ].join(' '));
  }

  function searchDataset(data, query = '', filters = {}) {
    const needle = normalizeText(query);
    const tokens = needle.split(' ').filter(Boolean);
    const indexes = buildIndexes(data);
    const people = (data.people || []).filter((person) => {
      if (filters.lineage && person.lineage !== filters.lineage) return false;
      if (filters.branch && !(person.branch || []).includes(filters.branch)) return false;
      const haystack = personSearchText(person, indexes.places);
      return tokens.length === 0 || tokens.every((token) => haystack.includes(token));
    });
    return { people: sortPeople(people) };
  }

  function getEvidenceSummary(data, subjectType = 'person', subjectId) {
    if (subjectId === undefined) {
      subjectId = subjectType;
      subjectType = 'person';
    }
    const counts = Object.fromEntries([...EVIDENCE_STATES].map((state) => [state, 0]));
    const sourceIds = new Set();
    const claims = (data.claims || []).filter((claim) => (
      claim.subjectType === subjectType && claim.subjectId === subjectId
    ));
    for (const claim of claims) {
      if (Object.hasOwn(counts, claim.evidence)) counts[claim.evidence] += 1;
      for (const sourceId of claim.sourceIds || []) sourceIds.add(sourceId);
    }
    if (subjectType === 'person') {
      const person = getPerson(data, subjectId);
      for (const sourceId of person?.sourceIds || []) sourceIds.add(sourceId);
    }
    return { counts, totalClaims: claims.length, uniqueSourceCount: sourceIds.size };
  }

  function personMatchesPlace(person, placeId, placeIndex) {
    if (!placeId) return true;
    if (person.birth?.placeId === placeId || person.death?.placeId === placeId) return true;
    const place = placeIndex.get(placeId);
    if (!place) return false;
    const placeName = normalizeText(place.name);
    return (person.residences || []).some((residence) => normalizeText(residence).includes(placeName));
  }

  function personBirthYear(person) {
    const value = person.birth?.date || person.birth?.dateText || '';
    const match = String(value).match(/\b(\d{4})\b/);
    return match ? Number(match[1]) : null;
  }

  function filterPeople(data, filters = {}) {
    const indexes = buildIndexes(data);
    const query = normalizeText(filters.query || '');
    const tokens = query.split(' ').filter(Boolean);
    const people = (data.people || []).filter((person) => {
      if (filters.lineage && person.lineage !== filters.lineage) return false;
      if (filters.branch && !(person.branch || []).includes(filters.branch)) return false;
      if (!personMatchesPlace(person, filters.placeId || filters.place, indexes.places)) return false;
      const year = personBirthYear(person);
      if (filters.fromYear && (year === null || year < Number(filters.fromYear))) return false;
      if (filters.toYear && (year === null || year > Number(filters.toYear))) return false;
      if (filters.evidenceAvailability && filters.evidenceAvailability !== 'any') {
        const summary = getEvidenceSummary(data, 'person', person.id);
        const available = summary.uniqueSourceCount > 0 || summary.totalClaims > 0;
        if (filters.evidenceAvailability === 'available' && !available) return false;
        if (['missing', 'none'].includes(filters.evidenceAvailability) && available) return false;
      }
      const haystack = personSearchText(person, indexes.places);
      return tokens.length === 0 || tokens.every((token) => haystack.includes(token));
    });
    const sort = filters.sort || 'name';
    return people.sort((a, b) => {
      if (sort === 'birth') return (personBirthYear(a) ?? Infinity) - (personBirthYear(b) ?? Infinity) || a.displayName.localeCompare(b.displayName, 'cs');
      if (sort === 'branch') return (a.branch?.[0] || '').localeCompare(b.branch?.[0] || '', 'cs') || a.displayName.localeCompare(b.displayName, 'cs');
      return a.displayName.localeCompare(b.displayName, 'cs');
    });
  }

  function matchReason(fields, tokens) {
    const matched = fields.find((field) => tokens.some((token) => normalizeText(field.value).includes(token)));
    return matched ? `Shoda v poli ${matched.label}` : 'Shoda v záznamu';
  }

  function globalSearch(data, query = '') {
    const needle = normalizeText(query);
    const tokens = needle.split(' ').filter(Boolean);
    const matches = (items, fields) => (items || []).filter((item) => {
      if (!tokens.length) return true;
      return fields(item).some((field) => tokens.every((token) => normalizeText(field.value).includes(token)));
    }).map((item) => {
      const itemFields = fields(item);
      return { ...item, matchReason: matchReason(itemFields, tokens) };
    });
    const indexes = buildIndexes(data);
    const groups = {
      people: matches(data.people, (person) => [
        { label: 'jméno', value: person.displayName },
        { label: 'varianta', value: (person.aliases || []).join(' ') },
        { label: 'povolání', value: (person.occupations || []).join(' ') },
        { label: 'bydliště', value: (person.residences || []).join(' ') },
        { label: 'místo narození', value: indexes.places.get(person.birth?.placeId)?.name || '' },
      ]),
      places: matches(data.places, (place) => [
        { label: 'místo', value: `${place.name} ${place.region || ''} ${place.country || ''}` },
        { label: 'historický název', value: (place.historical?.historicalNames || []).map((entry) => entry.name).join(' ') },
      ]),
      events: matches(data.events, (event) => [{ label: 'událost', value: `${event.title} ${event.dateText || ''} ${event.type || ''} ${indexes.places.get(event.placeId)?.name || ''} ${(event.personIds || []).map((id) => indexes.people.get(id)?.displayName || '').join(' ')}` }]),
      claims: matches(data.claims, (claim) => [{ label: 'tvrzení', value: `${claim.text} ${claim.reasoning || ''}` }]),
      sources: matches(data.sources, (source) => [{ label: 'pramen', value: `${source.title} ${source.origin || ''} ${(source.transcriptionLines || []).join(' ')}` }]),
      media: matches(data.media, (media) => [{ label: 'médium', value: `${media.title} ${media.kind || ''} ${media.file || ''}` }]),
      researchTasks: matches(data.researchTasks, (task) => [{ label: 'úkol', value: `${task.title} ${task.expectedPayoff || ''} ${task.nextAction || ''}` }]),
    };
    // Register spellings: "Kadletz" or "Joannes" still find Kadlec or Jan.
    const names = namesModule();
    if (names && tokens.length && tokens.every((token) => token.length >= 3)) {
      const found = new Set(groups.people.map((person) => person.id));
      for (const person of data.people || []) {
        if (found.has(person.id)) continue;
        const exact = normalizeText(`${person.displayName} ${(person.aliases || []).join(' ')}`);
        if (!tokens.every((token) => exact.includes(token) || names.tokenMatchesPerson(token, person))) continue;
        const fuzzyToken = tokens.find((token) => !exact.includes(token));
        const variant = names.matchingVariant(fuzzyToken, person);
        groups.people.push({ ...person, matchReason: `Podobné jméno${variant ? ` (${variant})` : ''}`, fuzzy: true });
      }
    }
    const results = Object.entries(groups).flatMap(([type, items]) => items.map((item) => ({ type, item, matchReason: item.matchReason })));
    return { query, groups, results };
  }

  function getDirectLine(data, focusId) {
    const people = buildIndexes(data).people;
    const parentLinks = (data.relationships || []).filter((relationship) => relationship.type === 'parent-child');
    const queue = [focusId];
    const visited = new Set();
    const result = [];

    while (queue.length) {
      const currentId = queue.shift();
      if (visited.has(currentId)) continue;
      visited.add(currentId);
      const person = people.get(currentId);
      if (!person) continue;
      if (currentId === focusId || ['self', 'direct'].includes(person.lineage)) result.push(person);
      for (const relationship of parentLinks.filter((link) => link.to === currentId)) {
        const parent = people.get(relationship.from);
        if (parent && ['self', 'direct'].includes(parent.lineage)) queue.push(parent.id);
      }
    }

    return result;
  }

  function eventYear(event) {
    const match = String(event?.date || event?.dateText || '').match(/\b(\d{4})\b/);
    return match ? Number(match[1]) : null;
  }

  function eventMatchesBranch(data, event, branch) {
    if (!branch) return true;
    return (event.personIds || []).some((personId) => (getPerson(data, personId)?.branch || []).includes(branch));
  }

  function filterTimelineEvents(data, filters = {}) {
    const indexes = buildIndexes(data);
    const query = normalizeText(filters.query || '');
    return (data.events || []).filter((event) => {
      if (filters.type && event.type !== filters.type) return false;
      if (filters.personId && !(event.personIds || []).includes(filters.personId)) return false;
      if (filters.placeId && event.placeId !== filters.placeId && event.fromPlaceId !== filters.placeId) return false;
      if (filters.evidence && event.evidence !== filters.evidence) return false;
      if (filters.branch && !eventMatchesBranch(data, event, filters.branch)) return false;
      if (query && !normalizeText(`${event.title || ''} ${event.dateText || ''} ${indexes.places.get(event.placeId)?.name || ''} ${(event.personIds || []).map((id) => indexes.people.get(id)?.displayName || '').join(' ')}`).includes(query)) return false;
      const year = eventYear(event);
      if (filters.fromYear && (year === null || year < Number(filters.fromYear))) return false;
      if (filters.toYear && (year === null || year > Number(filters.toYear))) return false;
      return true;
    });
  }

  function filterEvents(data, filters = {}) {
    return filterTimelineEvents(data, filters);
  }

  function filterPlaces(data, filters = {}) {
    const query = normalizeText(filters.query || '');
    return (data.places || []).filter((place) => {
      if (query && !normalizeText(`${place.name || ''} ${place.region || ''} ${place.country || ''}`).includes(query)) return false;
      if (filters.branch) {
        const connections = getPlaceConnections(data, place.id);
        if (!connections.people.some((person) => (person.branch || []).includes(filters.branch))) return false;
      }
      if (filters.connectionType) {
        const connections = getPlaceConnections(data, place.id);
        if (filters.connectionType === 'people' && !connections.people.length) return false;
        if (filters.connectionType === 'events' && !connections.events.length) return false;
        if (filters.connectionType === 'migration' && !connections.events.some((event) => event.type === 'migration' && event.fromPlaceId && event.placeId)) return false;
      }
      return true;
    });
  }

  function filterClaims(data, filters = {}) {
    const query = normalizeText(filters.query || '');
    return (data.claims || []).filter((claim) => {
      if (filters.evidence && claim.evidence !== filters.evidence) return false;
      if (filters.subjectType && claim.subjectType !== filters.subjectType) return false;
      if (filters.sourceId && !(claim.sourceIds || []).includes(filters.sourceId)) return false;
      if (query && !normalizeText(`${claim.text || ''} ${claim.reasoning || ''}`).includes(query)) return false;
      if (filters.branch) {
        const person = claim.subjectType === 'person' ? getPerson(data, claim.subjectId) : null;
        if (!(person?.branch || []).includes(filters.branch)) return false;
      }
      return true;
    });
  }

  function filterSources(data, filters = {}) {
    const query = normalizeText(filters.query || '');
    return (data.sources || []).filter((source) => {
      if (filters.sourceType && !String(filters.sourceType).split(',').includes(source.type)) return false;
      if (filters.type && source.type !== filters.type) return false;
      if (query && !normalizeText(`${source.title || ''} ${source.origin || ''} ${(source.transcriptionLines || []).join(' ')} ${source.reliabilityNote || ''}`).includes(query)) return false;
      return true;
    });
  }

  function filterMedia(data, filters = {}) {
    const query = normalizeText(filters.query || '');
    return (data.media || []).filter((media) => {
      if (filters.kind && media.kind !== filters.kind) return false;
      if (filters.sourceId && media.sourceId !== filters.sourceId) return false;
      if (filters.personId && !(media.personIds || []).includes(filters.personId)) return false;
      if (query && !normalizeText(`${media.title || ''} ${media.file || ''} ${media.kind || ''}`).includes(query)) return false;
      return true;
    });
  }

  function filterResearchTasks(data, filters = {}) {
    const query = normalizeText(filters.query || '');
    const people = buildIndexes(data).people;
    return (data.researchTasks || []).filter((task) => {
      const status = task.status === 'in_progress' ? 'in-progress' : task.status;
      if (filters.status && status !== filters.status) return false;
      if (filters.priority && String(task.priority) !== String(filters.priority)) return false;
      if (filters.personId && !(task.personIds || []).includes(filters.personId)) return false;
      if (query && !normalizeText(`${task.title || ''} ${task.expectedPayoff || ''} ${task.nextAction || ''}`).includes(query)) return false;
      if (filters.branch) {
        const taskBranches = new Set(task.branch || []);
        for (const personId of task.personIds || []) for (const branch of people.get(personId)?.branch || []) taskBranches.add(branch);
        if (!taskBranches.has(filters.branch)) return false;
      }
      return true;
    });
  }

  function getClaimsForSubject(data, subjectType, subjectId) {
    return (data.claims || []).filter(
      (claim) => claim.subjectType === subjectType && claim.subjectId === subjectId,
    );
  }

  function getPlaceConnections(data, placeId) {
    const place = buildIndexes(data).places.get(placeId) || null;
    const placeName = normalizeText(place?.name || '');
    const placeBase = placeName.split(/\s+(?:u|nad)\s+/)[0];
    const people = sortPeople((data.people || []).filter((person) => {
      if (person.birth?.placeId === placeId || person.death?.placeId === placeId) return true;
      return placeName && (person.residences || []).some((residence) => {
        const normalizedResidence = normalizeText(residence);
        return normalizedResidence.includes(placeName) || (placeBase.length >= 5 && normalizedResidence.includes(placeBase));
      });
    }));
    const events = filterEvents(data, { placeId });
    return { place, people, events };
  }

  function kinshipIndex(data) {
    const parents = new Map();
    const spouses = new Map();
    const add = (map, key, value) => map.set(key, new Set([...(map.get(key) || []), value]));
    for (const relationship of data.relationships || []) {
      if (relationship.type === 'parent-child') add(parents, relationship.to, relationship.from);
      if (relationship.type === 'spouse') { add(spouses, relationship.from, relationship.to); add(spouses, relationship.to, relationship.from); }
    }
    // Parents of a shared child count as partners for in-law wording.
    for (const childParents of parents.values()) {
      for (const a of childParents) for (const b of childParents) if (a !== b) add(spouses, a, b);
    }
    return { parents, spouses };
  }

  function ancestorDepths(index, id) {
    const depths = new Map([[id, 0]]);
    const queue = [id];
    while (queue.length) {
      const current = queue.shift();
      for (const parent of index.parents.get(current) || []) {
        if (depths.has(parent)) continue;
        depths.set(parent, depths.get(current) + 1);
        queue.push(parent);
      }
    }
    return depths;
  }

  function bloodRelation(index, egoId, personId) {
    const egoAncestors = ancestorDepths(index, egoId);
    const personAncestors = ancestorDepths(index, personId);
    let best = null;
    for (const [ancestorId, up] of egoAncestors) {
      if (!personAncestors.has(ancestorId)) continue;
      const down = personAncestors.get(ancestorId);
      if (!best || up + down < best.up + best.down || (up + down === best.up + best.down && up < best.up)) best = { up, down, commonAncestorId: ancestorId };
    }
    return best;
  }

  function getAncestorDepths(data, id) {
    return ancestorDepths(kinshipIndex(data), id);
  }

  // Ahnentafel (Kekule) numbering shared by the printed book and the pedigree:
  // the person is 1, a father of n is 2n and a mother 2n + 1. A person reached
  // twice keeps the lower number; a parent of unknown sex takes a free slot.
  function getAhnentafel(data, egoId) {
    const people = new Map((data.people || []).map((person) => [person.id, person]));
    const parentsOf = new Map();
    for (const link of data.relationships || []) {
      if (link.type !== 'parent-child' || !people.has(link.from)) continue;
      parentsOf.set(link.to, [...(parentsOf.get(link.to) || []), link.from]);
    }
    const numberOf = new Map([[egoId, 1]]);
    const idOf = new Map([[1, egoId]]);
    const queue = [egoId];
    while (queue.length) {
      const childId = queue.shift();
      const childNumber = numberOf.get(childId);
      const parents = [...new Set(parentsOf.get(childId) || [])].map((id) => people.get(id));
      const father = parents.find((person) => person.sex === 'male');
      const mother = parents.find((person) => person.sex === 'female' && person !== father);
      const rest = parents.filter((person) => person !== father && person !== mother);
      const slots = [[father, childNumber * 2], [mother, childNumber * 2 + 1]];
      for (const person of rest) {
        const free = slots.find(([taken]) => !taken);
        if (free) free[0] = person;
      }
      for (const [person, number] of slots) {
        if (!person || numberOf.has(person.id)) continue;
        numberOf.set(person.id, number);
        idOf.set(number, person.id);
        queue.push(person.id);
      }
    }
    return { numberOf, idOf };
  }

  // Describes how personId relates to egoId: blood distance (up to the common
  // ancestor, then down), a partner, a relative's partner, or a partner's relative.
  function getRelationship(data, egoId, personId) {
    if (!egoId || !personId) return { kind: 'none' };
    if (egoId === personId) return { kind: 'self' };
    const index = kinshipIndex(data);
    const blood = bloodRelation(index, egoId, personId);
    if (blood) return { kind: 'blood', ...blood };
    if (index.spouses.get(egoId)?.has(personId)) return { kind: 'spouse' };
    for (const partnerId of index.spouses.get(personId) || []) {
      const relative = bloodRelation(index, egoId, partnerId);
      if (relative) return { kind: 'relative-partner', relative, relativeId: partnerId };
    }
    for (const partnerId of index.spouses.get(egoId) || []) {
      const relative = partnerId === personId ? null : bloodRelation(index, partnerId, personId);
      if (relative) return { kind: 'partner-relative', relative, partnerId };
    }
    return { kind: 'none' };
  }

  return {
    getAhnentafel,
    validateDataset,
    buildIndexes,
    getPerson,
    getFamily,
    normalizeText,
    searchDataset,
    getEvidenceSummary,
    filterPeople,
    globalSearch,
    getDirectLine,
    filterEvents,
    filterTimelineEvents,
    filterPlaces,
    filterClaims,
    filterSources,
    filterMedia,
    filterResearchTasks,
    getClaimsForSubject,
    getPlaceConnections,
    getRelationship,
    getAncestorDepths,
  };
});
