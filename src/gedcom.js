(function registerGedcom(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.RKGedcom = api;
})(globalThis, function createGedcomModule() {
  'use strict';

  // GEDCOM 7.0 export of the chronicle dataset and a tolerant GEDCOM 5.5.1/7
  // import that only produces candidates. Imported records are always
  // hypotheses pointing to the imported file; nothing here writes to the
  // dataset or knows any family.

  const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const CZECH_MONTHS = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec'];
  const QUAY = { verified: 3, supported: 2, 'family-record': 1, hypothesis: 0 };
  const EVIDENCE_LABELS = { verified: 'ověřeno', supported: 'podloženo', 'family-record': 'rodinný záznam', hypothesis: 'hypotéza' };
  const EVIDENCE_RANK = ['hypothesis', 'family-record', 'supported', 'verified'];
  const APPROX = /\b(?:asi|kolem|okolo|cca|circa|přibl\w*|zhruba)\b|\bca\.|~/i;
  const YEAR = /(?<!\d)(\d{3,4})(?!\d)/g;
  const RANGE = /(?<!\d)(\d{3,4})\s*(?:–|—|-|až|a)\s*(\d{3,4})(?!\d)/;
  const LIVING_YEARS = 100;
  const LIVING_NAME = 'Žijící osoba';
  // Co-parents without a recorded partnership. GEDCOM treats every family with
  // two partners as a couple, so the export marks the exception.
  const COPARENTS_TAG = '_RKCOPARENTS';
  const COPARENTS_URI = 'urn:rodova-kronika:gedcom:copartners';

  // Chronicle event types → GEDCOM tags (individual events).
  const EVENT_TAGS = {
    birth: 'BIRT', baptism: 'CHR', christening: 'CHR', death: 'DEAT', burial: 'BURI', 'burial-site': 'BURI',
    occupation: 'OCCU', employment: 'OCCU', 'public-office': 'OCCU', residence: 'RESI', migration: 'RESI',
    census: 'CENS', property: 'PROP', emigration: 'EMIG', immigration: 'IMMI',
  };
  const FAMILY_EVENT_TAGS = { marriage: 'MARR', divorce: 'DIV', engagement: 'ENGA' };
  // GEDCOM tags → chronicle event types and Czech titles (import).
  const IMPORT_EVENTS = {
    CHR: ['baptism', 'Křest'], BAPM: ['baptism', 'Křest'], BURI: ['burial', 'Pohřeb'], CREM: ['burial', 'Kremace'],
    RESI: ['residence', 'Bydliště'], OCCU: ['occupation', 'Povolání'], CENS: ['census', 'Sčítání lidu'],
    EMIG: ['migration', 'Vystěhování'], IMMI: ['migration', 'Přistěhování'], PROP: ['property', 'Majetek'],
    MARR: ['marriage', 'Sňatek'], DIV: ['divorce', 'Rozvod'], ENGA: ['engagement', 'Zasnoubení'], EVEN: ['other', 'Událost'],
  };

  // ---------------------------------------------------------------- dates

  function parseIsoPoint(value) {
    const match = String(value || '').match(/^(\d{3,4})(?:-(\d{2})(?:-(\d{2}))?)?$/);
    if (!match) return null;
    return { year: Number(match[1]), month: match[2] ? Number(match[2]) : null, day: match[3] ? Number(match[3]) : null };
  }

  function gedcomPoint(point) {
    if (!point) return '';
    const parts = [];
    if (point.month && point.day) parts.push(String(point.day));
    if (point.month) parts.push(MONTHS[point.month - 1]);
    parts.push(String(point.year));
    return parts.join(' ');
  }

  function czechPoint(point) {
    if (!point) return '';
    if (point.day && point.month) return `${point.day}. ${point.month}. ${point.year}`;
    if (point.month) return `${CZECH_MONTHS[point.month - 1]} ${point.year}`;
    return String(point.year);
  }

  // Chronicle date → GEDCOM 7 date value and an optional PHRASE holding the
  // original wording when it says more than the value.
  function toGedcomDate(date, options = {}) {
    const text = String(options.dateText || '').trim();
    let start = parseIsoPoint(date);
    let end = parseIsoPoint(options.endDate);
    if (!start && text) {
      const range = text.match(RANGE);
      if (range && Number(range[2]) > Number(range[1])) {
        start = { year: Number(range[1]) };
        end = { year: Number(range[2]) };
      } else {
        const years = text.match(YEAR);
        if (years && years.length === 1) start = { year: Number(years[0]) };
      }
    }
    let value = '';
    if (start && end && (end.year !== start.year || end.month !== start.month || end.day !== start.day)) {
      value = `BET ${gedcomPoint(start)} AND ${gedcomPoint(end)}`;
    } else if (start) {
      const point = gedcomPoint(start);
      if (/^(?:před|pred)\b/i.test(text)) value = `BEF ${point}`;
      else if (/^(?:po|nejdříve)\b/i.test(text)) value = `AFT ${point}`;
      else if (APPROX.test(text)) value = `ABT ${point}`;
      else value = point;
    }
    const plain = start ? [czechPoint(start), String(start.year), String(date || '')] : [];
    const phrase = text && !plain.includes(text) ? text : '';
    if (!value && !phrase) return null;
    return { value, phrase };
  }

  function parseGedcomPoint(text) {
    const tokens = String(text || '').trim().toUpperCase().replace(/\s+/g, ' ').split(' ').filter(Boolean);
    if (tokens.length && /^(?:BCE|B\.C\.)$/.test(tokens[tokens.length - 1])) return null;
    const year = Number(tokens.pop());
    if (!Number.isInteger(year) || year <= 0) return null;
    const monthIndex = tokens.length ? MONTHS.indexOf(tokens.pop().slice(0, 3)) : -1;
    const day = tokens.length ? Number(tokens.pop()) : null;
    const month = monthIndex >= 0 ? monthIndex + 1 : null;
    return { year, month, day: month && Number.isInteger(day) && day > 0 && day <= 31 ? day : null };
  }

  function isoPoint(point) {
    if (!point) return '';
    const pad = (value) => String(value).padStart(2, '0');
    return [String(point.year).padStart(4, '0'), point.month && pad(point.month), point.month && point.day && pad(point.day)].filter(Boolean).join('-');
  }

  // GEDCOM date value → { date, endDate, dateText, qualifier }.
  function fromGedcomDate(value, phrase = '') {
    let text = String(value || '').trim();
    let inlinePhrase = '';
    const parenthesised = text.match(/\(([^)]*)\)\s*$/);
    if (parenthesised) {
      inlinePhrase = parenthesised[1].trim();
      text = text.slice(0, parenthesised.index).trim();
    }
    text = text.replace(/@#D[A-Z ]+@\s*/gi, '').replace(/\b(?:GREGORIAN|JULIAN|HEBREW|FRENCH_R)\b\s*/gi, '').trim();
    const upper = text.toUpperCase();
    let qualifier = 'exact';
    let start = null;
    let end = null;
    let match;
    if ((match = upper.match(/^BET\s+(.+?)\s+AND\s+(.+)$/))) {
      qualifier = 'between'; start = parseGedcomPoint(match[1]); end = parseGedcomPoint(match[2]);
    } else if ((match = upper.match(/^FROM\s+(.+?)(?:\s+TO\s+(.+))?$/))) {
      qualifier = 'period'; start = parseGedcomPoint(match[1]); end = match[2] ? parseGedcomPoint(match[2]) : null;
    } else if ((match = upper.match(/^TO\s+(.+)$/))) {
      qualifier = 'before'; start = parseGedcomPoint(match[1]);
    } else if ((match = upper.match(/^(ABT|CAL|EST|BEF|AFT|INT)\s+(.+)$/))) {
      qualifier = { ABT: 'about', CAL: 'calculated', EST: 'estimated', BEF: 'before', AFT: 'after', INT: 'exact' }[match[1]];
      start = parseGedcomPoint(match[2]);
    } else if (upper) {
      start = parseGedcomPoint(upper);
    }
    const prefix = { about: 'asi ', calculated: 'vypočteno ', estimated: 'odhadem ', before: 'před ', after: 'po ' }[qualifier] || '';
    let generated = '';
    if (qualifier === 'between' && start && end) generated = `mezi ${czechPoint(start)} a ${czechPoint(end)}`;
    else if (qualifier === 'period' && start) generated = end ? `od ${czechPoint(start)} do ${czechPoint(end)}` : `od ${czechPoint(start)}`;
    else if (start) generated = prefix + czechPoint(start);
    const dateText = String(phrase || '').trim() || inlinePhrase || generated || String(value || '').trim();
    const result = { qualifier, dateText };
    if (start) result.date = isoPoint(start);
    if (end) result.endDate = isoPoint(end);
    return result;
  }

  // ---------------------------------------------------------------- writing

  function escapeValue(value) {
    const text = String(value);
    return text.startsWith('@') ? `@${text}` : text;
  }

  function createWriter() {
    const lines = [];
    function add(level, tag, value, xref) {
      const head = xref ? `${level} ${xref} ${tag}` : `${level} ${tag}`;
      if (value === undefined || value === null || value === '') {
        lines.push(head);
        return;
      }
      const parts = String(value).replace(/\r\n?/g, '\n').split('\n');
      lines.push(`${head} ${escapeValue(parts[0])}`.trimEnd());
      for (const part of parts.slice(1)) lines.push(part ? `${level + 1} CONT ${escapeValue(part)}` : `${level + 1} CONT`);
    }
    function pointer(level, tag, target) {
      lines.push(`${level} ${tag} ${target}`);
    }
    return { add, pointer, lines };
  }

  function formatCoordinate(value, positive, negative) {
    const number = Math.round(Math.abs(value) * 1e6) / 1e6;
    return `${value < 0 ? negative : positive}${number}`;
  }

  function validCoordinates(place) {
    return place && Number.isFinite(place.lat) && Number.isFinite(place.lon)
      && place.lat >= -90 && place.lat <= 90 && place.lon >= -180 && place.lon <= 180;
  }

  function placeName(place) {
    return [place.name, place.region, place.country].filter(Boolean).join(', ');
  }

  function strongestEvidence(values) {
    let best = null;
    for (const value of values) if (EVIDENCE_RANK.includes(value) && (!best || EVIDENCE_RANK.indexOf(value) > EVIDENCE_RANK.indexOf(best))) best = value;
    return best;
  }

  function yearOf(part) {
    const point = parseIsoPoint(part?.date);
    if (point) return point.year;
    const years = String(part?.dateText || '').match(YEAR);
    return years ? Number(years[0]) : null;
  }

  function nowYear(now) {
    const date = now instanceof Date ? now : new Date(now || Date.now());
    return date.getUTCFullYear();
  }

  // People to hide: no recorded death and born less than 100 years ago. Without
  // a birth year the person is hidden when a parent or partner is hidden or a
  // child was born recently enough that the parent may still live.
  function livingPeople(data, now) {
    const limit = nowYear(now) - LIVING_YEARS;
    const people = data.people || [];
    const byId = new Map(people.map((person) => [person.id, person]));
    const parents = new Map();
    const children = new Map();
    const partners = new Map();
    const push = (map, key, value) => { if (!map.has(key)) map.set(key, []); map.get(key).push(value); };
    for (const relation of data.relationships || []) {
      if (relation.type === 'parent-child') { push(parents, relation.to, relation.from); push(children, relation.from, relation.to); }
      if (relation.type === 'spouse') { push(partners, relation.from, relation.to); push(partners, relation.to, relation.from); }
    }
    const hidden = new Set();
    for (const person of people) {
      const year = yearOf(person.birth);
      if (!person.death && year && year > limit) hidden.add(person.id);
    }
    let changed = true;
    while (changed) {
      changed = false;
      for (const person of people) {
        if (hidden.has(person.id) || person.death || yearOf(person.birth)) continue;
        const related = [...(parents.get(person.id) || []), ...(partners.get(person.id) || [])];
        const childYears = (children.get(person.id) || []).map((id) => yearOf(byId.get(id)?.birth)).filter(Boolean);
        if (related.some((id) => hidden.has(id)) || childYears.some((year) => year - 15 > limit)) {
          hidden.add(person.id);
          changed = true;
        }
      }
    }
    return hidden;
  }

  // Splits a display name into given names and the displayed surname using the
  // recorded surnames; "…, rozená X" adds a maiden name.
  function splitDisplayName(person) {
    const [main, ...rest] = String(person.displayName || '').split(',');
    const tokens = main.trim().split(/\s+/).filter(Boolean);
    const maiden = rest.join(',').match(/\broz(?:ená|ený|\.)\s+(.+)$/i)?.[1]?.trim() || '';
    const keys = new Set([...(person.surnames || []), maiden].filter(Boolean).map((name) => surnameStem(name)));
    let index = -1;
    for (let i = tokens.length - 1; i > 0; i -= 1) if (keys.has(surnameStem(tokens[i]))) { index = i; break; }
    if (index < 0 && tokens.length > 1) index = tokens.length - 1;
    return {
      given: index < 0 ? tokens.join(' ') : tokens.slice(0, index).join(' '),
      surname: index < 0 ? '' : tokens.slice(index).join(' '),
      maiden,
    };
  }

  function toGedcom(data, options = {}) {
    const living = options.living === 'private' ? 'private' : 'include';
    const now = options.now ? new Date(options.now) : new Date();
    const hidden = living === 'private' ? livingPeople(data, now) : new Set();
    const people = data.people || [];
    const relationships = data.relationships || [];
    const events = data.events || [];
    const claims = data.claims || [];
    const sources = data.sources || [];
    const media = data.media || [];
    const places = new Map((data.places || []).map((place) => [place.id, place]));
    const peopleById = new Map(people.map((person) => [person.id, person]));
    const xrefOf = {};

    people.forEach((person, index) => { xrefOf[person.id] = `@I${index + 1}@`; });

    // Families: one per recorded partnership, then one per exact parent set.
    const families = [];
    const familyByKey = new Map();
    const familyOfRelationship = new Map();
    const ensureFamily = (ids) => {
      const key = [...new Set(ids)].sort().join('|');
      if (!familyByKey.has(key)) {
        const family = { key, partners: [...new Set(ids)], children: [], relationships: [], spouse: false };
        familyByKey.set(key, family);
        families.push(family);
      }
      return familyByKey.get(key);
    };
    for (const relation of relationships) {
      if (relation.type !== 'spouse' || !peopleById.has(relation.from) || !peopleById.has(relation.to)) continue;
      const family = ensureFamily([relation.from, relation.to]);
      family.spouse = true;
      family.relationships.push(relation);
      familyOfRelationship.set(relation.id, family);
    }
    const parentRelations = new Map();
    for (const relation of relationships) {
      if (relation.type !== 'parent-child' || !peopleById.has(relation.from) || !peopleById.has(relation.to)) continue;
      if (!parentRelations.has(relation.to)) parentRelations.set(relation.to, []);
      parentRelations.get(relation.to).push(relation);
    }
    for (const person of people) {
      const relations = parentRelations.get(person.id);
      if (!relations) continue;
      // GEDCOM families hold at most two partners; more parents are split in pairs.
      const parentIds = [...new Set(relations.map((relation) => relation.from))];
      for (let i = 0; i < parentIds.length; i += 2) {
        const group = parentIds.slice(i, i + 2);
        const family = ensureFamily(group);
        family.children.push(person.id);
        for (const relation of relations) {
          if (!group.includes(relation.from)) continue;
          family.relationships.push(relation);
          familyOfRelationship.set(relation.id, family);
        }
      }
    }
    const marriageEvents = events.filter((event) => FAMILY_EVENT_TAGS[event.type] && (event.personIds || []).length >= 2
      && event.personIds.slice(0, 2).every((id) => peopleById.has(id)));
    for (const event of marriageEvents) {
      const family = ensureFamily(event.personIds.slice(0, 2));
      if (event.type === 'marriage') family.spouse = true;
    }
    families.forEach((family, index) => {
      family.xref = `@F${index + 1}@`;
      for (const relation of family.relationships) xrefOf[relation.id] = family.xref;
    });

    // Sources: in private mode a source cited only by hidden content is left
    // out and one cited by hidden content loses its transcription.
    const sourceIndex = new Map(sources.map((source) => [source.id, source]));
    const citedByHidden = new Set();
    const citedByVisible = new Set();
    const cite = (ids, isHidden) => { for (const id of ids || []) (isHidden ? citedByHidden : citedByVisible).add(id); };
    const involvesHidden = (ids) => (ids || []).some((id) => hidden.has(id));
    for (const person of people) cite(person.sourceIds, hidden.has(person.id));
    for (const relation of relationships) cite(relation.sourceIds, hidden.has(relation.from) || hidden.has(relation.to));
    for (const event of events) cite(event.sourceIds, involvesHidden(event.personIds));
    for (const item of media) cite([item.sourceId], involvesHidden(item.personIds));
    const claimHidden = (claim) => {
      if (claim.subjectType === 'person') return hidden.has(claim.subjectId);
      const relation = relationships.find((item) => item.id === claim.subjectId);
      if (relation) return hidden.has(relation.from) || hidden.has(relation.to);
      const event = events.find((item) => item.id === claim.subjectId);
      if (event) return involvesHidden(event.personIds);
      return false;
    };
    for (const claim of claims) cite(claim.sourceIds, claimHidden(claim));
    const exportedSources = sources.filter((source) => !hidden.size || citedByVisible.has(source.id) || !citedByHidden.has(source.id));
    exportedSources.forEach((source, index) => { xrefOf[source.id] = `@S${index + 1}@`; });
    const exportedMedia = media.filter((item) => !involvesHidden(item.personIds));
    exportedMedia.forEach((item, index) => { xrefOf[item.id] = `@O${index + 1}@`; });

    const writer = createWriter();
    const { add, pointer } = writer;

    const writeCitations = (level, sourceIds, evidence, seen = new Set()) => {
      for (const id of sourceIds || []) {
        if (!xrefOf[id] || !sourceIndex.has(id) || seen.has(id)) continue;
        seen.add(id);
        const source = sourceIndex.get(id);
        pointer(level, 'SOUR', xrefOf[id]);
        const page = source.page || source.imageRef || source.archivePath;
        if (page) add(level + 1, 'PAGE', page);
        if (evidence in QUAY) add(level + 1, 'QUAY', String(QUAY[evidence]));
      }
    };

    const writePlace = (level, placeId, placeText) => {
      const place = placeId ? places.get(placeId) : null;
      const name = place ? placeName(place) : String(placeText || '').trim();
      if (!name) return;
      add(level, 'PLAC', name);
      if (validCoordinates(place)) {
        add(level + 1, 'MAP');
        add(level + 2, 'LATI', formatCoordinate(place.lat, 'N', 'S'));
        add(level + 2, 'LONG', formatCoordinate(place.lon, 'E', 'W'));
      }
    };

    const writeDate = (level, date, endDate, dateText) => {
      const converted = toGedcomDate(date, { endDate, dateText });
      if (!converted) return;
      add(level, 'DATE', converted.value);
      if (converted.phrase) add(level + 1, 'PHRASE', converted.phrase);
    };

    const claimNote = (claim) => {
      const label = EVIDENCE_LABELS[claim.evidence] || claim.evidence || 'neuvedeno';
      return [`Tvrzení (${label}): ${claim.text || ''}`.trim(), claim.reasoning ? `Odůvodnění: ${claim.reasoning}` : ''].filter(Boolean).join('\n');
    };
    const writeClaims = (level, list) => {
      for (const claim of list) {
        add(level, 'NOTE', claimNote(claim));
        writeCitations(level + 1, claim.sourceIds, claim.evidence);
      }
    };
    const claimsFor = (type, id) => claims.filter((claim) => claim.subjectType === type && claim.subjectId === id);
    const placedClaims = new Set();
    const claimsBySubject = (ids) => claims.filter((claim) => ids.includes(claim.subjectId) && !placedClaims.has(claim.id));

    const writeEvent = (level, tag, event, extra = {}) => {
      add(level, tag, extra.value);
      if (extra.type) add(level + 1, 'TYPE', extra.type);
      writeDate(level + 1, event.date, event.endDate, event.dateText);
      writePlace(level + 1, event.placeId, event.placeText);
      for (const other of extra.associates || []) {
        if (!xrefOf[other] || other === extra.principal) continue;
        pointer(level + 1, 'ASSO', xrefOf[other]);
        add(level + 2, 'ROLE', 'OTHER');
      }
      if (event.fromPlaceId && places.get(event.fromPlaceId)) add(level + 1, 'NOTE', `Odkud: ${placeName(places.get(event.fromPlaceId))}`);
      for (const note of [].concat(event.notes || [], event.details || [])) if (typeof note === 'string' && note) add(level + 1, 'NOTE', note);
      if (event.id) {
        const list = claimsBySubject([event.id]).filter((claim) => claim.subjectType === 'event');
        list.forEach((claim) => placedClaims.add(claim.id));
        writeClaims(level + 1, list);
      }
      writeCitations(level + 1, event.sourceIds, event.evidence);
    };

    // HEAD
    add(0, 'HEAD');
    add(1, 'GEDC');
    add(2, 'VERS', '7.0');
    add(1, 'CHAR', 'UTF-8');
    add(1, 'SCHMA');
    add(2, 'TAG', `${COPARENTS_TAG} ${COPARENTS_URI}`);
    add(1, 'SOUR', 'RODOVA-KRONIKA');
    add(2, 'NAME', 'Rodová kronika');
    if (data.meta?.version) add(2, 'VERS', data.meta.version);
    add(1, 'DATE', gedcomPoint({ year: now.getUTCFullYear(), month: now.getUTCMonth() + 1, day: now.getUTCDate() }));
    add(1, 'LANG', 'cs');
    if (hidden.size) add(1, 'NOTE', `Žijící osoby (${hidden.size}) jsou skryté: zůstává jen jméno „${LIVING_NAME}“ a rodinné vazby.`);

    // INDI
    for (const person of people) {
      const xref = xrefOf[person.id];
      add(0, 'INDI', undefined, xref);
      if (hidden.has(person.id)) {
        add(1, 'NAME', LIVING_NAME);
        for (const family of families) {
          if (family.children.includes(person.id)) pointer(1, 'FAMC', family.xref);
        }
        for (const family of families) {
          if (family.partners.includes(person.id)) pointer(1, 'FAMS', family.xref);
        }
        continue;
      }
      const name = splitDisplayName(person);
      add(1, 'NAME', `${name.given}${name.surname ? ` /${name.surname}/` : ''}`.trim());
      if (name.given) add(2, 'GIVN', name.given);
      if (name.surname) add(2, 'SURN', name.surname);
      const shown = new Set([surnameStem(name.surname)]);
      const others = [name.maiden, ...(person.surnames || [])].filter((surname) => surname && !shown.has(surnameStem(surname)) && shown.add(surnameStem(surname)));
      for (const surname of others) {
        add(1, 'NAME', `${name.given} /${surname}/`.trim());
        add(2, 'TYPE', person.sex === 'female' && (surname === name.maiden || surname === person.surnames?.[0]) ? 'MAIDEN' : 'AKA');
      }
      for (const alias of person.aliases || []) {
        const tokens = String(alias).trim().split(/\s+/);
        add(1, 'NAME', tokens.length > 1 ? `${tokens.slice(0, -1).join(' ')} /${tokens[tokens.length - 1]}/` : alias);
        add(2, 'TYPE', 'AKA');
      }
      add(1, 'SEX', person.sex === 'male' ? 'M' : person.sex === 'female' ? 'F' : 'U');

      const own = events.filter((event) => (event.personIds || [])[0] === person.id && EVENT_TAGS[event.type]);
      for (const part of ['birth', 'death']) {
        const record = person[part];
        const matching = own.filter((event) => event.type === part && record && (!event.date || !record.date || event.date === record.date));
        if (!record && !matching.length) continue;
        if (record) {
          const merged = {
            date: record.date || matching[0]?.date, dateText: record.dateText || matching[0]?.dateText,
            placeId: record.placeId || matching.find((event) => event.placeId)?.placeId,
            placeText: record.placeText || matching.find((event) => event.placeText)?.placeText,
            sourceIds: [...new Set(matching.flatMap((event) => event.sourceIds || []))],
            evidence: strongestEvidence(matching.map((event) => event.evidence)),
            notes: matching.flatMap((event) => [].concat(event.notes || [])),
          };
          writeEvent(1, part === 'birth' ? 'BIRT' : 'DEAT', merged);
          const list = claimsBySubject(matching.map((event) => event.id));
          list.forEach((claim) => placedClaims.add(claim.id));
          writeClaims(2, list);
        }
      }
      for (const event of own) {
        if ((event.type === 'birth' || event.type === 'death') && person[event.type]
          && (!event.date || !person[event.type].date || event.date === person[event.type].date)) continue;
        const tag = EVENT_TAGS[event.type];
        const value = tag === 'OCCU' ? event.title : tag === 'PROP' ? event.title : undefined;
        writeEvent(1, tag, event, { value, associates: event.personIds, principal: person.id });
      }
      for (const occupation of person.occupations || []) add(1, 'OCCU', occupation);
      for (const residence of person.residences || []) {
        add(1, 'RESI');
        writePlace(2, places.has(residence) ? residence : null, residence);
      }
      for (const family of families) if (family.children.includes(person.id)) pointer(1, 'FAMC', family.xref);
      for (const family of families) if (family.partners.includes(person.id)) pointer(1, 'FAMS', family.xref);
      for (const relation of relationships) {
        if (relation.type !== 'sibling') continue;
        const other = relation.from === person.id ? relation.to : relation.to === person.id ? relation.from : null;
        if (!other || !xrefOf[other]) continue;
        pointer(1, 'ASSO', xrefOf[other]);
        add(2, 'ROLE', 'OTHER');
        add(3, 'PHRASE', 'sourozenec');
        writeCitations(2, relation.sourceIds, relation.evidence);
      }
      for (const item of exportedMedia) if ((item.personIds || []).includes(person.id)) pointer(1, 'OBJE', xrefOf[item.id]);
      for (const note of person.notes || []) add(1, 'NOTE', note);
      const personClaims = claimsFor('person', person.id).filter((claim) => !placedClaims.has(claim.id));
      personClaims.forEach((claim) => placedClaims.add(claim.id));
      writeClaims(1, personClaims);
      writeCitations(1, person.sourceIds);
      add(1, 'REFN', person.id);
      add(2, 'TYPE', 'rodova-kronika');
    }

    // FAM
    const isHiddenFamily = (family) => family.partners.some((id) => hidden.has(id));
    for (const family of families) {
      add(0, 'FAM', undefined, family.xref);
      const ordered = [...family.partners].sort((a, b) => {
        const rank = (id) => ({ male: 0, female: 1 }[peopleById.get(id)?.sex] ?? 0.5);
        return rank(a) - rank(b);
      });
      const [first, second] = ordered;
      const firstSex = peopleById.get(first)?.sex;
      if (ordered.length === 1) pointer(1, firstSex === 'female' ? 'WIFE' : 'HUSB', xrefOf[first]);
      else { pointer(1, 'HUSB', xrefOf[first]); pointer(1, 'WIFE', xrefOf[second]); }
      for (const child of family.children) pointer(1, 'CHIL', xrefOf[child]);
      if (ordered.length === 2 && !family.spouse) add(1, COPARENTS_TAG, 'Y');
      if (!isHiddenFamily(family)) {
        for (const event of marriageEvents) {
          if (ensureFamily(event.personIds.slice(0, 2)) !== family) continue;
          writeEvent(1, FAMILY_EVENT_TAGS[event.type], event);
        }
      }
      const visibleRelations = family.relationships.filter((relation) => !hidden.has(relation.from) && !hidden.has(relation.to));
      const familyClaims = claimsBySubject(visibleRelations.map((relation) => relation.id));
      familyClaims.forEach((claim) => placedClaims.add(claim.id));
      writeClaims(1, familyClaims);
      const seen = new Set();
      for (const relation of visibleRelations) {
        const evidence = relation.evidence || strongestEvidence(claimsFor(relation.type === 'spouse' ? 'couple' : 'relationship', relation.id)
          .concat(claimsFor('relationship', relation.id)).map((claim) => claim.evidence));
        writeCitations(1, relation.sourceIds, evidence, seen);
      }
    }

    // SOUR
    for (const source of exportedSources) {
      add(0, 'SOUR', undefined, xrefOf[source.id]);
      if (source.title) add(1, 'TITL', source.title);
      if (source.speaker) add(1, 'AUTH', source.speaker);
      if (source.publisher || source.origin) add(1, 'PUBL', source.publisher || source.origin);
      if (source.url) add(1, 'WWW', source.url);
      const lines = Array.isArray(source.transcriptionLines) ? source.transcriptionLines.filter((line) => typeof line === 'string') : [];
      if (lines.length && !citedByHidden.has(source.id)) add(1, 'TEXT', lines.join('\n'));
      if (source.reliabilityNote) add(1, 'NOTE', source.reliabilityNote);
      const sourceClaims = claimsFor('source', source.id).filter((claim) => !placedClaims.has(claim.id));
      sourceClaims.forEach((claim) => placedClaims.add(claim.id));
      writeClaims(1, sourceClaims);
      add(1, 'REFN', source.id);
      add(2, 'TYPE', 'rodova-kronika');
    }

    // OBJE
    for (const item of exportedMedia) {
      add(0, 'OBJE', undefined, xrefOf[item.id]);
      const file = String(item.file || '');
      add(1, 'FILE', file.includes('/') ? `assets/${file}` : `assets/optimized/${file}`);
      add(2, 'FORM', mediaType(file, item.kind));
      if (item.kind === 'audio-clip') add(3, 'MEDI', 'AUDIO');
      else if (/photo/.test(item.kind || '')) add(3, 'MEDI', 'PHOTO');
      if (item.title) add(2, 'TITL', item.title);
      const details = [
        item.speaker ? `Mluví: ${item.speaker}` : '',
        Number.isFinite(item.start) && Number.isFinite(item.end) ? `Úsek rozhovoru ${item.start}–${item.end} s` : '',
        item.quote ? `„${item.quote}“` : '',
      ].filter(Boolean).join('\n');
      if (details) add(1, 'NOTE', details);
      if (item.sourceId) writeCitations(1, [item.sourceId]);
      add(1, 'REFN', item.id);
      add(2, 'TYPE', 'rodova-kronika');
    }

    // Claims about places, branches or anything else without a GEDCOM record.
    let noteIndex = 0;
    for (const claim of claims) {
      if (placedClaims.has(claim.id) || claimHidden(claim)) continue;
      if (claim.subjectType === 'relationship' || claim.subjectType === 'couple' || claim.subjectType === 'event') {
        const relation = relationships.find((item) => item.id === claim.subjectId);
        if (relation && hidden.size && (hidden.has(relation.from) || hidden.has(relation.to))) continue;
      }
      noteIndex += 1;
      const subject = claim.subjectType === 'place' && places.get(claim.subjectId) ? `Místo ${placeName(places.get(claim.subjectId))}. ` : '';
      add(0, 'SNOTE', subject + claimNote(claim), `@N${noteIndex}@`);
      writeCitations(1, claim.sourceIds, claim.evidence);
    }

    add(0, 'TRLR');
    return { text: `${writer.lines.join('\r\n')}\r\n`, xrefOf };
  }

  function mediaType(file, kind) {
    const extension = String(file).toLowerCase().split('.').pop();
    const types = {
      webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', tif: 'image/tiff', tiff: 'image/tiff',
      pdf: 'application/pdf', mp3: 'audio/mpeg', m4a: 'audio/mp4', ogg: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav',
      mp4: 'video/mp4', webm: kind === 'audio-clip' ? 'audio/webm' : 'video/webm', html: 'text/html', txt: 'text/plain',
    };
    return types[extension] || 'application/octet-stream';
  }

  // ---------------------------------------------------------------- parsing

  // Tolerant line parser for GEDCOM 5.5.1 and 7: BOM, CRLF/CR, blank lines,
  // leading spaces, CONT/CONC and level jumps are accepted.
  function parseGedcom(text) {
    const source = String(text || '').replace(/^﻿/, '');
    const records = [];
    const stack = [];
    const errors = [];
    source.split(/\r\n|\r|\n/).forEach((raw, index) => {
      const line = raw.replace(/^\s+/, '');
      if (!line.trim()) return;
      const match = line.match(/^(\d+)\s+(?:(@[^@\s][^@]*@)\s+)?([A-Za-z0-9_]+)(?:\s(.*))?$/);
      if (!match) { errors.push({ line: index + 1, text: raw }); return; }
      const level = Number(match[1]);
      const tag = match[3].toUpperCase();
      let value = match[4] === undefined ? '' : match[4];
      if (tag === 'CONT' || tag === 'CONC') {
        const parent = stack[Math.min(level, stack.length) - 1];
        if (!parent) { errors.push({ line: index + 1, text: raw }); return; }
        if (value.startsWith('@@')) value = value.slice(1);
        parent.value = (parent.value || '') + (tag === 'CONT' ? '\n' : '') + value;
        return;
      }
      const node = { level, tag, value: '', children: [] };
      if (match[2]) node.xref = match[2].slice(1, -1);
      if (/^@[^@#\s][^@]*@$/.test(value)) node.pointer = value.slice(1, -1);
      else node.value = value.startsWith('@@') ? value.slice(1) : value;
      if (level === 0) {
        records.push(node);
        stack.length = 0;
        stack[0] = node;
        return;
      }
      const parentLevel = Math.min(level, stack.length) - 1;
      const parent = stack[parentLevel];
      if (!parent) { errors.push({ line: index + 1, text: raw }); return; }
      parent.children.push(node);
      stack.length = parentLevel + 1;
      stack[parentLevel + 1] = node;
    });
    const head = records.find((record) => record.tag === 'HEAD') || null;
    const byXref = {};
    for (const record of records) if (record.xref) byXref[record.xref] = record;
    const version = child(child(head, 'GEDC'), 'VERS')?.value || '';
    return { version, head, records: records.filter((record) => record.tag !== 'HEAD' && record.tag !== 'TRLR'), byXref, errors };
  }

  function child(node, tag) {
    return node?.children.find((item) => item.tag === tag) || null;
  }

  function childrenOf(node, tag) {
    return node ? node.children.filter((item) => item.tag === tag) : [];
  }

  // ---------------------------------------------------------------- candidates

  function slug(value) {
    return stripDiacritics(String(value || '')).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'soubor';
  }

  function safeXref(value) {
    return String(value).replace(/[^A-Za-z0-9_-]+/g, '-');
  }

  function parseCoordinate(value) {
    const match = String(value || '').trim().match(/^([NSEW])?\s*(-?\d+(?:\.\d+)?)$/i);
    if (!match) return null;
    const number = Number(match[2]);
    return /[SW]/i.test(match[1] || '') ? -Math.abs(number) : number;
  }

  function gedcomToCandidates(tree, options = {}) {
    const fileName = options.fileName || child(tree.head, 'FILE')?.value || 'soubor.ged';
    const importSourceId = `gedcom-import-${slug(fileName)}`;
    const verifyNote = `Převzato z GEDCOM ${fileName}; pracovní stopa, vyžaduje ověření v primárním prameni.`;
    const people = [];
    const relationships = [];
    const events = [];
    const places = [];
    const sources = [{
      id: importSourceId, title: `import GEDCOM ${fileName}`, type: 'gedcom-import',
      transcriptionLines: [], reliabilityNote: `Cizí soubor GEDCOM ${fileName}. ${verifyNote}`,
    }];
    const placeByName = new Map();
    const idOf = (xref) => `gedcom-${safeXref(xref)}`;
    const records = tree.records || [];

    for (const record of records) {
      if (record.tag !== 'SOUR' || !record.xref) continue;
      const text = child(record, 'TEXT')?.value || child(child(record, 'DATA'), 'TEXT')?.value || '';
      const url = child(record, 'WWW')?.value || child(record, '_URL')?.value || '';
      const source = {
        id: idOf(record.xref), title: child(record, 'TITL')?.value || child(record, 'ABBR')?.value || `Pramen @${record.xref}@`,
        type: 'gedcom-source', transcriptionLines: text ? text.split('\n') : [], reliabilityNote: verifyNote,
      };
      const publisher = child(record, 'PUBL')?.value || child(record, 'AUTH')?.value;
      if (publisher) source.publisher = publisher;
      if (url) source.url = url;
      sources.push(source);
    }
    const knownSources = new Set(sources.map((source) => source.id));
    const citations = (node) => {
      const ids = [importSourceId];
      for (const citation of childrenOf(node, 'SOUR')) {
        if (citation.pointer && knownSources.has(idOf(citation.pointer))) ids.push(idOf(citation.pointer));
      }
      return [...new Set(ids)];
    };
    const placeOf = (node) => {
      const plac = child(node, 'PLAC');
      if (!plac?.value) return {};
      const name = plac.value.trim();
      if (!placeByName.has(name)) {
        const parts = name.split(',').map((part) => part.trim()).filter(Boolean);
        const place = { id: `gedcom-place-${placeByName.size + 1}`, name: parts[0] || name, country: parts.length > 1 ? parts[parts.length - 1] : '' };
        if (parts.length > 2) place.region = parts.slice(1, -1).join(', ');
        const map = child(plac, 'MAP');
        const lat = parseCoordinate(child(map, 'LATI')?.value);
        const lon = parseCoordinate(child(map, 'LONG')?.value);
        if (lat !== null && lon !== null) { place.lat = lat; place.lon = lon; place.coordinatesStatus = 'gedcom-import'; }
        placeByName.set(name, place);
        places.push(place);
      }
      return { placeId: placeByName.get(name).id, placeText: name };
    };
    const dateOf = (node) => {
      const date = child(node, 'DATE');
      if (!date) return null;
      return fromGedcomDate(date.value, child(date, 'PHRASE')?.value);
    };
    const notesOf = (node) => childrenOf(node, 'NOTE').map((note) => note.value).filter(Boolean);

    for (const record of records) {
      if (record.tag !== 'INDI' || !record.xref) continue;
      const id = idOf(record.xref);
      const names = childrenOf(record, 'NAME');
      const surnames = [];
      const displayNames = names.map((name) => {
        const value = name.value || [child(name, 'GIVN')?.value, child(name, 'SURN')?.value].filter(Boolean).join(' ');
        const surname = value.match(/\/([^/]*)\//)?.[1]?.trim() || child(name, 'SURN')?.value || '';
        if (surname && !surnames.includes(surname)) surnames.push(surname);
        return value.replace(/\//g, ' ').replace(/\s+/g, ' ').trim();
      }).filter(Boolean);
      const sex = String(child(record, 'SEX')?.value || '').toUpperCase();
      const person = {
        id, displayName: displayNames[0] || `Neznámá osoba @${record.xref}@`, surnames,
        sex: sex === 'M' ? 'male' : sex === 'F' ? 'female' : 'unknown',
        lineage: 'unlinked', branch: [], notes: [verifyNote, ...notesOf(record)], sourceIds: citations(record),
      };
      if (displayNames.length > 1) person.aliases = [...new Set(displayNames.slice(1))];
      for (const [tag, part] of [['BIRT', 'birth'], ['DEAT', 'death']]) {
        const node = child(record, tag);
        if (!node) continue;
        const date = dateOf(node);
        const value = {};
        if (date?.date && !['before', 'after', 'between', 'period'].includes(date.qualifier)) value.date = date.date;
        value.dateText = date?.dateText || (node.value === 'Y' ? 'ano' : '');
        Object.assign(value, placeOf(node));
        person[part] = value;
        for (const citation of citations(node)) if (!person.sourceIds.includes(citation)) person.sourceIds.push(citation);
      }
      const occupations = childrenOf(record, 'OCCU').map((node) => node.value).filter(Boolean);
      if (occupations.length) person.occupations = occupations;
      people.push(person);
      let counter = 0;
      for (const node of record.children) {
        const known = IMPORT_EVENTS[node.tag];
        if (!known || node.tag === 'MARR' || node.tag === 'DIV' || node.tag === 'ENGA') continue;
        if (node.tag === 'OCCU' && !child(node, 'DATE') && !child(node, 'PLAC')) continue;
        counter += 1;
        events.push(buildEvent(`${id}-${node.tag.toLowerCase()}-${counter}`, node, known, [id], person.displayName));
      }
    }
    const peopleIds = new Set(people.map((person) => person.id));

    function buildEvent(eventId, node, known, personIds, who) {
      const date = dateOf(node);
      const label = node.tag === 'EVEN' ? child(node, 'TYPE')?.value || known[1] : known[1];
      const event = {
        id: eventId, type: known[0], title: `${label}${node.value && node.value !== 'Y' ? `: ${node.value}` : ''} – ${who}`,
        dateText: date?.dateText || '', personIds, sourceIds: citations(node), evidence: 'hypothesis',
      };
      if (date?.date) event.date = date.date;
      if (date?.endDate) event.endDate = date.endDate;
      Object.assign(event, placeOf(node));
      const notes = notesOf(node);
      if (notes.length) event.notes = notes;
      return event;
    }

    const relationKeys = new Set();
    const addRelation = (type, from, to, familyXref, node) => {
      if (!peopleIds.has(from) || !peopleIds.has(to) || from === to) return;
      const key = type === 'parent-child' ? `${type}|${from}|${to}` : `${type}|${[from, to].sort().join('|')}`;
      if (relationKeys.has(key)) return;
      relationKeys.add(key);
      const suffix = type === 'parent-child' ? `${from.replace(/^gedcom-/, '')}-${to.replace(/^gedcom-/, '')}` : type;
      relationships.push({
        id: `gedcom-${safeXref(familyXref)}-${suffix}`, type, from, to,
        evidence: 'hypothesis', sourceIds: node ? citations(node) : [importSourceId],
      });
    };

    for (const record of records) {
      if (record.tag !== 'FAM' || !record.xref) continue;
      const partners = [...childrenOf(record, 'HUSB'), ...childrenOf(record, 'WIFE')].map((node) => node.pointer).filter(Boolean).map(idOf);
      const kids = childrenOf(record, 'CHIL').map((node) => node.pointer).filter(Boolean).map(idOf);
      for (const individual of records) {
        if (individual.tag !== 'INDI') continue;
        if (childrenOf(individual, 'FAMC').some((node) => node.pointer === record.xref) && !kids.includes(idOf(individual.xref))) kids.push(idOf(individual.xref));
        if (childrenOf(individual, 'FAMS').some((node) => node.pointer === record.xref) && !partners.includes(idOf(individual.xref)) && partners.length < 2) partners.push(idOf(individual.xref));
      }
      const coparents = String(child(record, COPARENTS_TAG)?.value || '').toUpperCase() === 'Y';
      if (partners.length === 2 && !coparents) addRelation('spouse', partners[0], partners[1], record.xref, record);
      for (const kid of kids) for (const parent of partners) addRelation('parent-child', parent, kid, record.xref, record);
      let counter = 0;
      for (const node of record.children) {
        const known = IMPORT_EVENTS[node.tag];
        if (!known || !['MARR', 'DIV', 'ENGA', 'EVEN'].includes(node.tag)) continue;
        counter += 1;
        const who = partners.map((id) => people.find((person) => person.id === id)?.displayName).filter(Boolean).join(' a ');
        events.push(buildEvent(`${idOf(record.xref)}-${node.tag.toLowerCase()}-${counter}`, node, known, partners.filter((id) => peopleIds.has(id)), who));
      }
    }

    for (const record of records) {
      if (record.tag !== 'INDI') continue;
      for (const asso of childrenOf(record, 'ASSO')) {
        const role = child(asso, 'ROLE');
        const label = [role?.value, child(role, 'PHRASE')?.value, child(asso, 'RELA')?.value].join(' ');
        if (asso.pointer && /sourozen|sibling|bratr|sestra/i.test(label)) addRelation('sibling', idOf(record.xref), idOf(asso.pointer), record.xref, asso);
      }
    }

    return { people, relationships, events, places, sources };
  }

  // ---------------------------------------------------------------- matching

  function stripDiacritics(value) {
    return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  function normalizeName(value) {
    return stripDiacritics(value).toLowerCase().replace(/[^a-z]+/g, ' ').trim();
  }

  // Masculine base of a Czech surname, so "Novák" and "Nováková", "Brabenka" and
  // "Brabenková", "Hájek" and "Hájková" or "Malý" and "Malá" share one key.
  function surnameStem(value) {
    const token = normalizeName(value).replace(/\s+/g, '');
    if (token.length > 4 && token.endsWith('ova')) return token.slice(0, -3);
    if (token.length > 2 && /[ayi]$/.test(token)) return token.slice(0, -1);
    // Mobile e of the masculine form: Hájek → Hájk(ová).
    if (token.length > 3 && /e[^aeiouy]$/.test(token)) return token.slice(0, -2) + token.slice(-1);
    return token;
  }

  function defaultNameKey(value, part) {
    return part === 'surname' ? surnameStem(value) : normalizeName(value);
  }

  function nameParts(person, nameKey) {
    const variants = [person.displayName, ...(person.aliases || [])].filter(Boolean);
    const surnameKeys = new Set((person.surnames || []).map((surname) => nameKey(surname, 'surname')).filter(Boolean));
    const given = new Set();
    for (const variant of variants) {
      const split = splitDisplayName({ displayName: variant, surnames: person.surnames });
      if (split.surname) surnameKeys.add(nameKey(split.surname, 'surname'));
      if (split.maiden) surnameKeys.add(nameKey(split.maiden, 'surname'));
      const first = split.given.split(/\s+/)[0];
      if (first) given.add(nameKey(first, 'given'));
    }
    surnameKeys.delete('');
    given.delete('');
    return { surnameKeys, given };
  }

  // Candidate people → existing people with the same given name and surname
  // (masculine base, without diacritics) and a birth year within the
  // tolerance. `nameKey(value, part)` can replace the default key, e.g. by a
  // phonetic one; `part` is "given" or "surname".
  function matchCandidates(candidates, data, options = {}) {
    const nameKey = typeof options.nameKey === 'function' ? options.nameKey : defaultNameKey;
    const tolerance = Number.isFinite(options.yearTolerance) ? options.yearTolerance : 2;
    const existing = (data?.people || []).map((person) => ({ person, parts: nameParts(person, nameKey), year: yearOf(person.birth) }));
    const matches = [];
    for (const candidate of candidates?.people || []) {
      const parts = nameParts(candidate, nameKey);
      const year = yearOf(candidate.birth);
      for (const entry of existing) {
        const surname = [...parts.surnameKeys].find((key) => entry.parts.surnameKeys.has(key));
        const given = [...parts.given].find((key) => entry.parts.given.has(key));
        if (!surname || !given) continue;
        const sexes = [candidate.sex, entry.person.sex];
        if (sexes.every((sex) => sex === 'male' || sex === 'female') && sexes[0] !== sexes[1]) continue;
        const reasons = [`shodné křestní jméno (${given})`, `shodné příjmení (${surname})`];
        let score = 0.6;
        if (year && entry.year) {
          const difference = Math.abs(year - entry.year);
          if (difference > tolerance) continue;
          score += difference === 0 ? 0.4 : difference === 1 ? 0.3 : 0.2;
          reasons.push(difference === 0 ? `stejný rok narození ${year}` : `rok narození ${year} / ${entry.year} (rozdíl ${difference})`);
        } else {
          reasons.push('rok narození nelze porovnat');
        }
        matches.push({ candidateId: candidate.id, personId: entry.person.id, score: Math.round(score * 100) / 100, reasons });
      }
    }
    return matches.sort((a, b) => (a.candidateId === b.candidateId ? b.score - a.score : 0));
  }

  return {
    toGedcom, parseGedcom, gedcomToCandidates, matchCandidates,
    toGedcomDate, fromGedcomDate, livingPeople, surnameStem, normalizeName, QUAY,
  };
});
