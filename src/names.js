(function registerNames(root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const givenNames = root.RK_GIVEN_NAMES || (isNode ? require('./data/given-names.json') : null);
  const api = factory(givenNames);
  if (isNode) module.exports = api;
  root.RKNames = api;
})(globalThis, function createNames(givenNames) {
  'use strict';

  // Name variants as they appear in registers: Czech, German and Latin
  // spellings of the same surname (Kadlec / Kadletz), female forms (-ová, -á)
  // and given names in other languages (Joannes = Jan). Keys are deliberately
  // loose; they suggest candidates, they never prove identity.

  function normalize(value = '') {
    return String(value).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').toLowerCase().replace(/[^a-z\s-]/g, '').trim();
  }

  const PHONETIC_RULES = [
    [/tsch/g, 'c'], [/sch/g, 's'], [/tz/g, 'c'], [/cz/g, 'c'], [/ch/g, 'h'], [/ck/g, 'k'], [/ph/g, 'f'], [/th/g, 't'],
    [/qu/g, 'kv'], [/x/g, 'ks'], [/w/g, 'v'], [/ie/g, 'i'], [/y/g, 'i'], [/(.)\1+/g, '$1'],
  ];

  // "Chládek", "Hládek", "Hlládek" → "hladek"; "Kadletz" → "kadlec".
  function phoneticKey(value) {
    let key = normalize(value).replace(/[\s-]+/g, '');
    for (const [pattern, replacement] of PHONETIC_RULES) key = key.replace(pattern, replacement);
    return key;
  }

  const CONSONANTS = 'bcdfghjklmnpqrstvwxz';

  // Masculine base candidates of a surname: "Šimková" → simek, "Vrbová" →
  // vrba, "Dvorská" → dvorsky. Male forms return themselves.
  function surnameStems(surname) {
    const word = normalize(surname).replace(/[\s-]+/g, '');
    if (!word) return [];
    const stems = new Set([word]);
    if (word.endsWith('ova') && word.length > 4) {
      const base = word.slice(0, -3);
      stems.add(base);
      stems.add(`${base}a`);
      const last = base.slice(-1);
      const beforeLast = base.slice(-2, -1);
      // Fleeting e: Šimk-ová → Šimek, Hájk-ová → Hájek.
      if (CONSONANTS.includes(last) && CONSONANTS.includes(beforeLast)) stems.add(`${base.slice(0, -1)}e${last}`);
    } else if (/[^oó]á$/i.test(String(surname).trim()) && word.length > 3) {
      // Adjective surnames: Dvorská → Dvorský.
      stems.add(`${word.slice(0, -1)}y`);
    }
    return [...stems];
  }

  function surnameKeys(surname) {
    return [...new Set(surnameStems(surname).map(phoneticKey))];
  }

  const variantToCanonical = new Map();
  for (const group of givenNames?.groups || []) {
    const canonical = normalize(group.canonical);
    for (const variant of [group.canonical, ...(group.variants || [])]) {
      const key = normalize(variant);
      if (key && !variantToCanonical.has(key)) variantToCanonical.set(key, canonical);
    }
  }

  // "Joannes", "Johann", "Hans" → "jan".
  function givenNameKey(name) {
    const key = normalize(name);
    return variantToCanonical.get(key) || phoneticKey(key);
  }

  function personNameParts(person) {
    const names = [person?.displayName, ...(person?.aliases || [])].filter(Boolean);
    const given = new Set();
    const surnames = new Set();
    for (const name of names) {
      const clean = String(name).replace(/,.*$/, '').replace(/\([^)]*\)/g, '').trim();
      const words = clean.split(/\s+/).filter(Boolean);
      if (words.length > 1) {
        given.add(givenNameKey(words[0]));
        for (const key of surnameKeys(words[words.length - 1])) surnames.add(key);
      } else if (words.length) {
        given.add(givenNameKey(words[0]));
      }
      const maiden = String(name).match(/roz(?:ená|\.)\s+([^\s,]+)/i);
      if (maiden) for (const key of surnameKeys(maiden[1])) surnames.add(key);
    }
    for (const surname of person?.surnames || []) for (const key of surnameKeys(surname)) surnames.add(key);
    return { given, surnames };
  }

  // Does a search word sound like any of the person's names?
  function tokenMatchesPerson(token, person) {
    const parts = personNameParts(person);
    if (parts.given.has(givenNameKey(token))) return true;
    return surnameKeys(token).some((key) => parts.surnames.has(key));
  }

  // The first name variant of the person that sounds like the token, for
  // "podobné jméno (Kadletz)" explanations.
  function matchingVariant(token, person) {
    const target = new Set(surnameKeys(token));
    const words = [person.displayName, ...(person.aliases || []), ...(person.surnames || [])].join(' ').split(/[\s,()]+/).filter(Boolean);
    return words.find((word) => surnameKeys(word).some((key) => target.has(key)) || givenNameKey(word) === givenNameKey(token)) || null;
  }

  // 0..1: same surname key and equivalent given name score 1.
  function nameSimilarity(a, b) {
    const left = personNameParts(a);
    const right = personNameParts(b);
    const surname = [...left.surnames].some((key) => right.surnames.has(key));
    const given = [...left.given].some((key) => right.given.has(key));
    return (surname ? 0.6 : 0) + (given ? 0.4 : 0);
  }

  return { normalize, phoneticKey, surnameStems, surnameKeys, givenNameKey, personNameParts, tokenMatchesPerson, matchingVariant, nameSimilarity };
});
