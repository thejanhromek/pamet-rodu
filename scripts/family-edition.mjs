/**
 * Build-only view of the canonical research archive for the family HTML edition.
 * This never mutates the source dataset; archival research detail remains in JSON.
 *
 * Dataset-specific wording lives outside the code in an optional overrides file
 * (default src/data/family-edition.json, see docs/data-contract.md):
 *   noteOverrides        { personId: [family-facing notes] } replaces filtered notes
 *   claimOverrides       { claimId: 'family-facing text' }
 *   omitClaimIds         claims left out of the family edition
 *   omitSourceIdPatterns extra regular expressions for source IDs left out
 *   noteReplacements     [[find, replace]] literal fixes applied to notes first
 *   wordingReplacements  [[find, replace]] literal fixes applied before the
 *                        general wording rules
 *   researcherName       { instrumental, genitive } names the researcher where the
 *                        research notes say "uživatel"; defaults to the chronicle keeper
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const defaultOverridesPath = fileURLToPath(new URL('../src/data/family-edition.json', import.meta.url));

export function loadEditionOverrides(file = defaultOverridesPath) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
}

const defaultOverrides = loadEditionOverrides();

function normaliseOverrides(overrides = {}) {
  return {
    noteOverrides: overrides.noteOverrides || {},
    claimOverrides: overrides.claimOverrides || {},
    omitClaimIds: new Set(overrides.omitClaimIds || []),
    omitSourceIdPatterns: (overrides.omitSourceIdPatterns || []).map((pattern) => new RegExp(pattern)),
    noteReplacements: overrides.noteReplacements || [],
    wordingReplacements: overrides.wordingReplacements || [],
    researcherName: {
      instrumental: overrides.researcherName?.instrumental || 'správcem kroniky',
      genitive: overrides.researcherName?.genitive || 'správce kroniky',
    },
  };
}

const replaceLiterals = (value, pairs) => pairs.reduce((text, [find, replace]) => text.replaceAll(find, replace), value);

// Archive citations and research bookkeeping belong to the research edition;
// the family reads the finding itself ("křest uvádí …"), not where it was read.
const archiveRef = String.raw`(?:MZA|matrika)(?: sign\.)? \d+(?:,? detail \d+)?(?:,? (?:scan|soubor|scany) \d+(?:[/–-]\d+)?)?(?:,? ?(?:\/ )?(?:strana|str\.|folio|fol\.|PM str\.) \d+[a-z]?)*`;
function plainArchiveWording(value) {
  const text = String(value || '')
    .replace(/\s*\(src-[^()]*\)/g, '')
    .replace(/\bscan(?:u|y)? \d+\/\d+/g, 'snímek')
    .replace(/\b[Dd]ávk[ay] \d+[:,]?\s*/g, '')
    .replace(/\s*\(dávka \d+\)/g, '')
    .replace(/\s*\((?=[^()]*(?:MZA|scan|soubor|sign\.|fol\.|index PM|PM str|výřez))[^()]*\)/g, '')
    .replace(new RegExp(`${archiveRef}\\s*[–-]\\s*`, 'g'), '')
    .replace(new RegExp(archiveRef, 'g'), 'matriční zápis')
    .replace(/\bscan(?:y|u)? \d+(?:[–-]\d+)?/g, 'zápis')
    .replace(/\s*\(zvýrazněn[ýé] výřez[y]?(?:, [^)]*)?\)/g, '')
    .replace(/zvýrazněn(?:ý|é|ého) výřez(?:u|y|ů)?/g, 'zápis')
    .replace(/\s*\((?:hypothesis|supported|verified)\)/g, '')
    .replace(/\bverified\b/g, 'ověřeno')
    .replace(/\bhypothesis\b/g, 'domněnka')
    .replace(/\bscan\b/g, 'snímek')
    .replace(/\bMZA(?: sign\.)?/g, 'matrika')
    .replace(/samostatný kandidát/g, 'možná shoda')
    .replace(/ {2,}/g, ' ')
    .replace(/\s+([,.;])/g, '$1')
    .trim();
  return text.charAt(0).toLocaleUpperCase('cs') + text.slice(1);
}

function familyWording(value, options) {
  return replaceLiterals(plainArchiveWording(String(value || '').replace(/\bUNKNOWN\b/g, 'není znám')), options.wordingReplacements)
    .replace(/\bcluster\b/g, 'okruh záznamů')
    .replace(/\bsupported\b/g, 'podpořené prameny')
    .replace(/\bhypothesis upstream\b/g, 'neověřený předek')
    .replace(/\bfamily-record\b/g, 'rodinný záznam')
    .replace(/\bunlinked\b/g, 'nepropojené')
    .replace(/censusov/g, 'sčítac')
    .replace(/claimu/g, 'údaji')
    .replace(/(?:Uživatel|uživatel) (?:výslovně )?(?:potvrdil|potvrzuje|uvádí)/g, 'Rodinné vyprávění uvádí')
    .replace(/([Pp])odle uživatelem zprostředkovaného vyprávění/g, '$1odle rodinného vyprávění')
    .replace(/uživatelem/g, options.researcherName.instrumental)
    .replace(/uživatele/g, options.researcherName.genitive)
    .replace(/podle uživatele/g, 'podle rodinného vyprávění')
    .replace(/přímého uživatelského sdělení/g, 'rodinného vyprávění')
    .replace(/Uživatelský podnět/g, 'Rodinná vzpomínka')
    .replace(/pracovní (?:stromová )?stopa/g, 'předběžný údaj')
    .replace(/Pracovní strom/g, 'Rodokmen')
    .replace(/pracovní stromy/g, 'rodokmeny')
    .replace(/pracovní rodiče/g, 'možní rodiče')
    .replace(/pracovní otec/g, 'možný otec')
    .replace(/pracovní manželský pár/g, 'pravděpodobný manželský pár')
    .replace(/podpořeno navigační stopu/g, 'předběžný údaj')
    .replace(/Pracovní manželka/g, 'Možná manželka')
    .replace(/v této dávce/g, 'dosud')
    .replace(/Bratr není touto dávkou založen jako samostatná osoba\./g, '')
    .replace(/Rodný či další rodičovský zápis se má dohledat samostatně\./g, '')
    .replace(/a není vloženo do surnames\[\]\./g, 'a vyžaduje ověření.')
    .replace(/; proto se nevymýšlí/g, '')
    .replace(/; žádné číslo se nezapisuje/g, '')
    .trim();
}

export function createFamilyEdition(source, overrides = defaultOverrides) {
  const options = normaliseOverrides(overrides);
  const data = structuredClone(source);
  data.meta = { ...data.meta };
  delete data.meta.version;
  delete data.meta.updatedAt;

  // Keep the family-facing evidence and citations, while excluding private
  // research workflow, editorial reasoning, and working transcription notes.
  data.researchTasks = [];
  data.changelog = [];
  data.people = data.people.map(({ notes = [], ...person }) => ({
    ...person,
    // Retain family memories and uncertainty notes. Drop research-only notes
    // about search steps, catalog navigation, scans, and working profiles.
    familyNotes: options.noteOverrides[person.id] || notes.filter((note) => {
      const researchDetail = /(?:root|scan\s*\d|index|MZA|MyHeritage|FamilySearch|kandidát|kandidátní|profil|průchod|výzkumn|úkol|ověřovat|samostatně dohledat|auditní|kontrol[ay])/i;
      const familyStory = /(?:vzpomín|rodinn|pracoval|pracovala|práci|povolání|poznal[ai]?|potkali|děti|syn|dcera|manžel|sňatek|narodil|zemřel|hrob|rodič|sourozen|dcera|bratr|sestra)/i;
      const meaningfulUncertainty = /(?:nejist|rozpor|neznám|neověřen|neověř|zůstává otevřen|zatím nebyl nalezen|zatím není bezpeč|rozdílné čtení|nečiteln)/i;
      return (!researchDetail.test(note) && familyStory.test(note)) || meaningfulUncertainty.test(note);
    }).map((note) => familyWording(replaceLiterals(note, options.noteReplacements), options)),
  }));
  const excludedProcessClaims = /(?:předchozí (?:mapování|přiřazení)|ohraničen(?:á|é) (?:kontrol|vyhledáv|orientační)|vyřazen(?:á|ý|é) shod|přihlášené vyhledávání|je odmítnut|bylo staženo|indexuje|silným kandidátem)/i;
  const excludedProcessClaimIds = /bounded-negative|index-candidate/;
  data.claims = data.claims
    .filter((claim) => !options.omitClaimIds.has(claim.id) && !excludedProcessClaims.test(claim.text) && !excludedProcessClaimIds.test(claim.id))
    .map(({ reasoning, ...claim }) => ({
      ...claim,
      text: options.claimOverrides[claim.id] || familyWording(claim.text
        .replaceAll('Uživatel potvrzuje', 'Rodinné vyprávění potvrzuje')
        .replaceAll('Uživatel potvrdil', 'Rodinné vyprávění potvrzuje')
        .replaceAll('uživatel výslovně označil', 'rodina označila')
        .replaceAll('uživatelova vzpomínka', 'rodinná vzpomínka')
        .replaceAll('Uživatel osobně identifikoval', 'Rodina identifikovala')
        .replaceAll('family-record', 'rodinný záznam')
        .replaceAll('supported', 'podpořeno')
        .replaceAll('hypothesis', 'možnost'), options),
    }));
  // Dates and titles name the family tree, not the website it was read on.
  const plainTreeWording = (text) => text && text.replace(/ podle MyHeritage.*$/, ' podle rodokmenu').replace(/MyHeritage/g, 'rodokmen');
  data.events = data.events.map(({ notes, details, ...event }) => ({ ...event, title: plainTreeWording(event.title), ...(event.dateText ? { dateText: plainTreeWording(event.dateText) } : {}) }));
  for (const person of data.people) {
    for (const field of ['birth', 'death']) if (person[field]?.dateText) person[field] = { ...person[field], dateText: plainTreeWording(person[field].dateText) };
  }
  const researchSourceIds = /negative|manual-check|primary-check|bounded-negative|baptism-candidate|partial-check|identity-checks|rereads|-checks?$|-check-|-lead$|wrong-locality/;
  data.sources = data.sources
    .filter((entry) => entry.type !== 'research-methodology' && !researchSourceIds.test(entry.id)
      && !options.omitSourceIdPatterns.some((pattern) => pattern.test(entry.id)))
    .map(({ id, title, type, publisher, url }) => ({ id, title: familyWording(title, options), type, publisher, url }));
  const visibleSources = new Set(data.sources.map((entry) => entry.id));
  for (const entries of [data.people, data.relationships, data.events, data.claims]) {
    for (const entry of entries) if (entry.sourceIds) entry.sourceIds = entry.sourceIds.filter((id) => visibleSources.has(id));
  }
  data.claims = data.claims.filter((claim) => claim.sourceIds.length > 0 && (claim.subjectType !== 'source' || visibleSources.has(claim.subjectId)));
  return data;
}
