// Suggests entries for src/data/registers.json from the register signatures
// the sources already cite ("MZA 4664", "sign. 5189", IDs like src-mza-4664-…).
// It prints candidates with the places and years seen in the linked events;
// parish names and year ranges still have to be checked in the archive
// catalogue before they go into the catalogue.
//
//   node scripts/registers-from-sources.mjs [--data src/data/genealogy.json] > kandidati.json
import fs from 'node:fs/promises';

const index = process.argv.indexOf('--data');
const dataPath = index >= 0 ? process.argv[index + 1] : 'src/data/genealogy.json';
const data = JSON.parse(await fs.readFile(dataPath, 'utf8'));

const SIGNATURE = /(?:^|[^a-z])(?:mza|sign\.?|signatura)[\s-]*(\d{3,5})(?!\d)/gi;
const KIND_WORDS = [['N', /narozen|křest|křt|baptism|birth/i], ['O', /oddan|sňat|marriage/i], ['Z', /zemřel|úmrt|death|burial|pohřb/i]];
const year = (value) => Number(String(value || '').match(/(?<!\d)(1\d{3}|20\d{2})(?!\d)/)?.[1]) || null;

const candidates = new Map();
for (const source of data.sources || []) {
  const text = `${source.id} ${source.title} ${source.origin || ''}`;
  for (const match of text.matchAll(SIGNATURE)) {
    const signature = match[1];
    const entry = candidates.get(signature) || { signature, kinds: new Set(), placeIds: new Set(), years: [], sourceIds: [] };
    for (const [kind, pattern] of KIND_WORDS) if (pattern.test(text)) entry.kinds.add(kind);
    if (!entry.sourceIds.includes(source.id)) entry.sourceIds.push(source.id);
    for (const event of (data.events || []).filter((item) => (item.sourceIds || []).includes(source.id))) {
      if (event.placeId) entry.placeIds.add(event.placeId);
      if (year(event.date)) entry.years.push(year(event.date));
    }
    candidates.set(signature, entry);
  }
}

const registers = [...candidates.values()].sort((a, b) => a.signature.localeCompare(b.signature)).map((entry) => ({
  id: `reg-mza-${entry.signature}`,
  archive: 'MZA',
  signature: entry.signature,
  parish: '',
  placeIds: [...entry.placeIds].sort(),
  kinds: [...entry.kinds].sort(),
  from: entry.years.length ? Math.min(...entry.years) : null,
  to: entry.years.length ? Math.max(...entry.years) : null,
  index: false,
  note: `Kandidát z pramenů ${entry.sourceIds.slice(0, 3).join(', ')}${entry.sourceIds.length > 3 ? ' …' : ''}; doplň farnost a rozsah let z katalogu archivu.`,
}));
process.stdout.write(`${JSON.stringify({ registers }, null, 2)}\n`);
