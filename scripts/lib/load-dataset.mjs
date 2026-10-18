// Loads a chronicle dataset together with its optional companion files.
// Companion files live next to the dataset under fixed names and are joined
// by ID, so the main dataset stays the single source of genealogical truth:
//
//   gazetteer.json      { places: { <placeId>: { historicalNames, jurisdictions, parish, links, sources } } }
//   history-local.json  { events: [ ...history events with placeIds ] }
//   registers.json      { registers: [ { id, archive, signature, parish, placeIds, kinds, from, to, url } ] }
//   media-notes.json    { media: { <mediaId>: { date, dateText, dateEvidence, dateReasoning, regions } } }
//
// A missing file simply adds nothing. See docs/data-contract.md.
import fs from 'node:fs/promises';
import path from 'node:path';

export const COMPANION_FILES = {
  gazetteer: 'gazetteer.json',
  historyLocal: 'history-local.json',
  registers: 'registers.json',
  mediaNotes: 'media-notes.json',
};

const MEDIA_NOTE_FIELDS = ['date', 'dateText', 'dateEvidence', 'dateReasoning', 'regions'];

async function readJsonIfPresent(file) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new Error(`${file}: ${error.message}`);
  }
}

export async function readCompanions(directory) {
  const entries = await Promise.all(Object.entries(COMPANION_FILES).map(async ([key, name]) => [key, await readJsonIfPresent(path.join(directory, name))]));
  return Object.fromEntries(entries);
}

// Returns a copy of the dataset with companion data joined in. The source
// object is never changed.
export function mergeCompanions(data, companions = {}) {
  const merged = structuredClone(data);
  const gazetteer = companions.gazetteer?.places || {};
  for (const place of merged.places || []) {
    if (gazetteer[place.id]) place.historical = structuredClone(gazetteer[place.id]);
  }
  const notes = companions.mediaNotes?.media || {};
  for (const media of merged.media || []) {
    const note = notes[media.id];
    if (!note) continue;
    for (const field of MEDIA_NOTE_FIELDS) if (note[field] !== undefined) media[field] = structuredClone(note[field]);
  }
  if (companions.registers?.registers) merged.registers = structuredClone(companions.registers.registers);
  return merged;
}

// History events for the whole chronicle: the general file plus local events
// that only apply to people connected with their places.
export function mergeHistory(history, companions = {}) {
  const local = companions.historyLocal?.events || [];
  return { ...history, events: [...(history?.events || []), ...structuredClone(local)] };
}

export async function loadDataset(dataPath, { companionDirectory = path.dirname(dataPath) } = {}) {
  const data = JSON.parse(await fs.readFile(dataPath, 'utf8'));
  const companions = await readCompanions(companionDirectory);
  return { data, companions, merged: mergeCompanions(data, companions) };
}
