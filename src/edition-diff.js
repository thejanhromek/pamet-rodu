(function registerEditionDiff(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.RKEditionDiff = api;
})(globalThis, function createEditionDiff() {
  'use strict';

  // What changed for the family between two editions of the data: new people,
  // places, photos and recordings, claims that became verified and links whose
  // certainty grew. Research housekeeping (tasks, changelog) is ignored.

  const STRENGTH = { hypothesis: 1, 'family-record': 2, supported: 3, verified: 4 };
  const byId = (items) => new Map((items || []).map((item) => [item.id, item]));

  function linkEvidence(data) {
    const claims = new Map();
    for (const claim of data.claims || []) {
      if (claim.subjectType !== 'relationship') continue;
      const current = claims.get(claim.subjectId);
      if (!current || (STRENGTH[claim.evidence] || 0) > (STRENGTH[current] || 0)) claims.set(claim.subjectId, claim.evidence);
    }
    return new Map((data.relationships || []).filter((link) => link.type === 'parent-child').map((link) => [link.id, link.evidence || claims.get(link.id) || null]));
  }

  function diffEditions(previous, current) {
    const before = Object.fromEntries(['people', 'places', 'media', 'claims', 'sources'].map((key) => [key, byId(previous?.[key])]));
    const added = (key) => (current?.[key] || []).filter((item) => !before[key].has(item.id));
    const newPeople = added('people').map((person) => ({ id: person.id, displayName: person.displayName }));
    const newPlaces = added('places').map((place) => ({ id: place.id, name: place.name }));
    const newMedia = added('media').map((media) => ({ id: media.id, title: media.title, kind: media.kind }));
    const newlyVerified = (current?.claims || []).filter((claim) => claim.evidence === 'verified' && before.claims.get(claim.id)?.evidence !== 'verified')
      .map((claim) => ({ id: claim.id, text: claim.text, subjectType: claim.subjectType, subjectId: claim.subjectId }));
    const previousLinks = linkEvidence(previous || {});
    const strengthened = [];
    for (const [id, evidence] of linkEvidence(current || {})) {
      const was = previousLinks.get(id);
      if (!previousLinks.has(id) || (STRENGTH[evidence] || 0) <= (STRENGTH[was] || 0)) continue;
      const link = (current.relationships || []).find((item) => item.id === id);
      strengthened.push({ id, from: link.from, to: link.to, was, now: evidence });
    }
    const newSourceCount = added('sources').length;
    const empty = !newPeople.length && !newPlaces.length && !newMedia.length && !newlyVerified.length && !strengthened.length && !newSourceCount;
    return { empty, newPeople, newPlaces, newMedia, newlyVerified, strengthened, newSourceCount };
  }

  return { diffEditions };
});
