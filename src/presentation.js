(function registerPresentation(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.RKPresentation = api;
})(globalThis, function createPresentation() {
  'use strict';

  const evidenceLabels = {
    verified: 'Ověřeno',
    supported: 'Podpořeno',
    'family-record': 'Rodinný záznam',
    hypothesis: 'Hypotéza / rozpor',
  };
  const lineageLabels = {
    self: 'Výchozí osoba',
    direct: 'Přímá linie',
    collateral: 'Vedlejší větev',
    affinal: 'Sešvagřená větev',
  };
  const subjectTypeLabels = { person: 'Osoba', place: 'Místo', event: 'Událost', source: 'Pramen' };
  const sourceTypeLabels = {
    'parish-register': 'Matrika', 'parish-register-index': 'Matriční rejstřík', 'archive-catalog': 'Archivní katalog',
    'oral-history-correction': 'Rodinné vyprávění', 'gravestone-record': 'Záznam náhrobku',
    'census-image-and-index': 'Sčítání lidu', 'census-record': 'Sčítání lidu', 'business-profile': 'Veřejný záznam',
    'oral-history': 'Rodinné vyprávění', 'family-record': 'Rodinný soupis', 'family-notebook': 'Rodinný sešit',
    'family-photo': 'Rodinná fotografie', 'official-web': 'Oficiální web', 'official-document': 'Oficiální dokument',
    'historical-document': 'Historický dokument', 'local-periodical': 'Místní periodikum', 'archive-index': 'Archivní pomůcka',
    'gravestone-photo': 'Fotografie náhrobku', 'foreign-family-tree': 'Cizí rodokmen', 'census-index': 'Index sčítání',
  };
  const eventTypeLabels = {
    birth: 'Narození', death: 'Úmrtí', marriage: 'Sňatek', employment: 'Povolání', migration: 'Stěhování',
    property: 'Majetek', 'public-office': 'Veřejná funkce', census: 'Sčítání lidu', burial: 'Pohřeb', 'burial-site': 'Místo pohřbení',
  };
  const mediaTypeLabels = { 'notebook-page': 'Stránka sešitu', 'family-photo': 'Rodinná fotografie', document: 'Dokument', 'audio-clip': 'Nahrávka rozhovoru' };
  const taskStatusLabels = { open: 'Otevřeno', in_progress: 'Rozpracováno', 'in-progress': 'Rozpracováno', closed: 'Uzavřeno' };
  const changeCategoryLabels = { people: 'Osoby', relationships: 'Vztahy', events: 'Události', sources: 'Prameny', claims: 'Tvrzení', research: 'Výzkum', corrections: 'Opravy', media: 'Média' };

  const fallback = (value) => value == null || value === '' ? 'Neurčený typ' : 'Neurčený typ';
  const label = (map, value, unknown = 'Neurčený typ') => map[value] || unknown;
  function evidenceLabel(value) { return label(evidenceLabels, value, 'Neurčený stav důkazu'); }
  function lineageLabel(value) { return label(lineageLabels, value, 'Neurčená větev'); }
  function subjectTypeLabel(value) { return label(subjectTypeLabels, value, 'Neurčený subjekt'); }
  function sourceTypeLabel(value) { return label(sourceTypeLabels, value, 'Neurčený typ pramene'); }
  function eventTypeLabel(value) { return label(eventTypeLabels, value, 'Neurčený typ události'); }
  function mediaTypeLabel(value) { return label(mediaTypeLabels, value, 'Neurčený typ média'); }
  function taskStatusLabel(value) { return label(taskStatusLabels, value, 'Neurčený stav úkolu'); }
  function changeCategoryLabel(value) { return label(changeCategoryLabels, value, 'Jiná změna'); }
  // Several internal codes share one Czech label; filters offer one option per label.
  function groupTypesByLabel(types, labelFn) {
    const groups = new Map();
    for (const type of types) {
      const name = labelFn(type);
      groups.set(name, [...(groups.get(name) || []), type]);
    }
    return [...groups].map(([name, members]) => ({ value: members.join(','), label: name })).sort((a, b) => a.label.localeCompare(b.label, 'cs'));
  }
  // Czech plural: 1 pramen, 2–4 prameny, 0 and 5+ pramenů.
  function plural(count, one, few, many) {
    const n = Math.abs(Number(count) || 0);
    return `${count} ${n === 1 ? one : n >= 2 && n <= 4 ? few : many}`;
  }
  function formatDate(value) {
    if (!value) return 'Datum neznámé';
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? `${Number(match[3])}. ${Number(match[2])}. ${match[1]}` : String(value);
  }
  function birthYear(person) {
    for (const value of [person?.birth?.date, person?.birth?.dateText]) {
      const matches = String(value || '').match(/(?<!\d)(\d{4})(?!\d)/g) || [];
      const year = matches.find((candidate) => Number(candidate) >= 1000 && Number(candidate) <= 2999);
      if (year) return Number(year);
    }
    return null;
  }
  function personChoiceLabel(person) {
    const name = person?.displayName || 'Neurčená osoba';
    const year = birthYear(person);
    return `${name} · ${year ? `* ${year}` : 'rok narození neznámý'}`;
  }

  const bySex = (sex, male, female, neutral) => sex === 'male' ? male : sex === 'female' ? female : neutral;
  const kneeWords = { 2: 'druhého', 3: 'třetího', 4: 'čtvrtého', 5: 'pátého' };

  // Ancestor n generations up: 1 otec, 2 děda, 3 praděda, 4 prapraděda, then a counted form.
  function ancestorLabel(generations, sex) {
    if (generations === 1) return bySex(sex, 'otec', 'matka', 'rodič');
    if (generations >= 2 && generations <= 4) {
      const prefix = 'pra'.repeat(generations - 2);
      return bySex(sex, `${prefix}děda`, `${prefix}babička`, `${prefix}prarodič`);
    }
    return `${bySex(sex, 'předek', 'předkyně', 'předek')} · ${generations} generací zpět`;
  }

  function descendantLabel(generations, sex) {
    if (generations === 1) return bySex(sex, 'syn', 'dcera', 'dítě');
    if (generations >= 2 && generations <= 4) {
      const prefix = 'pra'.repeat(generations - 2);
      return bySex(sex, `${prefix}vnuk`, `${prefix}vnučka`, `${prefix}vnouče`);
    }
    return `potomek · ${generations} generací dál`;
  }

  function bloodLabel({ up, down }, sex) {
    if (down === 0) return ancestorLabel(up, sex);
    if (up === 0) return descendantLabel(down, sex);
    if (up === 1 && down === 1) return bySex(sex, 'bratr', 'sestra', 'sourozenec');
    if (down === 1 && up === 2) return bySex(sex, 'strýc', 'teta', 'sourozenec rodiče');
    if (down === 1 && up === 3) return bySex(sex, 'prastrýc', 'prateta', 'sourozenec prarodiče');
    if (down === 1 && up <= 6) return bySex(sex, `${'pra'.repeat(up - 2)}strýc`, `${'pra'.repeat(up - 2)}teta`, `sourozenec ${'pra'.repeat(up - 2)}prarodiče`);
    if (down === 1) return bySex(sex, 'bratr předka', 'sestra předka', 'sourozenec předka');
    if (up === 1 && down === 2) return bySex(sex, 'synovec', 'neteř', 'dítě sourozence');
    if (up === 1 && down === 3) return bySex(sex, 'prasynovec', 'praneteř', 'vnouče sourozence');
    if (up === 2 && down === 2) return bySex(sex, 'bratranec', 'sestřenice', 'bratranec nebo sestřenice');
    // Second cousins share great-grandparents: "z druhého kolena".
    if (up === down && kneeWords[up - 1]) return `${bySex(sex, 'bratranec', 'sestřenice', 'bratranec nebo sestřenice')} z ${kneeWords[up - 1]} kolena`;
    // Relatives a generation (or more) apart: "syn bratrance", "sestřenice prarodiče".
    const level = Math.min(up, down);
    const removed = Math.abs(up - down);
    const cousinGenitive = level === 2 ? 'bratrance či sestřenice' : kneeWords[level - 1] ? `bratrance či sestřenice z ${kneeWords[level - 1]} kolena` : null;
    if (cousinGenitive && down > up && removed <= 4) return `${descendantLabel(removed, sex)} ${cousinGenitive}`;
    if (up > down && level >= 2 && removed <= 3) {
      const cousin = level === 2 ? bySex(sex, 'bratranec', 'sestřenice', 'bratranec nebo sestřenice') : `${bySex(sex, 'bratranec', 'sestřenice', 'bratranec nebo sestřenice')} z ${kneeWords[level - 1] || `${level - 1}.`} kolena`;
      return `${cousin} ${['rodiče', 'prarodiče', 'praprarodiče'][removed - 1]}`;
    }
    if (up === 1 && down >= 4) return `${descendantLabel(down - 1, sex)} sourozence`;
    return bySex(sex, 'pokrevní příbuzný', 'pokrevní příbuzná', 'pokrevní příbuzný');
  }

  // Czech wording for RKModel.getRelationship; `sex` is the described person's.
  function relationshipLabel(relationship, sex) {
    if (!relationship) return '';
    if (relationship.kind === 'self') return 'to jste vy';
    if (relationship.kind === 'blood') return bloodLabel(relationship, sex);
    if (relationship.kind === 'spouse') return bySex(sex, 'manžel', 'manželka', 'partner');
    if (relationship.kind === 'relative-partner') {
      const { up, down } = relationship.relative;
      if (up === 1 && down === 0) return bySex(sex, 'nevlastní otec', 'nevlastní matka', 'nevlastní rodič');
      if (up === 2 && down === 0) return bySex(sex, 'nevlastní děda', 'nevlastní babička', 'nevlastní prarodič');
      if (up === 1 && down === 1) return bySex(sex, 'švagr', 'švagrová', 'partner sourozence');
      if (up === 0 && down === 1) return bySex(sex, 'zeť', 'snacha', 'partner dítěte');
      if (up === 2 && down === 1) return bySex(sex, 'strýc', 'teta', 'partner sourozence rodiče');
      return bySex(sex, 'přiženěný do rodiny', 'přivdaná do rodiny', 'partner příbuzného');
    }
    if (relationship.kind === 'partner-relative') {
      const { up, down } = relationship.relative;
      if (up === 1 && down === 0) return bySex(sex, 'tchán', 'tchyně', 'rodič partnera');
      if (up === 1 && down === 1) return bySex(sex, 'švagr', 'švagrová', 'sourozenec partnera');
      if (up === 0 && down === 1) return bySex(sex, 'nevlastní syn', 'nevlastní dcera', 'nevlastní dítě');
      return bySex(sex, 'příbuzný z rodiny partnera', 'příbuzná z rodiny partnera', 'příbuzný z rodiny partnera');
    }
    return '';
  }

  // Tree cards: years only (exact dates live in the profile), the same in both tree modes.
  function lifeYears(person) {
    const year = (event) => String(event?.date || event?.dateText || '').match(/(?<!\d)\d{4}(?!\d)/)?.[0] || 'rok neznámý';
    const parts = [];
    if (person?.birth?.date || person?.birth?.dateText) parts.push(`* ${year(person.birth)}`);
    if (person?.death?.date || person?.death?.dateText) parts.push(`† ${year(person.death)}`);
    return parts.length ? parts.join('  ') : 'data neznámá';
  }

  // "Marie Nováková, roz. Dvořáková" → main name and the part after the first comma,
  // so a card can show the maiden name on its own line instead of cutting it off.
  function splitDisplayName(displayName = '') {
    const value = String(displayName);
    const index = value.indexOf(', ');
    return index > 0 ? { main: value.slice(0, index), extra: value.slice(index + 2) } : { main: value, extra: '' };
  }

  // What a card can promise behind a click: photos, interview excerpts, memories.
  function personMarks(data, personId) {
    const media = (data?.media || []).filter((item) => (item.personIds || []).includes(personId));
    const person = (data?.people || []).find((item) => item.id === personId);
    return [
      media.some((item) => item.kind !== 'audio-clip') ? { kind: 'photo', label: 'fotografie' } : null,
      media.some((item) => item.kind === 'audio-clip') ? { kind: 'audio', label: 'nahrávka z rozhovoru' } : null,
      (person?.familyNotes || []).length ? { kind: 'memory', label: 'vzpomínky' } : null,
    ].filter(Boolean);
  }

  const EVIDENCE_RANK = { verified: 4, supported: 3, 'family-record': 2, hypothesis: 1, unknown: 0 };
  const linkEvidenceLabels = { verified: 'ověřená vazba', supported: 'vazba podpořená prameny', 'family-record': 'vazba podle rodinného vyprávění', hypothesis: 'nejistá vazba – hypotéza', unknown: 'jistota vazby neuvedena' };

  // Certainty of every parent-child link, keyed "parentId>childId": the
  // relationship's own evidence, else the strongest claim about it.
  function linkEvidenceIndex(data) {
    const fromClaims = new Map();
    for (const claim of data?.claims || []) {
      if (claim.subjectType !== 'relationship' || !(claim.evidence in EVIDENCE_RANK)) continue;
      const current = fromClaims.get(claim.subjectId);
      if (!current || EVIDENCE_RANK[claim.evidence] > EVIDENCE_RANK[current]) fromClaims.set(claim.subjectId, claim.evidence);
    }
    const index = new Map();
    for (const link of data?.relationships || []) {
      if (link.type !== 'parent-child') continue;
      const status = link.evidence in EVIDENCE_RANK ? link.evidence : fromClaims.get(link.id) || 'unknown';
      index.set(`${link.from}>${link.to}`, status);
    }
    return index;
  }

  function weakestEvidence(statuses = []) {
    return statuses.reduce((weakest, status) => ((EVIDENCE_RANK[status] ?? 0) < (EVIDENCE_RANK[weakest] ?? 0) ? status : weakest), 'verified');
  }

  return {
    lifeYears, splitDisplayName, personMarks, linkEvidenceIndex, weakestEvidence, linkEvidenceLabels,
    evidenceLabels, lineageLabels, subjectTypeLabels, sourceTypeLabels, eventTypeLabels, mediaTypeLabels, taskStatusLabels, changeCategoryLabels,
    evidenceLabel, lineageLabel, subjectTypeLabel, sourceTypeLabel, eventTypeLabel, mediaTypeLabel, taskStatusLabel, changeCategoryLabel, groupTypesByLabel, plural, formatDate, birthYear, personChoiceLabel, fallback,
    ancestorLabel, descendantLabel, relationshipLabel,
  };
});
