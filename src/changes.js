(function registerChanges(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.RKChanges = api;
})(globalThis, function createChanges() {
  'use strict';

  // A change set ("dávka změn") is how the editor, the register transcription
  // form, photo regions and suggestions from relatives propose edits. The
  // browser only writes a JSON file; scripts/apply-changes.mjs applies it to
  // the data after a preview, so nothing changes the data behind the
  // researcher's back.
  //
  //   { format: "rk-changes/1", createdAt, author, title, note,
  //     ops: [ { op: "add" | "update" | "remove", file, collection, id, item | set } ] }
  //
  // `file` is "genealogy" (default) or a companion file: "media-notes",
  // "gazetteer", "registers", "history-local". Collections in the main data
  // and "registers"/"history-local" are arrays of items with `id`; in
  // "media-notes" (media) and "gazetteer" (places) they are objects keyed by ID.

  const FORMAT = 'rk-changes/1';
  const OPS = new Set(['add', 'update', 'remove']);
  const FILES = {
    genealogy: ['people', 'relationships', 'events', 'places', 'claims', 'sources', 'media', 'researchTasks', 'changelog'],
    'media-notes': ['media'],
    gazetteer: ['places'],
    registers: ['registers'],
    'history-local': ['events'],
  };
  const COLLECTION_LABELS = {
    people: ['osoba', 'Přidána'], relationships: ['vazba', 'Přidána'], events: ['událost', 'Přidána'], places: ['místo', 'Přidáno'],
    claims: ['tvrzení', 'Přidáno'], sources: ['pramen', 'Přidán'], media: ['médium', 'Přidáno'], researchTasks: ['výzkumný úkol', 'Přidán'],
    changelog: ['záznam historie', 'Přidán'], registers: ['matrika', 'Přidána'],
  };

  function createChangeSet({ author = '', title = '', note = '', now = new Date() } = {}) {
    return { format: FORMAT, createdAt: now.toISOString(), author, title, note, ops: [] };
  }

  function validateChangeSet(set) {
    const errors = [];
    if (!set || set.format !== FORMAT) errors.push(`Neznámý formát dávky (očekáván ${FORMAT}).`);
    if (!Array.isArray(set?.ops) || !set.ops.length) errors.push('Dávka neobsahuje žádné změny.');
    (set?.ops || []).forEach((op, index) => {
      const where = `změna ${index + 1}`;
      const file = op.file || 'genealogy';
      if (!OPS.has(op.op)) errors.push(`${where}: neznámá operace ${op.op}`);
      if (!FILES[file]) errors.push(`${where}: neznámý soubor ${file}`);
      else if (!FILES[file].includes(op.collection)) errors.push(`${where}: soubor ${file} nemá kolekci ${op.collection}`);
      const id = op.id || op.item?.id;
      if (!id) errors.push(`${where}: chybí id`);
      if (op.op === 'add' && (!op.item || typeof op.item !== 'object')) errors.push(`${where}: přidání potřebuje item`);
      if (op.op === 'add' && op.item?.id && op.id && op.item.id !== op.id) errors.push(`${where}: id a item.id se liší`);
      if (op.op === 'update' && (!op.set || typeof op.set !== 'object')) errors.push(`${where}: úprava potřebuje set`);
    });
    return errors;
  }

  const isKeyed = (file) => file === 'media-notes' || file === 'gazetteer';

  function applyOne(target, op) {
    const file = op.file || 'genealogy';
    const id = op.id || op.item?.id;
    if (isKeyed(file)) {
      target[op.collection] ||= {};
      const map = target[op.collection];
      if (op.op === 'add') {
        if (map[id]) throw new Error(`${id} už v ${file} existuje`);
        const { id: _ignored, ...rest } = op.item;
        map[id] = rest;
      } else if (op.op === 'update') {
        map[id] = mergeFields(map[id] || {}, op.set);
      } else {
        if (!map[id]) throw new Error(`${id} v ${file} neexistuje`);
        delete map[id];
      }
      return;
    }
    target[op.collection] ||= [];
    const items = target[op.collection];
    const index = items.findIndex((item) => item.id === id);
    if (op.op === 'add') {
      if (index >= 0) throw new Error(`${id} už v kolekci ${op.collection} existuje`);
      items.push({ ...op.item, id });
    } else if (op.op === 'update') {
      if (index < 0) throw new Error(`${id} v kolekci ${op.collection} neexistuje`);
      items[index] = mergeFields(items[index], op.set);
    } else {
      if (index < 0) throw new Error(`${id} v kolekci ${op.collection} neexistuje`);
      items.splice(index, 1);
    }
  }

  // Shallow merge; null removes a field. Nested objects (birth, death) are
  // merged one level deep so a form can set only birth.placeId.
  function mergeFields(base, set) {
    const next = { ...base };
    for (const [key, value] of Object.entries(set)) {
      if (key === 'id') continue;
      if (value === null) delete next[key];
      else if (value && typeof value === 'object' && !Array.isArray(value) && base[key] && typeof base[key] === 'object' && !Array.isArray(base[key])) next[key] = mergeFields(base[key], value);
      else next[key] = value;
    }
    return next;
  }

  // targets: { genealogy: data, 'media-notes': {...}, ... }. Returns new
  // copies; the inputs stay unchanged.
  function applyChangeSet(targets, set) {
    const errors = validateChangeSet(set);
    if (errors.length) return { targets, errors, touched: [] };
    const next = Object.fromEntries(Object.entries(targets).map(([key, value]) => [key, structuredClone(value)]));
    const touched = new Set();
    set.ops.forEach((op, index) => {
      const file = op.file || 'genealogy';
      next[file] ||= isKeyed(file) ? { meta: {} } : { meta: {}, [op.collection]: [] };
      try {
        applyOne(next[file], op);
        touched.add(file);
      } catch (error) {
        errors.push(`změna ${index + 1}: ${error.message}`);
      }
    });
    return { targets: errors.length ? targets : next, errors, touched: [...touched] };
  }

  function describeOp(op) {
    const id = op.id || op.item?.id;
    const [label, added] = COLLECTION_LABELS[op.collection] || [op.collection, 'Přidáno'];
    const name = op.item?.displayName || op.item?.title || op.item?.name || op.item?.text || op.set?.displayName || op.set?.title || '';
    const file = op.file && op.file !== 'genealogy' ? ` (${op.file})` : '';
    const what = name ? `${label} „${String(name).slice(0, 80)}“` : `${label} ${id}`;
    if (op.op === 'add') return `${added} ${what}${file}`;
    if (op.op === 'update') return `Upraveno: ${what}${file} (${Object.keys(op.set || {}).join(', ')})`;
    return `Odebráno: ${what}${file}`;
  }

  // Stable, readable IDs: "Jan Novák", 1870 → "jan-novak-1870"; a numeric
  // suffix avoids collisions.
  function slugId(text, { suffix = '', taken = new Set() } = {}) {
    const base = String(text || 'zaznam').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'zaznam';
    const stem = suffix ? `${base}-${suffix}` : base;
    if (!taken.has(stem)) return stem;
    let counter = 2;
    while (taken.has(`${stem}-${counter}`)) counter += 1;
    return `${stem}-${counter}`;
  }

  function takenIds(data) {
    return new Set(FILES.genealogy.flatMap((collection) => (data?.[collection] || []).map((item) => item.id)));
  }

  function nextPatchVersion(version) {
    const match = String(version || '').match(/^(\d+)\.(\d+)\.(\d+)$/);
    return match ? `${match[1]}.${match[2]}.${Number(match[3]) + 1}` : version;
  }

  return { FORMAT, FILES, createChangeSet, validateChangeSet, applyChangeSet, mergeFields, describeOp, slugId, takenIds, nextPatchVersion };
});
