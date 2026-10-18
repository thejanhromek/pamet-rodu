(function registerResearchViews(root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const load = (path, name) => (isNode ? require(path) : root[name]);
  const api = factory({
    model: load('./model.js', 'RKModel'),
    presentation: load('./presentation.js', 'RKPresentation'),
    components: load('./components.js', 'RKComponents'),
    names: load('./names.js', 'RKNames'),
    checks: load('./checks.js', 'RKChecks'),
    queue: load('./research-queue.js', 'RKResearchQueue'),
    changes: load('./changes.js', 'RKChanges'),
    schema: load('./schema-lite.js', 'RKSchema'),
    gedcom: load('./gedcom.js', 'RKGedcom'),
    dna: load('./dna.js', 'RKDna'),
  });
  if (isNode) module.exports = api;
  root.RKResearchViews = api;
})(globalThis, function createResearchViews(deps) {
  'use strict';

  // "Badatelna": tools that exist only in the research edition. Nothing here
  // changes the data in place: the transcription form and the editor collect
  // a change set (see src/changes.js) that the researcher downloads and
  // applies with scripts/apply-changes.mjs.

  const { model, presentation, components, names, checks, queue, changes, schema } = deps;
  const escapeHtml = components.escapeHtml;
  // Stored per chronicle, so two chronicles opened from the same place do
  // not mix their unsent changes.
  const storageKey = (name) => `${name}:${globalThis.RK_DATA?.meta?.defaultPersonId || 'kronika'}`;
  const PENDING_KEY = 'rk-pending-changes';
  const DRAFT_KEY = 'rk-transcription-draft';

  const VIEWS = {
    research: { label: 'Výzkumná fronta', hash: 'badatelna' },
    health: { label: 'Zdraví dat', hash: 'zdravi-dat' },
    transcribe: { label: 'Přepis zápisu', hash: 'prepis' },
    editor: { label: 'Editor', hash: 'editor' },
    dna: { label: 'DNA', hash: 'dna' },
  };

  // ---------- storage (per-viewer convenience; optional) ----------
  function readStorage(key, fallback) {
    try {
      const value = globalThis.localStorage?.getItem(storageKey(key));
      return value ? JSON.parse(value) : fallback;
    } catch (_) {
      return fallback;
    }
  }
  function writeStorage(key, value) {
    try { globalThis.localStorage?.setItem(storageKey(key), JSON.stringify(value)); } catch (_) { /* optional */ }
  }

  // ---------- pending change set shared by the transcription form and the editor ----------
  const pending = { set: null };
  function pendingSet() {
    pending.set ||= readStorage(PENDING_KEY, null) || changes.createChangeSet({ title: 'Úpravy z badatelského vydání' });
    return pending.set;
  }
  function savePending() { writeStorage(PENDING_KEY, pending.set); }
  function addOps(ops) {
    const set = pendingSet();
    set.ops.push(...ops);
    savePending();
  }
  function clearPending() {
    pending.set = changes.createChangeSet({ title: 'Úpravy z badatelského vydání' });
    savePending();
  }

  function renderPending() {
    const set = pendingSet();
    return `<section class="rv-pending" data-rv-pending aria-labelledby="rv-pending-title">
      <header><h2 id="rv-pending-title">Dávka změn</h2><p>${set.ops.length ? `Na stažení ${set.ops.length === 1 ? 'čeká' : set.ops.length <= 4 ? 'čekají' : 'čeká'} ${presentation.plural(set.ops.length, 'změna', 'změny', 'změn')}.` : 'Zatím prázdná. Přidej do ní přepis zápisu nebo úpravu z editoru.'}</p></header>
      ${set.ops.length ? `<ol class="rv-pending-list">${set.ops.map((op, index) => `<li><span>${escapeHtml(changes.describeOp(op))}</span><button type="button" class="text-link" data-rv-action="remove-op" data-rv-index="${index}" aria-label="Odebrat změnu ${index + 1}">Odebrat</button></li>`).join('')}</ol>
      <div class="rv-form-grid"><label>Název dávky<input type="text" data-rv-pending-field="title" value="${escapeHtml(set.title || '')}"></label><label>Kdo změny připravil<input type="text" data-rv-pending-field="author" value="${escapeHtml(set.author || '')}"></label></div>
      <div class="rv-actions"><button type="button" class="rv-primary" data-rv-action="download-changes">Stáhnout dávku změn</button><button type="button" data-rv-action="clear-changes">Vyprázdnit</button></div>
      <p class="muted">Stažený soubor použij příkazem <code>node scripts/apply-changes.mjs zmeny.json --dry-run</code> (náhled) a potom bez <code>--dry-run</code>.</p>` : ''}
      <p class="rv-status" data-rv-status role="status"></p>
    </section>`;
  }

  function download(filename, text, type = 'application/json') {
    if (typeof document === 'undefined') return;
    const blob = new Blob([text], { type: `${type};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ---------- shared helpers ----------
  const peopleIndex = (data) => new Map((data.people || []).map((person) => [person.id, person]));
  const placeName = (data, id) => (data.places || []).find((place) => place.id === id)?.name || '';
  function personButton(person) {
    return person ? `<button type="button" class="rv-chip" data-person-id="${escapeHtml(person.id)}">${escapeHtml(presentation.personChoiceLabel(person))}</button>` : '';
  }
  function header(title, intro, extra = '') {
    return `<div class="view-header rv-header"><div><p class="eyebrow">Badatelna</p><h1 id="rv-title">${escapeHtml(title)}</h1><p>${escapeHtml(intro)}</p></div>${extra}</div>`;
  }
  function select(attribute, options, value, label) {
    return `<label>${escapeHtml(label)}<select ${attribute}>${options.map(([optionValue, optionLabel]) => `<option value="${escapeHtml(optionValue)}"${String(value ?? '') === String(optionValue) ? ' selected' : ''}>${escapeHtml(optionLabel)}</option>`).join('')}</select></label>`;
  }

  // Czech "5. 1. 1930" → "1930-01-05"; "1930" stays; anything else → null.
  function isoFromCzech(text) {
    const value = String(text || '').trim();
    const full = value.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/);
    if (full) return `${full[3]}-${full[2].padStart(2, '0')}-${full[1].padStart(2, '0')}`;
    const month = value.match(/^(\d{1,2})\/(\d{4})$/);
    if (month) return `${month[2]}-${month[1].padStart(2, '0')}`;
    return /^\d{4}$/.test(value) ? value : null;
  }

  // ---------- 1. research queue ----------
  function renderQueue(data, state) {
    const filters = state.filters || {};
    const egoId = state.egoPersonId || data.meta?.defaultPersonId;
    const all = queue.buildQueue(data, { egoId });
    const items = all.filter((item) => (!filters.kind || item.kind === filters.kind)
      && (!filters.maxGeneration || item.generation <= Number(filters.maxGeneration))
      && (filters.register !== 'known' || item.registers.length));
    const people = peopleIndex(data);
    const summary = queue.summarize(all);
    const openTasks = (data.researchTasks || []).filter((task) => task.status !== 'closed').sort((a, b) => a.priority - b.priority);
    const gedcomButton = typeof deps.gedcom?.toGedcom === 'function' ? '<button type="button" data-rv-action="download-gedcom">Stáhnout GEDCOM</button>' : '';
    return `<section class="view rv-view" aria-labelledby="rv-title">
      ${header('Výzkumná fronta', 'Mezery v přímé linii seřazené podle naděje na úspěch: kde hledat, v jakých letech a ve které matrice.', `<div class="rv-header-actions">${gedcomButton}</div>`)}
      <div class="task-summary" aria-label="Souhrn fronty"><span><strong>${summary.total}</strong> ${presentation.plural(summary.total, 'otázka', 'otázky', 'otázek').replace(/^\d+ /, '')}</span><span><strong>${summary.withRegister}</strong> se známou matrikou</span><span><strong>${openTasks.length}</strong> ${presentation.plural(openTasks.length, 'ruční úkol', 'ruční úkoly', 'ručních úkolů').replace(/^\d+ /, '')}</span></div>
      ${components.filterBar({ count: items.length, controls: [
        select('data-filter="kind"', [['', 'Všechny druhy'], ...Object.entries(queue.KIND_LABELS)], filters.kind, 'Druh'),
        select('data-filter="maxGeneration"', [['', 'Všechny generace'], ...[2, 3, 4, 5, 6, 8].map((value) => [value, `do ${value}. generace`])], filters.maxGeneration, 'Generace'),
        select('data-filter="register"', [['', 'Vše'], ['known', 'Jen se známou matrikou']], filters.register, 'Matrika'),
      ].join('') })}
      <ol class="rv-queue">${items.slice(0, 120).map((item) => {
        const person = people.get(item.personId);
        const place = placeName(data, item.placeId);
        return `<li class="rv-card rv-kind-${escapeHtml(item.kind)}">
          <div class="rv-score" aria-label="Skóre ${item.score}"><strong>${item.score}</strong><small>#${item.number}</small></div>
          <div class="rv-card-main">
            <p class="rv-meta"><span class="rv-tag">${escapeHtml(item.kindLabel)}</span><span>${item.generation}. generace</span>${item.yearRange ? `<span>${item.yearRange[0] === item.yearRange[1] ? item.yearRange[0] : `${item.yearRange[0]}–${item.yearRange[1]}`}</span>` : ''}${place ? `<span>${escapeHtml(place)}</span>` : ''}</p>
            <h2>${escapeHtml(item.title)}</h2>
            <p>${escapeHtml(item.why)}</p>
            ${item.registers.length ? `<ul class="rv-registers">${item.registers.slice(0, 3).map((register) => `<li>${register.url ? `<a href="${escapeHtml(register.url)}" target="_blank" rel="noopener noreferrer">` : ''}${escapeHtml(register.archive || '')} ${escapeHtml(register.signature || '')}${register.url ? ' ↗</a>' : ''} · ${escapeHtml(register.parish)} · matrika ${escapeHtml(queue.REGISTER_LABELS[item.registerKind])} ${register.from}–${register.to}${register.index ? ' (index)' : ''}${register.covers ? '' : ' · pokrývá jen část let'}</li>`).join('')}</ul>` : item.recent ? '' : `<p class="muted">Matrika ${escapeHtml(item.registerLabel)} pro toto místo a roky zatím není v katalogu (<code>src/data/registers.json</code>).</p>`}
            <div class="rv-actions">${personButton(person)}${item.spouseId ? personButton(people.get(item.spouseId)) : ''}${item.hints.map((id) => `<button type="button" class="rv-chip" data-source-id="${escapeHtml(id)}">Stopa: ${escapeHtml((data.sources || []).find((source) => source.id === id)?.title || id)}</button>`).join('')}${item.relatedTaskIds.map((id) => `<button type="button" class="rv-chip" data-search-result-id="${escapeHtml(id)}" data-search-open="research" data-search-id="${escapeHtml(id)}">Úkol: ${escapeHtml((data.researchTasks || []).find((task) => task.id === id)?.title || id)}</button>`).join('')}<button type="button" class="text-link" data-rv-action="transcribe-for" data-rv-item="${escapeHtml(item.id)}">Přepsat nalezený zápis →</button></div>
          </div>
        </li>`;
      }).join('')}</ol>
      ${items.length > 120 ? `<p class="muted">Zobrazeno prvních 120 z ${items.length}.</p>` : ''}
      ${items.length ? '' : components.emptyState('Žádná otázka neodpovídá filtrům', 'Zruš některý filtr.')}
      <section class="rv-tasks" aria-labelledby="rv-tasks-title"><h2 id="rv-tasks-title">Ruční výzkumné úkoly</h2>${openTasks.length ? `<ol>${openTasks.map((task) => `<li><span class="task-priority">P${escapeHtml(task.priority)}</span><button type="button" class="text-link" data-search-result-id="${escapeHtml(task.id)}" data-search-open="research" data-search-id="${escapeHtml(task.id)}">${escapeHtml(task.title)}</button><span class="muted">${escapeHtml(task.nextAction || '')}</span></li>`).join('')}</ol>` : '<p class="muted">Žádné otevřené ruční úkoly.</p>'}</section>
    </section>`;
  }

  // ---------- 2. data health ----------
  function renderHealth(data, state) {
    const filters = state.filters || {};
    const findings = checks.runChecks(data, { accepted: data.acceptedFindings || [] });
    const counts = checks.summarize(findings);
    const schemaErrors = globalThis.RK_SCHEMA ? schema.validate(globalThis.RK_SCHEMA, data) : [];
    const shown = findings.filter((item) => (!filters.severity || (filters.severity === 'accepted' ? item.accepted : item.severity === filters.severity && !item.accepted)) && (!filters.code || item.code === filters.code));
    const codes = [...new Set(findings.map((item) => item.code))].sort();
    const people = peopleIndex(data);
    const links = (item) => {
      const parts = [];
      for (const id of item.ids.people || []) parts.push(personButton(people.get(id)));
      for (const id of item.ids.claims || []) parts.push(`<button type="button" class="rv-chip" data-search-result-id="${escapeHtml(id)}" data-search-open="claim" data-search-id="${escapeHtml(id)}">Tvrzení</button>`);
      for (const id of item.ids.sources || []) parts.push(`<button type="button" class="rv-chip" data-source-id="${escapeHtml(id)}">Pramen</button>`);
      for (const id of item.ids.events || []) parts.push(`<button type="button" class="rv-chip" data-event-id="${escapeHtml(id)}">Událost</button>`);
      for (const id of item.ids.places || []) parts.push(`<button type="button" class="rv-chip" data-place-id="${escapeHtml(id)}">Místo</button>`);
      return parts.join('');
    };
    return `<section class="view rv-view" aria-labelledby="rv-title">
      ${header('Zdraví dat', 'Kontrola věrohodnosti: nemožné věky a data, duplicity, ověřená tvrzení bez primárního pramene a drobné mezery.')}
      <div class="rv-health-summary">
        <button type="button" class="rv-count rv-error" data-rv-action="severity" data-rv-value="error"><strong>${counts.error}</strong> chyb</button>
        <button type="button" class="rv-count rv-warning" data-rv-action="severity" data-rv-value="warning"><strong>${counts.warning}</strong> upozornění</button>
        <button type="button" class="rv-count rv-info" data-rv-action="severity" data-rv-value="info"><strong>${counts.info}</strong> poznámek</button>
        <button type="button" class="rv-count rv-accepted" data-rv-action="severity" data-rv-value="accepted"><strong>${counts.accepted}</strong> potvrzených výjimek</button>
      </div>
      ${schemaErrors.length ? `<section class="rv-schema"><h2>Schéma dat</h2><pre>${escapeHtml(schema.formatErrors(schemaErrors))}</pre></section>` : '<p class="rv-ok">Data odpovídají schématu <code>schema/kronika.schema.json</code>.</p>'}
      ${components.filterBar({ count: shown.length, controls: [
        select('data-filter="severity"', [['', 'Všechny'], ['error', 'Chyby'], ['warning', 'Upozornění'], ['info', 'Poznámky'], ['accepted', 'Potvrzené výjimky']], filters.severity, 'Závažnost'),
        select('data-filter="code"', [['', 'Všechny druhy'], ...codes.map((code) => [code, checks.CODE_LABELS[code] || code])], filters.code, 'Druh'),
      ].join('') })}
      <ul class="rv-findings">${shown.map((item) => `<li class="rv-finding rv-${escapeHtml(item.severity)}${item.accepted ? ' is-accepted' : ''}"><p><span class="rv-tag">${escapeHtml(checks.CODE_LABELS[item.code] || item.code)}</span>${escapeHtml(item.message)}</p>${item.accepted ? `<p class="muted">Potvrzená výjimka: ${escapeHtml(item.accepted)}</p>` : ''}<div class="rv-actions">${links(item)}<button type="button" class="text-link" data-rv-action="copy-key" data-rv-key="${escapeHtml(item.key)}">Zkopírovat klíč výjimky</button></div></li>`).join('')}</ul>
      ${shown.length ? '' : components.emptyState('Nic k zobrazení', 'Pro zvolený filtr nejsou žádné nálezy.')}
      <details class="rv-help"><summary>Jak potvrdit výjimku</summary><p>Když je údaj neobvyklý, ale správný (třeba doložený pozdní porod), zkopíruj klíč a přidej ho s důvodem do <code>research/accepted-findings.json</code>:</p><pre>{ "accepted": [ { "key": "…", "reason": "Ověřeno v matrice, sken 23." } ] }</pre></details>
      <p class="rv-status" data-rv-status role="status"></p>
    </section>`;
  }

  // ---------- 3. register transcription ----------
  // Columns of the Austrian register forms used from 1784 on.
  const TEMPLATES = {
    N: {
      label: 'Narození a křest', eventType: 'birth', principal: 'child',
      fields: [
        ['birthDate', 'Datum narození'], ['baptismDate', 'Datum křtu'], ['house', 'Číslo domu'], ['child', 'Jméno dítěte'], ['sex', 'Pohlaví'],
        ['legitimate', 'Manželské / nemanželské'], ['religion', 'Náboženství'], ['father', 'Otec (jméno, povolání, bydliště)'], ['fatherParents', 'Rodiče otce'],
        ['mother', 'Matka (jméno, původ)'], ['motherParents', 'Rodiče matky'], ['godparents', 'Kmotři'], ['midwife', 'Porodní bába'], ['priest', 'Křtil'], ['remark', 'Poznámka']],
      people: [['child', 'Dítě'], ['father', 'Otec'], ['mother', 'Matka']],
    },
    O: {
      label: 'Sňatek', eventType: 'marriage', principal: 'groom',
      fields: [
        ['marriageDate', 'Datum sňatku'], ['house', 'Číslo domu'], ['groom', 'Ženich (jméno, povolání, bydliště)'], ['groomAge', 'Věk ženicha'], ['groomStatus', 'Stav ženicha'],
        ['groomParents', 'Rodiče ženicha'], ['bride', 'Nevěsta (jméno, bydliště)'], ['brideAge', 'Věk nevěsty'], ['brideStatus', 'Stav nevěsty'], ['brideParents', 'Rodiče nevěsty'],
        ['witnesses', 'Svědci'], ['priest', 'Oddával'], ['remark', 'Poznámka']],
      people: [['groom', 'Ženich'], ['bride', 'Nevěsta']],
    },
    Z: {
      label: 'Úmrtí a pohřeb', eventType: 'death', principal: 'deceased',
      fields: [
        ['deathDate', 'Datum úmrtí'], ['burialDate', 'Datum pohřbu'], ['house', 'Číslo domu'], ['deceased', 'Zemřelý/á (jméno, povolání)'], ['sex', 'Pohlaví'],
        ['age', 'Věk'], ['cause', 'Příčina smrti'], ['relatives', 'Rodiče, manžel/ka, pozůstalí'], ['priest', 'Pohřbil'], ['remark', 'Poznámka']],
      people: [['deceased', 'Zemřelý/á']],
    },
  };
  const DATE_FIELD = { N: 'birthDate', O: 'marriageDate', Z: 'deathDate' };

  function emptyDraft(kind = 'N') {
    return { kind, source: { archive: 'MZA', signature: '', scan: '', folio: '', url: '', placeId: '', crop: '' }, literal: {}, interpretation: {}, links: {}, newNames: {}, confirmLinks: true, prefillNote: '' };
  }
  const draft = { value: null };
  function currentDraft() {
    draft.value ||= readStorage(DRAFT_KEY, null) || emptyDraft();
    if (!TEMPLATES[draft.value.kind]) draft.value = emptyDraft();
    return draft.value;
  }
  function saveDraft() { writeStorage(DRAFT_KEY, draft.value); }

  function renderTranscribe(data) {
    const value = currentDraft();
    const template = TEMPLATES[value.kind];
    const places = [...(data.places || [])].sort((a, b) => a.name.localeCompare(b.name, 'cs'));
    const pickerOptions = (role) => {
      const linked = value.links[role] || '';
      return `<label>${escapeHtml(template.people.find(([key]) => key === role)[1])} v kronice<select data-rv-link="${role}"><option value="">— nepropojovat —</option><option value="new"${linked === 'new' ? ' selected' : ''}>+ založit novou osobu</option>${suggestPeople(data, value, role).map((person) => `<option value="${escapeHtml(person.id)}"${linked === person.id ? ' selected' : ''}>${escapeHtml(presentation.personChoiceLabel(person))}${person.suggested ? ' · podobné jméno' : ''}</option>`).join('')}</select></label>${linked === 'new' ? `<label>Jméno nové osoby<input type="text" data-rv-new-name="${role}" value="${escapeHtml(value.newNames[role] || '')}" placeholder="Jak se má osoba v kronice jmenovat"></label>` : ''}`;
    };
    return `<section class="view rv-view" aria-labelledby="rv-title">
      ${header('Přepis zápisu z matriky', 'Každé pole má doslovné znění a zvlášť výklad. Z přepisu vznikne pramen, událost, tvrzení a vazby v dávce změn.')}
      ${value.prefillNote ? `<p class="rv-note">${escapeHtml(value.prefillNote)}</p>` : ''}
      <form class="rv-form" data-rv-form="transcribe" onsubmit="return false">
        <fieldset><legend>Zápis</legend><div class="rv-form-grid">
          <label>Druh matriky<select data-rv-draft="kind">${Object.entries(TEMPLATES).map(([key, entry]) => `<option value="${key}"${value.kind === key ? ' selected' : ''}>${escapeHtml(entry.label)}</option>`).join('')}</select></label>
          <label>Archiv<input type="text" data-rv-source="archive" value="${escapeHtml(value.source.archive)}"></label>
          <label>Signatura<input type="text" data-rv-source="signature" value="${escapeHtml(value.source.signature)}" placeholder="např. 4664"></label>
          <label>Snímek<input type="text" data-rv-source="scan" value="${escapeHtml(value.source.scan)}" inputmode="numeric"></label>
          <label>Folio / strana<input type="text" data-rv-source="folio" value="${escapeHtml(value.source.folio)}"></label>
          <label>Odkaz na snímek<input type="url" data-rv-source="url" value="${escapeHtml(value.source.url)}" placeholder="https://"></label>
          <label>Místo<select data-rv-source="placeId"><option value="">— vyber —</option>${places.map((place) => `<option value="${escapeHtml(place.id)}"${value.source.placeId === place.id ? ' selected' : ''}>${escapeHtml(place.name)}</option>`).join('')}</select></label>
          <label>Výřez (soubor)<input type="text" data-rv-source="crop" value="${escapeHtml(value.source.crop)}" placeholder="research/evidence/…png"></label>
        </div></fieldset>
        <fieldset><legend>Sloupce zápisu</legend>
          <div class="rv-columns" role="table" aria-label="Doslovný přepis a výklad">
            <div class="rv-columns-head" role="row"><span role="columnheader">Sloupec</span><span role="columnheader">Doslovně (jak je napsáno)</span><span role="columnheader">Výklad</span></div>
            ${template.fields.map(([key, label]) => `<div class="rv-columns-row" role="row"><span role="rowheader">${escapeHtml(label)}</span><textarea rows="1" data-rv-literal="${key}" aria-label="${escapeHtml(label)} – doslovně">${escapeHtml(value.literal[key] || '')}</textarea><textarea rows="1" data-rv-interpretation="${key}" aria-label="${escapeHtml(label)} – výklad">${escapeHtml(value.interpretation[key] || '')}</textarea></div>`).join('')}
          </div>
          <p class="muted">Datum ve výkladu piš jako „5. 1. 1930“ – převede se do kronikového tvaru.</p>
        </fieldset>
        <fieldset><legend>Propojení s osobami</legend><div class="rv-form-grid">${template.people.map(([role]) => pickerOptions(role)).join('')}</div>
          <label class="rv-check"><input type="checkbox" data-rv-draft="confirmLinks"${value.confirmLinks ? ' checked' : ''}> Zápis potvrzuje ${value.kind === 'O' ? 'manželství' : value.kind === 'N' ? 'rodiče dítěte' : 'údaje o zemřelém'}: vazby a události dostanou stav „Ověřeno“</label>
        </fieldset>
        <div class="rv-actions"><button type="button" class="rv-primary" data-rv-action="transcription-to-changes">Přidat do dávky změn</button><button type="button" data-rv-action="transcription-reset">Nový přepis</button></div>
        <p class="rv-status" data-rv-form-status role="status"></p>
      </form>
      ${renderPending()}
    </section>`;
  }

  // Existing people whose names sound like the interpreted name come first.
  function suggestPeople(data, value, role) {
    const typed = String(value.interpretation[role] || value.literal[role] || '').split(/[,(]/)[0].trim();
    const tokens = typed.split(/\s+/).filter((word) => word.length >= 3);
    const people = [...(data.people || [])].sort((a, b) => a.displayName.localeCompare(b.displayName, 'cs'));
    if (!tokens.length || !names) return people;
    const scored = people.map((person) => ({ ...person, suggested: tokens.every((token) => names.tokenMatchesPerson(token, person)) }));
    return [...scored.filter((person) => person.suggested), ...scored.filter((person) => !person.suggested)];
  }

  function transcriptionToOps(data, value) {
    const template = TEMPLATES[value.kind];
    const taken = changes.takenIds(data);
    const errors = [];
    const interpretation = value.interpretation;
    const principalName = String(interpretation[template.principal] || value.literal[template.principal] || '').split(',')[0].trim();
    const dateText = String(interpretation[DATE_FIELD[value.kind]] || '').trim();
    const date = isoFromCzech(dateText);
    if (!principalName) errors.push(`Vyplň výklad sloupce „${template.fields.find(([key]) => key === template.principal)[1]}“.`);
    if (!dateText) errors.push('Vyplň datum ve výkladu.');
    else if (!date) errors.push(`Datum „${dateText}“ nejde převést; použij tvar 5. 1. 1930 nebo jen rok.`);
    if (!value.source.signature) errors.push('Vyplň signaturu matriky.');
    if (!Object.values(value.literal).some((text) => String(text || '').trim())) errors.push('Doslovný přepis je prázdný.');
    if (errors.length) return { errors, ops: [] };

    const ops = [];
    const year = date.slice(0, 4);
    const place = (data.places || []).find((entry) => entry.id === value.source.placeId);
    const evidence = value.confirmLinks ? 'verified' : 'supported';
    const sourceId = changes.slugId(`src-${value.source.archive}-${value.source.signature}-${principalName}-${value.kind === 'N' ? 'narozeni' : value.kind === 'O' ? 'snatek' : 'umrti'}-${year}${value.source.scan ? `-scan${value.source.scan}` : ''}`, { taken });
    taken.add(sourceId);
    const literalLines = template.fields.filter(([key]) => String(value.literal[key] || '').trim()).map(([key, label]) => `${label}: ${String(value.literal[key]).trim()}`);
    const interpretationLines = template.fields.filter(([key]) => String(interpretation[key] || '').trim()).map(([key, label]) => `${label}: ${String(interpretation[key]).trim()}`);
    ops.push({ op: 'add', collection: 'sources', item: {
      id: sourceId, title: `Matrika – ${template.label.toLowerCase()}: ${principalName}, ${dateText}${place ? `, ${place.name}` : ''}`, type: 'parish-register',
      publisher: value.source.archive, ...(value.source.url ? { url: value.source.url } : {}),
      origin: [`${value.source.archive} ${value.source.signature}`, value.source.scan ? `snímek ${value.source.scan}` : '', value.source.folio ? `folio ${value.source.folio}` : '', value.source.crop ? `výřez ${value.source.crop}` : ''].filter(Boolean).join(', '),
      transcriptionLines: literalLines,
    } });

    // People: linked, new, or left out.
    const personIds = {};
    for (const [role] of template.people) {
      const link = value.links[role];
      if (!link) continue;
      if (link === 'new') {
        const name = String(value.newNames[role] || interpretation[role] || '').split(',')[0].trim();
        if (!name) { errors.push(`Doplň jméno nové osoby (${role}).`); continue; }
        const id = changes.slugId(name, { suffix: role === template.principal && value.kind === 'N' ? year : '', taken });
        taken.add(id);
        const sex = role === 'mother' || role === 'bride' ? 'female' : role === 'father' || role === 'groom' ? 'male' : /^ž|^f/i.test(interpretation.sex || '') ? 'female' : /^m/i.test(interpretation.sex || '') ? 'male' : undefined;
        const person = { id, displayName: name, ...(sex ? { sex } : {}), sourceIds: [sourceId] };
        if (role === template.principal && value.kind === 'N') person.birth = { date, dateText, ...(place ? { placeId: place.id } : {}) };
        if (role === template.principal && value.kind === 'Z') person.death = { date, dateText, ...(place ? { placeId: place.id } : {}) };
        ops.push({ op: 'add', collection: 'people', item: person });
        personIds[role] = id;
      } else {
        personIds[role] = link;
      }
    }
    if (errors.length) return { errors, ops: [] };

    const principalId = personIds[template.principal];
    const eventPeople = template.people.map(([role]) => personIds[role]).filter(Boolean);
    const house = String(interpretation.house || '').trim();
    if (eventPeople.length) {
      const eventId = changes.slugId(`event-${principalName}-${template.eventType}-${year}`, { taken });
      taken.add(eventId);
      ops.push({ op: 'add', collection: 'events', item: {
        id: eventId, type: template.eventType, title: `${value.kind === 'N' ? 'Narození' : value.kind === 'O' ? 'Sňatek' : 'Úmrtí'}: ${principalName}${place ? `, ${place.name}${house ? ` č. ${house}` : ''}` : ''}`,
        date, dateText, ...(place ? { placeId: place.id } : {}), ...(house ? { placeText: `${place?.name || ''} č. ${house}`.trim() } : {}),
        personIds: eventPeople, sourceIds: [sourceId], evidence,
      } });
    }
    if (principalId) {
      const claimId = changes.slugId(`claim-${principalName}-${template.eventType}-${year}`, { taken });
      taken.add(claimId);
      ops.push({ op: 'add', collection: 'claims', item: {
        id: claimId, subjectType: 'person', subjectId: principalId,
        text: interpretationLines.join('; '),
        evidence, reasoning: `Výklad zápisu ${value.source.archive} ${value.source.signature}${value.source.scan ? `, snímek ${value.source.scan}` : ''}; doslovné znění je v prameni.`, sourceIds: [sourceId],
      } });
      const existing = (data.people || []).find((person) => person.id === principalId);
      if (existing) ops.push({ op: 'update', collection: 'people', id: principalId, set: { sourceIds: [...new Set([...(existing.sourceIds || []), sourceId])] } });
    }
    // Parent and spouse links named by the record.
    const linkPairs = value.kind === 'N' ? [['father', 'child'], ['mother', 'child']] : value.kind === 'O' ? [['groom', 'bride']] : [];
    for (const [from, to] of linkPairs) {
      if (!personIds[from] || !personIds[to]) continue;
      const type = value.kind === 'O' ? 'spouse' : 'parent-child';
      const existing = (data.relationships || []).find((link) => link.type === type && ((link.from === personIds[from] && link.to === personIds[to]) || (type === 'spouse' && link.from === personIds[to] && link.to === personIds[from])));
      if (existing) {
        ops.push({ op: 'update', collection: 'relationships', id: existing.id, set: { sourceIds: [...new Set([...(existing.sourceIds || []), sourceId])], ...(value.confirmLinks ? { evidence: 'verified' } : {}) } });
      } else {
        const id = changes.slugId(`rel-${personIds[from]}-${personIds[to]}`, { taken });
        taken.add(id);
        ops.push({ op: 'add', collection: 'relationships', item: { id, type, from: personIds[from], to: personIds[to], evidence, sourceIds: [sourceId] } });
      }
    }
    return { errors: [], ops };
  }

  // Opens the transcription form prepared for a queue item.
  function prefillFromQueueItem(data, itemId, egoId) {
    const item = queue.buildQueue(data, { egoId }).find((entry) => entry.id === itemId);
    if (!item) return;
    const value = emptyDraft(item.registerKind);
    const register = item.registers[0];
    if (register) Object.assign(value.source, { archive: register.archive || 'MZA', signature: register.signature || '', url: register.url || '' });
    value.source.placeId = item.placeId || '';
    const template = TEMPLATES[value.kind];
    value.links[template.principal] = item.personId;
    if (item.kind === 'missing-marriage') { value.links.groom = item.personId; value.links.bride = item.spouseId; }
    value.prefillNote = `Připraveno pro otázku: ${item.title}`;
    draft.value = value;
    saveDraft();
  }

  // ---------- 4. editor ----------
  const EDITOR_FIELDS = {
    people: [['displayName', 'Zobrazované jméno', 'text'], ['surnames', 'Příjmení (čárkou)', 'list'], ['aliases', 'Jiné podoby jména (čárkou)', 'list'], ['sex', 'Pohlaví', ['', 'male', 'female']],
      ['lineage', 'Linie', ['', 'direct', 'collateral', 'affinal', 'unlinked']], ['birth.dateText', 'Narození – datum (text)', 'text'], ['birth.placeId', 'Narození – místo', 'place'],
      ['death.dateText', 'Úmrtí – datum (text)', 'text'], ['death.placeId', 'Úmrtí – místo', 'place'], ['occupations', 'Povolání (čárkou)', 'list'], ['residences', 'Bydliště (čárkou)', 'list'],
      ['notes', 'Poznámky (řádek = poznámka)', 'lines'], ['sourceIds', 'Prameny (ID čárkou)', 'list']],
    relationships: [['type', 'Druh', ['parent-child', 'spouse', 'sibling']], ['from', 'Od (rodič / partner)', 'person'], ['to', 'K (dítě / partner)', 'person'], ['evidence', 'Jistota', ['', 'verified', 'supported', 'family-record', 'hypothesis']], ['sourceIds', 'Prameny (ID čárkou)', 'list']],
    events: [['type', 'Druh (birth, marriage, death, burial, migration…)', 'text'], ['title', 'Název', 'text'], ['dateText', 'Datum (text)', 'text'], ['placeId', 'Místo', 'place'], ['placeText', 'Místo slovy (č. p.)', 'text'],
      ['personIds', 'Osoby (ID čárkou, první je hlavní)', 'list'], ['evidence', 'Jistota', ['', 'verified', 'supported', 'family-record', 'hypothesis']], ['sourceIds', 'Prameny (ID čárkou)', 'list']],
    claims: [['subjectType', 'Předmět', ['person', 'relationship', 'couple', 'place', 'event', 'source', 'branch']], ['subjectId', 'ID předmětu', 'text'], ['text', 'Tvrzení', 'textarea'], ['reasoning', 'Odůvodnění', 'textarea'],
      ['evidence', 'Jistota', ['verified', 'supported', 'family-record', 'hypothesis']], ['sourceIds', 'Prameny (ID čárkou)', 'list']],
    sources: [['title', 'Název', 'text'], ['type', 'Druh (parish-register, family-record, oral-history…)', 'text'], ['publisher', 'Vydavatel / archiv', 'text'], ['url', 'Odkaz', 'text'], ['origin', 'Původ', 'textarea'],
      ['transcriptionLines', 'Doslovné znění (řádek = řádek)', 'lines'], ['reliabilityNote', 'Poznámka ke spolehlivosti', 'textarea']],
    places: [['name', 'Název', 'text'], ['country', 'Stát', 'text'], ['region', 'Kraj', 'text'], ['lat', 'Zeměpisná šířka', 'number'], ['lon', 'Zeměpisná délka', 'number'], ['houseNumbers', 'Čísla domů (čárkou)', 'list']],
    researchTasks: [['title', 'Úkol', 'text'], ['priority', 'Priorita', ['1', '2', '3']], ['status', 'Stav', ['open', 'in-progress', 'closed']], ['expectedPayoff', 'Očekávaný přínos', 'textarea'], ['nextAction', 'Další krok', 'textarea'], ['personIds', 'Osoby (ID čárkou)', 'list'], ['sourceIds', 'Prameny (ID čárkou)', 'list']],
  };
  const EDITOR_LABELS = { people: 'Osoba', relationships: 'Vazba', events: 'Událost', claims: 'Tvrzení', sources: 'Pramen', places: 'Místo', researchTasks: 'Výzkumný úkol' };
  const editor = { collection: 'people', id: '', values: {} };

  const getPath = (object, path) => path.split('.').reduce((value, key) => value?.[key], object);
  function itemLabel(collection, item) {
    return item.displayName || item.title || item.name || item.text?.slice(0, 70) || `${item.from || ''} → ${item.to || ''}` || item.id;
  }

  function fieldInput(data, collection, [path, label, type]) {
    const value = editor.values[path] ?? '';
    const attribute = `data-rv-field="${escapeHtml(path)}"`;
    if (Array.isArray(type)) return `<label>${escapeHtml(label)}<select ${attribute}>${type.map((option) => `<option value="${escapeHtml(option)}"${String(value) === option ? ' selected' : ''}>${escapeHtml(option ? (presentation.evidenceLabels?.[option] || option) : '—')}</option>`).join('')}</select></label>`;
    if (type === 'textarea' || type === 'lines') return `<label class="rv-wide">${escapeHtml(label)}<textarea rows="3" ${attribute}>${escapeHtml(value)}</textarea></label>`;
    if (type === 'place') return `<label>${escapeHtml(label)}<select ${attribute}><option value="">—</option>${[...(data.places || [])].sort((a, b) => a.name.localeCompare(b.name, 'cs')).map((place) => `<option value="${escapeHtml(place.id)}"${value === place.id ? ' selected' : ''}>${escapeHtml(place.name)}</option>`).join('')}</select></label>`;
    if (type === 'person') return `<label>${escapeHtml(label)}<select ${attribute}><option value="">—</option>${[...(data.people || [])].sort((a, b) => a.displayName.localeCompare(b.displayName, 'cs')).map((person) => `<option value="${escapeHtml(person.id)}"${value === person.id ? ' selected' : ''}>${escapeHtml(presentation.personChoiceLabel(person))}</option>`).join('')}</select></label>`;
    return `<label>${escapeHtml(label)}<input type="${type === 'number' ? 'number" step="any' : 'text'}" ${attribute} value="${escapeHtml(value)}"></label>`;
  }

  function loadEditorItem(data) {
    editor.values = {};
    const item = editor.id ? (data[editor.collection] || []).find((entry) => entry.id === editor.id) : null;
    if (!item) return;
    for (const [path, , type] of EDITOR_FIELDS[editor.collection]) {
      const value = getPath(item, path);
      if (value === undefined) continue;
      editor.values[path] = type === 'list' ? value.join(', ') : type === 'lines' ? value.join('\n') : String(value);
    }
  }

  function renderEditor(data) {
    const items = [...(data[editor.collection] || [])].sort((a, b) => itemLabel(editor.collection, a).localeCompare(itemLabel(editor.collection, b), 'cs'));
    return `<section class="view rv-view" aria-labelledby="rv-title">
      ${header('Editor', 'Nový záznam nebo úprava existujícího. Úpravy se sbírají do dávky změn; data se mění až skriptem apply-changes.')}
      <form class="rv-form" data-rv-form="editor" onsubmit="return false">
        <div class="rv-form-grid">
          <label>Druh záznamu<select data-rv-editor="collection">${Object.entries(EDITOR_LABELS).map(([key, label]) => `<option value="${key}"${editor.collection === key ? ' selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select></label>
          <label>Záznam<select data-rv-editor="id"><option value="">+ nový záznam</option>${items.map((item) => `<option value="${escapeHtml(item.id)}"${editor.id === item.id ? ' selected' : ''}>${escapeHtml(itemLabel(editor.collection, item))}</option>`).join('')}</select></label>
        </div>
        <fieldset><legend>${editor.id ? `Úprava: ${escapeHtml(editor.id)}` : `Nový záznam: ${escapeHtml(EDITOR_LABELS[editor.collection])}`}</legend><div class="rv-form-grid">${EDITOR_FIELDS[editor.collection].map((field) => fieldInput(data, editor.collection, field)).join('')}</div></fieldset>
        <div class="rv-actions"><button type="button" class="rv-primary" data-rv-action="editor-to-changes">${editor.id ? 'Přidat úpravu do dávky' : 'Přidat záznam do dávky'}</button></div>
        <div class="rv-status" data-rv-form-status role="status"></div>
      </form>
      ${renderPending()}
    </section>`;
  }

  function editorItem(data) {
    const item = {};
    for (const [path, , type] of EDITOR_FIELDS[editor.collection]) {
      const raw = String(editor.values[path] ?? '').trim();
      if (!raw) continue;
      let value = raw;
      if (type === 'list') value = raw.split(',').map((part) => part.trim()).filter(Boolean);
      else if (type === 'lines') value = raw.split(/\r?\n/).map((part) => part.trim()).filter(Boolean);
      else if (type === 'number') value = Number(raw);
      else if (path === 'priority') value = Number(raw);
      const [head, tail] = path.split('.');
      if (tail) {
        item[head] ||= {};
        item[head][tail] = value;
        if (tail === 'dateText' && isoFromCzech(raw)) item[head].date = isoFromCzech(raw);
      } else {
        item[head] = value;
        if (path === 'dateText' && isoFromCzech(raw)) item.date = isoFromCzech(raw);
      }
    }
    return item;
  }

  // Order-insensitive comparison of plain JSON values.
  function sameValue(a, b) {
    const canonical = (value) => (Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value);
    return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
  }

  function editorToOps(data) {
    const item = editorItem(data);
    const collection = editor.collection;
    const taken = changes.takenIds(data);
    for (const op of pendingSet().ops) if (op.item?.id) taken.add(op.item.id);
    const original = editor.id ? (data[collection] || []).find((entry) => entry.id === editor.id) : null;
    if (!original) {
      const base = item.displayName || item.title || item.name || (item.from && item.to ? `rel-${item.from}-${item.to}` : '') || `${collection}-${item.subjectId || ''}`;
      const year = (item.birth?.date || item.date || '').slice(0, 4);
      item.id = changes.slugId(collection === 'claims' ? `claim-${item.subjectId || ''}` : collection === 'sources' ? `src-${base}` : base, { suffix: collection === 'people' ? year : '', taken });
    } else item.id = original.id;
    const errors = schema && globalThis.RK_SCHEMA ? schema.validateItem(globalThis.RK_SCHEMA, collection, original ? changes.mergeFields(original, item) : item).map((error) => `${error.path}: ${error.message}`) : [];
    const ids = (key) => new Set((data[key] || []).map((entry) => entry.id));
    const people = ids('people');
    const sources = ids('sources');
    for (const op of pendingSet().ops) {
      if (op.op === 'add' && op.collection === 'people') people.add(op.item.id);
      if (op.op === 'add' && op.collection === 'sources') sources.add(op.item.id);
    }
    for (const id of item.sourceIds || []) if (!sources.has(id)) errors.push(`Pramen ${id} neexistuje.`);
    for (const id of [...(item.personIds || []), item.from, item.to].filter(Boolean)) if (!people.has(id)) errors.push(`Osoba ${id} neexistuje.`);
    if (errors.length) return { errors, ops: [] };
    if (!original) return { errors: [], ops: [{ op: 'add', collection, item }] };
    const set = {};
    for (const [path] of EDITOR_FIELDS[collection]) {
      const key = path.split('.')[0];
      if (!sameValue(item[key], original[key])) set[key] = item[key] === undefined ? null : item[key];
    }
    if (!Object.keys(set).length) return { errors: ['Nic se nezměnilo.'], ops: [] };
    return { errors: [], ops: [{ op: 'update', collection, id: original.id, set }] };
  }

  // ---------- 5. DNA ----------
  function renderDna(data) {
    const dnaModule = deps.dna;
    const dna = data.dna;
    if (!dna || typeof dnaModule?.leedsClusters !== 'function') {
      return `<section class="view rv-view" aria-labelledby="rv-title">${header('DNA', 'Shody z testů DNA seskupené Leedsovou metodou a přiřazené k větvím rodu.')}
        <div class="empty-state"><strong>Žádná data DNA</strong><p>Výsledky testů se ukládají do <code>research/dna.json</code> (formát v docs/data-contract.md). Do kroniky se dostanou jen v badatelském vydání a shody mají místo jmen přezdívky.</p></div></section>`;
    }
    const clusters = dnaModule.leedsClusters(dna.matches || []);
    const matches = new Map((dna.matches || []).map((match) => [match.id, match]));
    // Branches are counted from the tested person: the grandparent line
    // (Ahnentafel 4–7) through which a documented common ancestor is reached.
    const tested = (dna.tests || [])[0]?.personId;
    const { numberOf, idOf } = tested ? model.getAhnentafel(data, tested) : { numberOf: new Map(), idOf: new Map() };
    const people = peopleIndex(data);
    const branchOf = (ancestorId) => {
      const number = numberOf.get(ancestorId);
      if (!number || number < 2) return null;
      const generation = Math.floor(Math.log2(number));
      const side = number < 3 * 2 ** (generation - 1) ? 'paternal' : 'maternal';
      const grandparent = generation >= 2 ? Math.floor(number / 2 ** (generation - 2)) : null;
      const name = grandparent ? people.get(idOf.get(grandparent))?.displayName : '';
      return { key: `${side}:${grandparent || ''}`, side, label: `${side === 'paternal' ? 'otcovská' : 'mateřská'} větev${name ? ` – ${name}` : ''}` };
    };
    const assigned = new Map(dnaModule.assignClustersToBranches(clusters.clusters, dna.matches || [], branchOf).assignments.map((entry) => [entry.clusterId, entry.branches.map((branch) => branch.label).join(' nebo ')]));
    return `<section class="view rv-view" aria-labelledby="rv-title">${header('DNA', `${presentation.plural((dna.matches || []).length, 'shoda', 'shody', 'shod')} z ${presentation.plural((dna.tests || []).length, 'testu', 'testů', 'testů')}. Shluky jsou skupiny shod, které sdílejí společné příbuzné.`)}
      <ol class="rv-dna-clusters">${clusters.clusters.map((cluster, index) => `<li><h2>Shluk ${index + 1}${assigned.get(cluster.id) ? ` <small>· ${escapeHtml(assigned.get(cluster.id))}</small>` : ''}</h2><ul>${cluster.matchIds.map((id) => {
        const match = matches.get(id);
        const candidates = dnaModule.relationshipCandidates(match.sharedCm).slice(0, 3).map((candidate) => candidate.label).join(', ');
        return `<li><strong>${escapeHtml(match.alias)}</strong> · ${escapeHtml(match.sharedCm)} cM · ${escapeHtml(candidates)}</li>`;
      }).join('')}</ul></li>`).join('')}</ol>
      ${dnaModule.SOURCE ? `<p class="muted">Rozsahy cM: <a href="${escapeHtml(dnaModule.SOURCE.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(dnaModule.SOURCE.title)}</a>, ${escapeHtml(dnaModule.SOURCE.author)} (${escapeHtml(dnaModule.SOURCE.license)}). Odhad vztahu je vodítko, ne důkaz.</p>` : ''}
    </section>`;
  }

  function render(view, data, state = {}) {
    if (view === 'research') return renderQueue(data, state);
    if (view === 'health') return renderHealth(data, state);
    if (view === 'transcribe') return renderTranscribe(data, state);
    if (view === 'editor') return renderEditor(data, state);
    if (view === 'dna') return renderDna(data, state);
    return '';
  }

  // ---------- interaction ----------
  function mount(view, root, context = {}) {
    const { data } = context;
    const status = (text) => {
      const target = root.querySelector('[data-rv-form-status]') || root.querySelector('[data-rv-status]');
      if (target) target.textContent = text;
    };
    const rerender = () => context.rerender?.();

    const onInput = (event) => {
      const target = event.target;
      const value = currentDraft();
      if (target.dataset.rvLiteral) { value.literal[target.dataset.rvLiteral] = target.value; saveDraft(); }
      else if (target.dataset.rvInterpretation) { value.interpretation[target.dataset.rvInterpretation] = target.value; saveDraft(); }
      else if (target.dataset.rvSource) { value.source[target.dataset.rvSource] = target.value; saveDraft(); }
      else if (target.dataset.rvNewName) { value.newNames[target.dataset.rvNewName] = target.value; saveDraft(); }
      else if (target.dataset.rvField) editor.values[target.dataset.rvField] = target.value;
      else if (target.dataset.rvPendingField) { pendingSet()[target.dataset.rvPendingField] = target.value; savePending(); }
    };
    const onChange = (event) => {
      const target = event.target;
      const value = currentDraft();
      if (target.dataset.rvDraft === 'kind') { draft.value = { ...emptyDraft(target.value), source: value.source }; saveDraft(); rerender(); }
      else if (target.dataset.rvDraft === 'confirmLinks') { value.confirmLinks = target.checked; saveDraft(); }
      else if (target.dataset.rvLink) { value.links[target.dataset.rvLink] = target.value; saveDraft(); rerender(); }
      else if (target.dataset.rvSource) onInput(event);
      else if (target.dataset.rvEditor === 'collection') { editor.collection = target.value; editor.id = ''; editor.values = {}; rerender(); }
      else if (target.dataset.rvEditor === 'id') { editor.id = target.value; loadEditorItem(data); rerender(); }
      else if (target.dataset.rvField) editor.values[target.dataset.rvField] = target.value;
    };
    const onClick = (event) => {
      const button = event.target.closest?.('[data-rv-action]');
      if (!button || !root.contains(button)) return;
      const action = button.dataset.rvAction;
      if (action === 'download-changes') {
        const set = pendingSet();
        download(`zmeny-${new Date().toISOString().slice(0, 10)}.json`, `${JSON.stringify(set, null, 2)}\n`);
        status('Dávka je stažená. Použij ji příkazem node scripts/apply-changes.mjs.');
      } else if (action === 'clear-changes') {
        clearPending();
        rerender();
      } else if (action === 'remove-op') {
        pendingSet().ops.splice(Number(button.dataset.rvIndex), 1);
        savePending();
        rerender();
      } else if (action === 'transcription-to-changes') {
        const result = transcriptionToOps(data, currentDraft());
        if (result.errors.length) { status(result.errors.join(' ')); return; }
        addOps(result.ops);
        rerender();
        status(`Do dávky ${result.ops.length === 1 ? 'přidána' : result.ops.length <= 4 ? 'přidány' : 'přidáno'} ${presentation.plural(result.ops.length, 'změna', 'změny', 'změn')}.`);
      } else if (action === 'transcription-reset') {
        draft.value = emptyDraft(currentDraft().kind);
        saveDraft();
        rerender();
      } else if (action === 'editor-to-changes') {
        const result = editorToOps(data);
        if (result.errors.length) { status(result.errors.join(' ')); return; }
        addOps(result.ops);
        editor.values = {};
        editor.id = '';
        rerender();
        status('Přidáno do dávky změn.');
      } else if (action === 'transcribe-for') {
        prefillFromQueueItem(data, button.dataset.rvItem, context.state?.egoPersonId);
        context.navigate?.('transcribe');
      } else if (action === 'severity') {
        context.setFilter?.('severity', button.dataset.rvValue);
      } else if (action === 'copy-key') {
        const key = button.dataset.rvKey;
        const done = () => status(`Klíč ${key} je ve schránce.`);
        if (globalThis.navigator?.clipboard?.writeText) globalThis.navigator.clipboard.writeText(key).then(done, () => status(key));
        else status(key);
      } else if (action === 'download-gedcom' && typeof deps.gedcom?.toGedcom === 'function') {
        const result = deps.gedcom.toGedcom(data, { living: 'private' });
        download('rodova-kronika.ged', typeof result === 'string' ? result : result.text, 'text/plain');
      }
    };
    root.addEventListener('input', onInput);
    root.addEventListener('change', onChange);
    root.addEventListener('click', onClick);
    return { destroy() { root.removeEventListener('input', onInput); root.removeEventListener('change', onChange); root.removeEventListener('click', onClick); } };
  }

  // ---------- regions on images (opened from the media detail) ----------
  function renderRegionEditor(data, media) {
    const people = [...(data.people || [])].sort((a, b) => a.displayName.localeCompare(b.displayName, 'cs'));
    const suggested = new Set(media.personIds || []);
    return `<details class="rv-region-editor" data-region-editor="${escapeHtml(media.id)}"><summary>Badatelna: označit osobu nebo zápis na obrázku</summary>
      <p class="muted">Zapni kreslení a táhni myší přes obrázek. Oblast se uloží do dávky změn (soubor media-notes.json).</p>
      <div class="rv-form-grid">
        <label class="rv-check"><input type="checkbox" data-region-draw> Kreslit oblast</label>
        <label>Osoba<select data-region-person><option value="">— neznámá osoba —</option>${people.map((person) => `<option value="${escapeHtml(person.id)}">${suggested.has(person.id) ? '★ ' : ''}${escapeHtml(presentation.personChoiceLabel(person))}</option>`).join('')}</select></label>
        <label>Druh<select data-region-kind><option value="face">tvář na fotografii</option><option value="text">řádek se jménem</option></select></label>
        <label>Popisek (nepovinný)<input type="text" data-region-label></label>
      </div>
      <p data-region-coords class="muted">Oblast zatím není nakreslená.</p>
      <div class="rv-actions"><button type="button" class="rv-primary" data-region-add disabled>Přidat oblast do dávky</button><button type="button" data-region-download>Stáhnout dávku změn</button></div>
      <p class="rv-status" data-region-status role="status"></p>
    </details>`;
  }

  function mountRegionEditor(root, data, mediaId) {
    const editorRoot = root.querySelector(`[data-region-editor="${mediaId}"]`);
    const frame = root.querySelector('.media-figure-frame');
    if (!editorRoot || !frame) return null;
    const media = (data.media || []).find((item) => item.id === mediaId);
    let rect = null;
    let start = null;
    let draft = null;
    const coords = editorRoot.querySelector('[data-region-coords]');
    const add = editorRoot.querySelector('[data-region-add]');
    const status = editorRoot.querySelector('[data-region-status]');
    const drawing = () => editorRoot.querySelector('[data-region-draw]')?.checked;
    const relative = (event) => {
      const box = frame.getBoundingClientRect();
      return { x: Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)), y: Math.min(1, Math.max(0, (event.clientY - box.top) / box.height)) };
    };
    const round = (value) => Math.round(value * 1000) / 1000;
    const onDown = (event) => {
      if (!drawing()) return;
      event.preventDefault();
      start = relative(event);
      draft?.remove();
      draft = document.createElement('div');
      draft.className = 'media-region media-region-draft';
      frame.append(draft);
      frame.setPointerCapture?.(event.pointerId);
    };
    const onMove = (event) => {
      if (!start || !draft) return;
      const point = relative(event);
      rect = { x: round(Math.min(start.x, point.x)), y: round(Math.min(start.y, point.y)), w: round(Math.abs(point.x - start.x)), h: round(Math.abs(point.y - start.y)) };
      Object.assign(draft.style, { left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%` });
    };
    const onUp = () => {
      if (!start) return;
      start = null;
      const usable = rect && rect.w > 0.01 && rect.h > 0.01;
      add.disabled = !usable;
      coords.textContent = usable ? `Oblast: x ${rect.x}, y ${rect.y}, šířka ${rect.w}, výška ${rect.h}` : 'Oblast je příliš malá, nakresli ji znovu.';
    };
    const onClick = (event) => {
      if (event.target.closest('[data-region-add]') && rect) {
        const set = pendingSet();
        const pendingRegions = set.ops.filter((op) => op.file === 'media-notes' && op.id === mediaId).flatMap((op) => op.set?.regions || []);
        const existing = pendingRegions.length ? pendingRegions : media.regions || [];
        const personId = editorRoot.querySelector('[data-region-person]').value;
        const label = editorRoot.querySelector('[data-region-label]').value.trim();
        const region = { id: `r${existing.length + 1}-${Date.now().toString(36)}`, kind: editorRoot.querySelector('[data-region-kind]').value, ...(personId ? { personId } : {}), ...(label ? { label } : personId ? {} : { label: 'neznámá osoba' }), ...rect };
        set.ops = set.ops.filter((op) => !(op.file === 'media-notes' && op.id === mediaId));
        set.ops.push({ op: 'update', file: 'media-notes', collection: 'media', id: mediaId, set: { regions: [...existing, region] } });
        savePending();
        const total = existing.length + 1;
        status.textContent = `Oblast přidána; v dávce ${total === 1 ? 'je' : total <= 4 ? 'jsou' : 'je'} ${presentation.plural(total, 'oblast', 'oblasti', 'oblastí')} pro tento obrázek.`;
        rect = null;
        add.disabled = true;
        draft?.classList.add('is-saved');
        draft = null;
      }
      if (event.target.closest('[data-region-download]')) {
        download(`zmeny-${new Date().toISOString().slice(0, 10)}.json`, `${JSON.stringify(pendingSet(), null, 2)}\n`);
      }
    };
    frame.addEventListener('pointerdown', onDown);
    frame.addEventListener('pointermove', onMove);
    frame.addEventListener('pointerup', onUp);
    editorRoot.addEventListener('click', onClick);
    return { destroy() { frame.removeEventListener('pointerdown', onDown); frame.removeEventListener('pointermove', onMove); frame.removeEventListener('pointerup', onUp); editorRoot.removeEventListener('click', onClick); } };
  }

  function navigationItems(data) {
    return Object.entries(VIEWS).filter(([view]) => view !== 'dna' || data?.dna).map(([view, entry]) => ({ view, label: entry.label, hash: entry.hash }));
  }

  return {
    VIEWS, render, mount, navigationItems, renderRegionEditor, mountRegionEditor,
    // Exposed for tests.
    transcriptionToOps, emptyDraft, isoFromCzech, TEMPLATES, editorState: editor, editorToOps, loadEditorItem, EDITOR_FIELDS,
    resetState() { pending.set = null; draft.value = null; editor.collection = 'people'; editor.id = ''; editor.values = {}; },
  };
});
