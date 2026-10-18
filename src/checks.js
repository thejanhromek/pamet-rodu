(function registerChecks(root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const dependencies = isNode
    ? { model: require('./model.js'), names: require('./names.js') }
    : { model: root.RKModel, names: root.RKNames };
  const api = factory(dependencies.model, dependencies.names);
  if (isNode) module.exports = api;
  root.RKChecks = api;
})(globalThis, function createChecks(model, names) {
  'use strict';

  // Plausibility checks ("zdraví dat"). Each finding has a stable `key`, so a
  // reviewed exception can be accepted with a reason instead of being fixed.
  // Severity: error = impossible as recorded; warning = unusual, worth a look;
  // info = gaps and housekeeping. Dates written with hedges ("asi", "kolem")
  // never produce errors, only warnings.

  const HEDGE = /podle|asi|cca|kolem|okolo|přibl|pravděpod|nejist|\?|\bnebo\b|;|\//i;
  const PRIMARY_SOURCE_TYPES = new Set([
    'parish-register', 'official-document', 'census-record', 'census-image-and-index', 'historical-document',
    'gravestone-photo', 'gravestone-record',
  ]);
  const NAVIGATION_SOURCE_TYPES = new Set(['foreign-family-tree', 'census-index', 'parish-register-index', 'archive-index']);
  const SUBJECT_EVENT_EXCLUDED = new Set(['death', 'burial', 'burial-site']);

  const LIMITS = {
    mother: { errorBelow: 12, warnBelow: 14, warnAbove: 50, errorAbove: 56 },
    father: { errorBelow: 12, warnBelow: 15, warnAbove: 75, errorAbove: 90 },
    marriage: { errorBelow: 12, warnBelow: 14 },
    lifespan: { warnAbove: 105 },
  };

  function point(value, text = '') {
    const match = String(value || '').match(/^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/);
    if (match) return { year: Number(match[1]), month: match[2] ? Number(match[2]) : null, day: match[3] ? Number(match[3]) : null, hedged: HEDGE.test(text || '') };
    const year = String(text || '').match(/(?<!\d)(1\d{3}|20\d{2})(?!\d)/);
    return year ? { year: Number(year[1]), month: null, day: null, hedged: true } : null;
  }

  const lifePoint = (entry) => (entry ? point(entry.date, entry.dateText) : null);
  const precise = (p) => Boolean(p?.day) && !p.hedged;
  // Years between two points; approximate when either lacks a day.
  function yearsBetween(a, b) {
    if (precise(a) && precise(b)) {
      const start = Date.UTC(a.year, a.month - 1, a.day);
      const end = Date.UTC(b.year, b.month - 1, b.day);
      return { years: (end - start) / (365.2425 * 86400000), exact: true };
    }
    return { years: b.year - a.year, exact: false };
  }
  // Months from a to b (only for precise points).
  const monthsBetween = (a, b) => (b.year - a.year) * 12 + (b.month - a.month) + ((b.day || 1) - (a.day || 1)) / 30;

  function finding(severity, code, message, ids = {}) {
    const flat = Object.values(ids).flat().filter(Boolean);
    return { key: `${code}:${flat.join(',')}`, severity, code, message, ids, personIds: ids.people || [] };
  }

  function parentRole(parent) {
    if (parent?.sex === 'female') return 'mother';
    if (parent?.sex === 'male') return 'father';
    return null;
  }

  function checkParents(data, people, findings) {
    for (const link of data.relationships || []) {
      if (link.type !== 'parent-child') continue;
      const parent = people.get(link.from);
      const child = people.get(link.to);
      if (!parent || !child) continue;
      const role = parentRole(parent);
      const parentBirth = lifePoint(parent.birth);
      const childBirth = lifePoint(child.birth);
      const ids = { people: [parent.id, child.id], relationships: [link.id] };
      if (role && parentBirth && childBirth) {
        const { years, exact } = yearsBetween(parentBirth, childBirth);
        const limits = LIMITS[role];
        const word = role === 'mother' ? 'matce' : 'otci';
        const uncertain = !exact && (parentBirth.hedged || childBirth.hedged);
        const label = `${parent.displayName} → ${child.displayName}`;
        const age = Math.round(years);
        if (years < limits.errorBelow && !uncertain) findings.push(finding('error', `${role.toUpperCase()}_TOO_YOUNG`, `${label}: ${word} by při narození dítěte bylo ${age} let.`, ids));
        else if (years < limits.warnBelow) findings.push(finding('warning', `${role.toUpperCase()}_YOUNG`, `${label}: ${word} bylo při narození dítěte jen ${age} let.`, ids));
        else if (years > limits.errorAbove && !uncertain) findings.push(finding('error', `${role.toUpperCase()}_TOO_OLD`, `${label}: ${word} by při narození dítěte bylo ${age} let.`, ids));
        else if (years > limits.warnAbove) findings.push(finding('warning', `${role.toUpperCase()}_OLD`, `${label}: ${word} bylo při narození dítěte ${age} let.`, ids));
      }
      const parentDeath = lifePoint(parent.death);
      if (parentDeath && childBirth) {
        const label = `${child.displayName} se narodil(a) po smrti ${role === 'mother' ? 'matky' : role === 'father' ? 'otce' : 'rodiče'} ${parent.displayName}`;
        const allowedMonths = role === 'mother' ? 0 : 10;
        if (precise(parentDeath) && precise(childBirth)) {
          const months = monthsBetween(parentDeath, childBirth);
          if (months > allowedMonths) findings.push(finding('error', 'BORN_AFTER_PARENT_DEATH', `${label} (${Math.round(months)} měsíců).`, ids));
        } else if (childBirth.year - parentDeath.year > (role === 'mother' ? 0 : 1)) {
          findings.push(finding(parentDeath.hedged || childBirth.hedged ? 'warning' : 'error', 'BORN_AFTER_PARENT_DEATH', `${label} (rok ${childBirth.year}, úmrtí ${parentDeath.year}).`, ids));
        }
      }
    }
  }

  function checkLives(data, people, findings, now) {
    for (const person of people.values()) {
      const birth = lifePoint(person.birth);
      const death = lifePoint(person.death);
      const ids = { people: [person.id] };
      if (birth && death) {
        const { years, exact } = yearsBetween(birth, death);
        if (years < 0 && (exact || birth.year > death.year)) findings.push(finding(birth.hedged || death.hedged ? 'warning' : 'error', 'DEATH_BEFORE_BIRTH', `${person.displayName}: úmrtí (${death.year}) je dřív než narození (${birth.year}).`, ids));
        if (years > LIMITS.lifespan.warnAbove) findings.push(finding('warning', 'VERY_LONG_LIFE', `${person.displayName}: věk při úmrtí asi ${Math.round(years)} let.`, ids));
      }
      if (birth && !person.death && now.getFullYear() - birth.year > 110) {
        findings.push(finding('info', 'DEATH_MISSING', `${person.displayName}: narozen(a) ${birth.year}, úmrtí chybí.`, ids));
      }
    }
  }

  function checkEvents(data, people, findings) {
    for (const event of data.events || []) {
      const at = point(event.date, event.dateText);
      if (!at) continue;
      const subject = people.get((event.personIds || [])[0]);
      if (subject && !SUBJECT_EVENT_EXCLUDED.has(event.type)) {
        const death = lifePoint(subject.death);
        if (death && (at.year > death.year + (death.hedged || at.hedged ? 1 : 0)) && !(precise(at) && precise(death) && monthsBetween(death, at) <= 0)) {
          findings.push(finding(death.hedged || at.hedged ? 'warning' : 'error', 'EVENT_AFTER_DEATH', `${event.title}: ${at.year}, ale ${subject.displayName} zemřel(a) ${death.year}.`, { people: [subject.id], events: [event.id] }));
        }
      }
      if (event.type === 'marriage') {
        for (const personId of event.personIds || []) {
          const person = people.get(personId);
          const birth = lifePoint(person?.birth);
          if (!birth) continue;
          const { years, exact } = yearsBetween(birth, at);
          if (years < LIMITS.marriage.errorBelow && (exact || !(birth.hedged || at.hedged))) findings.push(finding('error', 'MARRIAGE_TOO_YOUNG', `${event.title}: ${person.displayName} by bylo ${Math.round(years)} let.`, { people: [person.id], events: [event.id] }));
          else if (years < LIMITS.marriage.warnBelow) findings.push(finding('warning', 'MARRIAGE_YOUNG', `${event.title}: ${person.displayName} bylo asi ${Math.round(years)} let.`, { people: [person.id], events: [event.id] }));
        }
      }
    }
  }

  function birthYear(person) {
    return lifePoint(person.birth)?.year ?? null;
  }

  function checkDuplicates(data, findings) {
    if (!names) return;
    const people = (data.people || []).filter((person) => birthYear(person) !== null);
    const linked = new Set((data.relationships || []).map((link) => `${link.from}|${link.to}`));
    for (let i = 0; i < people.length; i += 1) {
      for (let j = i + 1; j < people.length; j += 1) {
        const a = people[i];
        const b = people[j];
        if (Math.abs(birthYear(a) - birthYear(b)) > 2) continue;
        if (linked.has(`${a.id}|${b.id}`) || linked.has(`${b.id}|${a.id}`)) continue;
        if (a.sex && b.sex && a.sex !== b.sex) continue;
        if (names.nameSimilarity(a, b) < 1) continue;
        findings.push(finding('warning', 'POSSIBLE_DUPLICATE', `Možná tatáž osoba: ${a.displayName} (${birthYear(a)}) a ${b.displayName} (${birthYear(b)}).`, { people: [a.id, b.id] }));
      }
    }
  }

  function checkEvidence(data, findings) {
    const sources = new Map((data.sources || []).map((source) => [source.id, source]));
    for (const claim of data.claims || []) {
      const cited = (claim.sourceIds || []).map((id) => sources.get(id)).filter(Boolean);
      if (!cited.length) continue;
      if (claim.evidence === 'verified' && !cited.some((source) => PRIMARY_SOURCE_TYPES.has(source.type))) {
        findings.push(finding('warning', 'VERIFIED_WITHOUT_PRIMARY', `Tvrzení je ověřené, ale nemá primární pramen: „${claim.text.slice(0, 90)}“`, { claims: [claim.id] }));
      }
      if (['verified', 'supported'].includes(claim.evidence) && cited.every((source) => NAVIGATION_SOURCE_TYPES.has(source.type))) {
        findings.push(finding(claim.evidence === 'verified' ? 'warning' : 'info', 'NAVIGATION_ONLY', `Tvrzení stojí jen na pracovních stopách (cizí strom, index): „${claim.text.slice(0, 90)}“`, { claims: [claim.id] }));
      }
    }
    for (const source of data.sources || []) {
      if (source.type === 'foreign-family-tree' && !/ověř/i.test(`${source.reliabilityNote || ''} ${source.origin || ''} ${source.title || ''}`)) {
        findings.push(finding('info', 'NAVIGATION_NOTE_MISSING', `Pramen „${source.title}“ je cizí strom bez poznámky, že vyžaduje ověření.`, { sources: [source.id] }));
      }
    }
    const claimed = new Set((data.claims || []).filter((claim) => claim.subjectType === 'relationship').map((claim) => claim.subjectId));
    for (const link of data.relationships || []) {
      if (link.type === 'parent-child' && !link.evidence && !claimed.has(link.id) && !(link.sourceIds || []).length) {
        findings.push(finding('info', 'LINK_WITHOUT_EVIDENCE', `Vazba rodič–dítě ${link.from} → ${link.to} nemá stav důkazu ani pramen.`, { relationships: [link.id] }));
      }
    }
    const used = new Set();
    const collect = (ids) => (ids || []).forEach((id) => used.add(id));
    for (const key of ['people', 'relationships', 'events', 'claims', 'researchTasks']) for (const item of data[key] || []) collect(item.sourceIds);
    for (const media of data.media || []) if (media.sourceId) used.add(media.sourceId);
    for (const claim of data.claims || []) if (claim.subjectType === 'source') used.add(claim.subjectId);
    for (const source of data.sources || []) {
      if (source.originalSourceId) used.add(source.originalSourceId);
      if (!used.has(source.id)) findings.push(finding('info', 'UNUSED_SOURCE', `Pramen „${source.title}“ nic nedokládá.`, { sources: [source.id] }));
    }
    for (const place of data.places || []) {
      if (!(Number.isFinite(place.lat) && Number.isFinite(place.lon))) findings.push(finding('info', 'PLACE_WITHOUT_COORDINATES', `Místo ${place.name} nemá souřadnice.`, { places: [place.id] }));
    }
  }

  function runChecks(data, options = {}) {
    const now = options.now || new Date();
    const people = new Map((data.people || []).map((person) => [person.id, person]));
    const findings = model.validateDataset(data).map((error) => finding('error', error.code, `Chybný odkaz: ${error.code} v ${error.id}${error.sourceId ? ` → ${error.sourceId}` : ''}${error.personId ? ` → ${error.personId}` : ''}${error.placeId ? ` → ${error.placeId}` : ''}`, { records: [error.id] }));
    checkParents(data, people, findings);
    checkLives(data, people, findings, now);
    checkEvents(data, people, findings);
    checkDuplicates(data, findings);
    checkEvidence(data, findings);
    const accepted = new Map((options.accepted || []).map((entry) => [entry.key, entry.reason]));
    const order = { error: 0, warning: 1, info: 2 };
    return findings
      .map((item) => (accepted.has(item.key) ? { ...item, accepted: accepted.get(item.key) } : item))
      .sort((a, b) => order[a.severity] - order[b.severity] || a.code.localeCompare(b.code));
  }

  function summarize(findings) {
    const counts = { error: 0, warning: 0, info: 0, accepted: 0 };
    for (const item of findings) {
      if (item.accepted) counts.accepted += 1;
      else counts[item.severity] += 1;
    }
    return counts;
  }

  const CODE_LABELS = {
    MOTHER_TOO_YOUNG: 'Matka příliš mladá', MOTHER_YOUNG: 'Velmi mladá matka', MOTHER_TOO_OLD: 'Matka příliš stará', MOTHER_OLD: 'Starší matka',
    FATHER_TOO_YOUNG: 'Otec příliš mladý', FATHER_YOUNG: 'Velmi mladý otec', FATHER_TOO_OLD: 'Otec příliš starý', FATHER_OLD: 'Starší otec',
    BORN_AFTER_PARENT_DEATH: 'Narození po smrti rodiče', DEATH_BEFORE_BIRTH: 'Úmrtí před narozením', VERY_LONG_LIFE: 'Neobvykle dlouhý život',
    DEATH_MISSING: 'Chybí úmrtí', EVENT_AFTER_DEATH: 'Událost po smrti', MARRIAGE_TOO_YOUNG: 'Sňatek v dětském věku', MARRIAGE_YOUNG: 'Velmi mladý sňatek',
    POSSIBLE_DUPLICATE: 'Možná duplicita', VERIFIED_WITHOUT_PRIMARY: 'Ověřeno bez primárního pramene', NAVIGATION_ONLY: 'Jen pracovní stopa',
    NAVIGATION_NOTE_MISSING: 'Chybí poznámka o ověření', LINK_WITHOUT_EVIDENCE: 'Vazba bez důkazu', UNUSED_SOURCE: 'Nepoužitý pramen',
    PLACE_WITHOUT_COORDINATES: 'Místo bez souřadnic',
  };

  return { runChecks, summarize, CODE_LABELS, PRIMARY_SOURCE_TYPES, NAVIGATION_SOURCE_TYPES };
});
