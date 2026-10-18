(function registerHistory(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.RKHistory = api;
})(globalThis, function createHistoryModule() {
  'use strict';

  // Life on the background of history: general events from src/data/history.json
  // matched against a person's recorded life span. Nothing here knows any
  // person; uncertain dates widen into "asi" ages or "if still alive" notes
  // instead of guessing.

  const HEDGE = /podle|asi|cca|kolem|okolo|přibl|pravděpod|nejist|\?|\bnebo\b|;|\//i;
  const YEAR = /(?<!\d)(1\d{3}|20\d{2})(?!\d)/g;
  // Without a recorded death, events this many years after birth are shown only as possible.
  const SAFE_AGE = 60;
  const MAX_AGE = 100;

  function parsePoint(value) {
    const match = String(value || '').match(/^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/);
    if (!match) return null;
    return { year: Number(match[1]), month: match[2] ? Number(match[2]) : null, day: match[3] ? Number(match[3]) : null };
  }

  function yearsIn(...values) {
    return [...new Set(values.flatMap((value) => String(value || '').match(YEAR) || []).map(Number))].sort((a, b) => a - b);
  }

  function eventSpan(event) {
    const start = parsePoint(event?.date);
    if (!start) return null;
    const end = parsePoint(event.endDate) || start;
    return { start, end: end.year < start.year ? start : end };
  }

  // Years after which the person is known to have still been alive: own
  // records other than death or burial, and interviews they gave.
  function lastSeenYear(data, person) {
    const years = (data?.events || [])
      .filter((event) => (event.personIds || [])[0] === person.id && !['death', 'burial', 'burial-site'].includes(event.type))
      .map((event) => parsePoint(event.date)?.year).filter(Boolean);
    for (const media of data?.media || []) {
      if (media.kind !== 'audio-clip' || !(media.personIds || []).includes(person.id)) continue;
      if (!String(media.speaker || '').startsWith(person.displayName)) continue;
      const year = Number(String(media.interview || '').slice(0, 4));
      if (year) years.push(year);
    }
    return years.length ? Math.max(...years) : null;
  }

  // What is known about the life span, without filling gaps.
  function lifeSpan(person, data = null) {
    const birthPoint = parsePoint(person?.birth?.date);
    const birthYears = yearsIn(person?.birth?.date, person?.birth?.dateText);
    const birthYear = birthPoint?.year || birthYears[0] || null;
    if (!birthYear) return null;
    const birthExact = Boolean(birthPoint?.day) && !HEDGE.test(person.birth.dateText || '') && birthYears.length <= 1;
    const death = person?.death || null;
    const deathYears = death ? yearsIn(death.date, death.dateText) : [];
    const deathPoint = parsePoint(death?.date);
    return {
      birth: { year: birthYear, month: birthPoint?.month || null, day: birthPoint?.day || null, exact: birthExact, approximate: !birthExact },
      death: death ? {
        recorded: true,
        year: deathYears[0] || null,
        latestYear: deathYears.length ? deathYears[deathYears.length - 1] : null,
        month: deathPoint?.month || null,
        day: deathPoint?.day || null,
        exact: Boolean(deathPoint?.day) && deathYears.length === 1 && !HEDGE.test(death.dateText || ''),
      } : { recorded: false, year: null, latestYear: null },
      lastSeenYear: data ? lastSeenYear(data, person) : null,
    };
  }

  function compare(a, b) {
    if (a.year !== b.year) return a.year - b.year;
    if (a.month == null || b.month == null) return 0;
    if (a.month !== b.month) return a.month - b.month;
    if (a.day == null || b.day == null) return 0;
    return a.day - b.day;
  }

  function ageAt(birth, point) {
    let years = point.year - birth.year;
    let approximate = birth.approximate;
    if (birth.month && point.month) {
      if (point.month < birth.month || (point.month === birth.month && birth.day && point.day && point.day < birth.day)) years -= 1;
      else if (point.month === birth.month && !(birth.day && point.day)) approximate = true;
    } else approximate = true;
    return { years: Math.max(0, years), approximate };
  }

  // Places the person is connected with: birth, death, own records and homes
  // (a residence counts when it names the place).
  function personPlaceIds(person, data) {
    const ids = new Set([person?.birth?.placeId, person?.death?.placeId].filter(Boolean));
    for (const event of data?.events || []) {
      if (!(event.personIds || []).includes(person.id)) continue;
      if (event.placeId) ids.add(event.placeId);
      if (event.fromPlaceId) ids.add(event.fromPlaceId);
    }
    for (const place of data?.places || []) {
      const name = String(place.name || '').toLocaleLowerCase('cs').split(' ')[0];
      if (name && (person.residences || []).some((residence) => residence.toLocaleLowerCase('cs').includes(name))) ids.add(place.id);
    }
    return ids;
  }

  // Local events (with placeIds) belong only to people connected with one of
  // their places; general events belong to everybody.
  function appliesTo(event, places) {
    return !event.placeIds || event.placeIds.some((id) => places.has(id));
  }

  // Events the person lived through, oldest first. Each item has the age at
  // the start of the event and `possible` when the data cannot tell whether
  // the person was still alive.
  function lifeContext(person, events = [], options = {}) {
    const span = lifeSpan(person, options.data);
    if (!span) return { available: false, reason: 'birth-unknown', items: [] };
    const currentYear = options.currentYear || new Date().getFullYear();
    const { birth, death } = span;
    const places = personPlaceIds(person, options.data);
    const items = [];
    for (const event of events) {
      if (!appliesTo(event, places)) continue;
      const range = eventSpan(event);
      if (!range) continue;
      // Ended before the birth (compare() is 0 when precision does not allow a decision).
      if (compare(range.end, birth) < 0) continue;
      const startVsBirth = compare(range.start, birth);
      const bornDuring = startVsBirth < 0 || (startVsBirth === 0 && range.start.year === birth.year && !(range.start.day && birth.day));
      let possible = false;
      if (death.recorded && death.year) {
        if (range.start.year > death.latestYear) continue;
        if (range.start.year > death.year) possible = true;
        else if (range.start.year === death.year) {
          if (death.exact && range.start.month) {
            if (compare(range.start, death) > 0) continue;
          } else possible = true;
        }
      } else {
        if (range.start.year > Math.min(currentYear, birth.year + MAX_AGE)) continue;
        const safeUntil = Math.max(birth.year + SAFE_AGE, span.lastSeenYear || 0);
        if (range.start.year > safeUntil) possible = true;
      }
      const age = bornDuring ? null : ageAt(birth, range.start);
      items.push({ event, start: range.start, end: range.end, ranged: range.end.year !== range.start.year || range.end.month !== range.start.month, age, bornDuring, possible });
    }
    items.sort((a, b) => compare(a.start, b.start) || a.start.year - b.start.year);
    return { available: true, span, items };
  }

  function yearsWord(count) {
    const n = Math.abs(count);
    if (n === 1) return 'rok';
    if (n >= 2 && n <= 4) return 'roky';
    return 'let';
  }

  // "Bylo mu asi 23 let." / "Na začátku jí bylo 12 let." / "Narodila se v té době."
  function ageSentence(item, sex) {
    const pronoun = sex === 'male' ? 'mu' : sex === 'female' ? 'jí' : null;
    if (item.bornDuring && item.ranged) {
      return sex === 'male' ? 'Narodil se v té době.' : sex === 'female' ? 'Narodila se v té době.' : 'Narození spadá do této doby.';
    }
    if (item.bornDuring) {
      return sex === 'male' ? 'Stalo se v roce, kdy se narodil.' : sex === 'female' ? 'Stalo se v roce, kdy se narodila.' : 'Stalo se v roce narození.';
    }
    const { years, approximate } = item.age;
    const amount = years === 0 ? 'necelý rok' : `${approximate ? 'asi ' : ''}${years} ${yearsWord(years)}`;
    if (!pronoun) return `${item.ranged ? 'Věk na začátku' : 'Věk'}: ${amount}.`;
    return `${item.ranged ? `Na začátku ${pronoun} bylo` : `Bylo ${pronoun}`} ${amount}.`;
  }

  function possibleNote(sex) {
    return sex === 'male' ? 'Jen pokud byl tehdy naživu – rok úmrtí kronika nezná přesně.'
      : sex === 'female' ? 'Jen pokud byla tehdy naživu – rok úmrtí kronika nezná přesně.'
        : 'Jen pokud byl(a) tehdy naživu – rok úmrtí kronika nezná přesně.';
  }

  function formatPoint(point) {
    if (!point) return '';
    if (point.day) return `${point.day}. ${point.month}. ${point.year}`;
    if (point.month) return `${['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec'][point.month - 1]} ${point.year}`;
    return String(point.year);
  }

  function formatEventDate(event) {
    const range = eventSpan(event);
    if (!range) return '';
    if (range.end.year === range.start.year && range.end.month === range.start.month && range.end.day === range.start.day) return formatPoint(range.start);
    if (range.end.year === range.start.year) return formatPoint(range.start).replace(/ \d{4}$/, '') + `–${formatPoint(range.end)}`;
    return `${range.start.year}–${range.end.year}`;
  }

  // Historical items that fall between the earliest and latest year of the
  // listed family events (for the timeline), filtered by optional year bounds.
  function eventsBetween(events = [], fromYear, toYear) {
    return events.filter((event) => {
      const range = eventSpan(event);
      if (!range) return false;
      if (Number.isFinite(fromYear) && range.end.year < fromYear) return false;
      if (Number.isFinite(toYear) && range.start.year > toYear) return false;
      return true;
    });
  }

  function validateHistory(history) {
    const errors = [];
    const ids = new Set();
    for (const event of history?.events || []) {
      if (!event.id || ids.has(event.id)) errors.push(`Duplicitní nebo chybějící id: ${event.id}`);
      ids.add(event.id);
      if (!eventSpan(event)) errors.push(`${event.id}: neplatné datum`);
      if (!event.title || !event.summary) errors.push(`${event.id}: chybí název nebo popis`);
      if (!(event.sources || []).length || event.sources.some((source) => !/^https:\/\//.test(source.url || '') || !source.title)) errors.push(`${event.id}: chybí zdroj s odkazem`);
      if (event.placeIds !== undefined && (!Array.isArray(event.placeIds) || !event.placeIds.length || event.placeIds.some((id) => typeof id !== 'string' || !id))) errors.push(`${event.id}: placeIds musí být neprázdný seznam ID míst`);
    }
    return errors;
  }

  return { parsePoint, eventSpan, lifeSpan, lifeContext, ageSentence, possibleNote, formatEventDate, eventsBetween, validateHistory, yearsWord, personPlaceIds, appliesTo };
});
