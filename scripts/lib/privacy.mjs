// Privacy check shared by the public export and the GitHub Pages publisher:
// finds names, IDs, places, e-mails and personal text of a genealogy dataset
// in arbitrary text files. It knows no family data itself.
import fs from 'node:fs/promises';
import path from 'node:path';

const toPosix = (value) => value.split(path.sep).join('/');

// General place names may appear in the general history file (towns, regions),
// never names or IDs of people, e-mails or research text.
export const PLACE_TERMS_ALLOWED_IN = ['src/data/history.json'];

const ALLOWED_EMAIL_DOMAINS = /@(?:example\.(?:com|org|net|cz)|anthropic\.com)$/i;
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Builds the list of private terms from a genealogy dataset.
export function privateTerms(data) {
  const terms = new Map();
  const add = (value, kind, minLength = 4) => {
    const term = String(value || '').trim();
    if (term.length >= minLength && !terms.has(term)) terms.set(term, kind);
  };
  // A lone given name ("Josef") identifies nobody; full names and surnames do.
  const addName = (value) => { if (/\s/.test(String(value || '').trim())) add(value, 'jméno osoby'); };
  for (const person of data.people || []) {
    addName(person.displayName);
    for (const surname of person.surnames || []) add(surname, 'příjmení', 3);
    for (const alias of person.aliases || []) addName(alias);
  }
  for (const place of data.places || []) {
    add(place.name, 'místo');
    add(place.id, 'ID místa');
  }
  for (const key of ['people', 'relationships', 'events', 'claims', 'sources', 'media', 'researchTasks', 'changelog']) {
    for (const entry of data[key] || []) add(entry.id, key === 'people' ? 'ID osoby' : `ID (${key})`);
  }
  for (const media of data.media || []) {
    add(media.file && path.posix.basename(String(media.file)), 'soubor média');
    add(media.interview, 'ID rozhovoru');
    addName(media.speaker);
  }
  for (const source of data.sources || []) add(source.url, 'URL pramene', 12);
  if (data.meta?.feedback?.email) add(data.meta.feedback.email, 'e-mail');
  if (data.meta?.defaultPersonId) add(data.meta.defaultPersonId, 'ID osoby');
  return terms;
}

// Beginnings of longer personal texts (notes, claims, quotes, transcriptions).
export function textFingerprints(data) {
  const texts = [
    ...(data.people || []).flatMap((person) => person.notes || []),
    ...(data.claims || []).map((claim) => claim.text),
    ...(data.media || []).map((media) => media.quote),
    ...(data.sources || []).flatMap((source) => source.transcriptionLines || []),
  ];
  const fingerprints = new Set();
  for (const text of texts) {
    const normalised = String(text || '').replace(/\s+/g, ' ').trim();
    if (normalised.length >= 40) fingerprints.add(normalised.slice(0, 40));
  }
  return fingerprints;
}

const placeKinds = new Set(['místo', 'ID místa']);

export function createPrivacyChecker(data) {
  const terms = privateTerms(data);
  const fingerprints = textFingerprints(data);
  const sorted = [...terms.keys()].sort((a, b) => b.length - a.length);
  // A term counts only as a whole word (letters and digits around it end the
  // match), so "Bor" does not hit "Borovice". Czech case endings of up to
  // three lowercase letters are included: "Kalina" also finds "Kaliny".
  const pattern = sorted.length
    ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${sorted.map(escapeRegExp).join('|')})(?:\\p{Ll}{1,3})?(?![\\p{L}\\p{N}])`, 'gu')
    : null;
  const lookup = (match) => {
    if (terms.has(match)) return match;
    return sorted.find((term) => match.startsWith(term));
  };
  return function check(relativePath, text) {
    const findings = [];
    const placeAllowed = PLACE_TERMS_ALLOWED_IN.includes(toPosix(relativePath));
    if (pattern) {
      for (const match of text.matchAll(pattern)) {
        const term = lookup(match[0]);
        const kind = terms.get(term);
        if (placeAllowed && placeKinds.has(kind)) continue;
        findings.push({ file: relativePath, kind, term, index: match.index });
      }
    }
    for (const match of text.matchAll(/[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu)) {
      if (!ALLOWED_EMAIL_DOMAINS.test(match[0]) && !/\.(?:png|jpe?g|webp|svg|js|css)$/i.test(match[0])) {
        findings.push({ file: relativePath, kind: 'e-mail', term: match[0], index: match.index });
      }
    }
    const flat = text.replace(/\s+/g, ' ');
    for (const fingerprint of fingerprints) {
      const index = flat.indexOf(fingerprint);
      if (index >= 0) findings.push({ file: relativePath, kind: 'osobní text', term: fingerprint, index });
    }
    return findings;
  };
}

const isBinary = (buffer) => buffer.subarray(0, 8000).includes(0);

export async function checkFiles(root, files, data) {
  const check = createPrivacyChecker(data);
  const findings = [];
  for (const file of files) {
    const buffer = await fs.readFile(path.join(root, file));
    if (isBinary(buffer)) continue;
    findings.push(...check(file, buffer.toString('utf8')));
  }
  return findings;
}

export function formatFindings(findings, limit = 40) {
  const lines = findings.slice(0, limit).map((finding) => `  ${finding.file}: ${finding.kind} „${finding.term}“`);
  if (findings.length > limit) lines.push(`  … a dalších ${findings.length - limit}`);
  return lines.join('\n');
}
