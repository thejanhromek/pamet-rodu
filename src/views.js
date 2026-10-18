(function registerViews(root, factory) {
  const model = typeof module === 'object' && module.exports ? require('./model.js') : root.RKModel;
  const presentation = typeof module === 'object' && module.exports ? require('./presentation.js') : root.RKPresentation;
  const components = typeof module === 'object' && module.exports ? require('./components.js') : root.RKComponents;
  const history = typeof module === 'object' && module.exports ? require('./history.js') : root.RKHistory;
  const map = typeof module === 'object' && module.exports ? require('./map.js') : root.RKMap;
  const api = factory(model, presentation, components, history, map);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.RKViews = api;
})(globalThis, function createViews(RKModel, presentation, components, RKHistory, RKMap) {
  'use strict';
  const model = RKModel;

  const lineageLabels = presentation.lineageLabels;
  const evidenceLabels = presentation.evidenceLabels;
  const eventLabels = presentation.eventTypeLabels;
  const sourceLabels = presentation.sourceTypeLabels;

  function escapeHtml(value = '') {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function formatLife(person) {
    const birth = person.birth?.dateText;
    const death = person.death?.dateText;
    if (!birth && !death) return 'Data nejsou známá';
    return [birth ? `* ${birth}` : null, death ? `† ${death}` : null].filter(Boolean).join(' · ');
  }

  function evidenceBadge(status) {
    return `<span class="evidence-badge evidence-${escapeHtml(status)}"><span aria-hidden="true">●</span> ${escapeHtml(presentation.evidenceLabel(status))}</span>`;
  }

  function familyEvidenceExplanation(status) {
    return ({
      verified: 'Tento údaj potvrzuje uvedený pramen.',
      supported: 'Uvedené prameny tento údaj podporují.',
      'family-record': 'Tento údaj pochází z rodinné vzpomínky nebo předaného záznamu.',
      hypothesis: 'Jde o otevřenou možnost; kronika zachovává i to, co zatím není jisté.',
    })[status] || 'Podrobnosti jsou uvedeny u pramene.';
  }

  function sourceReadingNote(source) {
    return ['foreign-family-tree', 'census-index', 'parish-register-index', 'archive-index'].includes(source.type)
      ? '<p class="muted">Jde o rodokmen nebo rejstřík. Údaje z něj vyžadují ověření v původním zápisu.</p>' : '';
  }

  const isAudio = (media) => media?.kind === 'audio-clip';
  const isImage = (media) => Boolean(media) && !isAudio(media);
  function clockTime(seconds) {
    const total = Math.max(0, Math.round(Number(seconds) || 0));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = String(total % 60).padStart(2, '0');
    return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${secs}` : `${minutes}:${secs}`;
  }
  function interviewDate(media) {
    const match = String(media.interview || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? `${Number(match[3])}. ${Number(match[2])}. ${match[1]}` : '';
  }
  function audioClipsFor(data, personId) {
    return (data.media || []).filter((media) => isAudio(media) && (media.personIds || []).includes(personId));
  }
  // An interview excerpt: title, where it is in the recording, player and
  // the transcribed words (so it also works without sound).
  function renderAudioClip(media, { compact = false } = {}) {
    const meta = [media.speaker, interviewDate(media) ? `rozhovor ${interviewDate(media)}` : '', `čas ${clockTime(media.start)}–${clockTime(media.end)}`].filter(Boolean).join(' · ');
    return `<figure class="audio-clip${compact ? ' is-compact' : ''}" data-audio-clip="${escapeHtml(media.id)}"><figcaption><strong>${escapeHtml(media.title)}</strong><span>${escapeHtml(meta)}</span></figcaption>${media.dataUri ? `<audio controls preload="none" src="${media.dataUri}"></audio>` : '<p class="muted">Nahrávka bude vložena při sestavení.</p>'}${media.quote && !compact ? `<details class="audio-clip-transcript"><summary>Přepis úryvku</summary><blockquote>${escapeHtml(media.quote)}</blockquote><p class="muted">Strojový přepis; jména a nářeční slova mohou být zkomolená, rozhoduje nahrávka.</p></details>` : ''}</figure>`;
  }

  function subjectLabel(value) { return presentation.subjectTypeLabel(value); }
  function formatDate(value) { return presentation.formatDate(value); }
  function personEvidence(data, personId) { return model.getEvidenceSummary(data, 'person', personId); }
  function relationTo(data, egoId, person) {
    return egoId ? presentation.relationshipLabel(model.getRelationship(data, egoId, person.id), person.sex) : '';
  }

  function renderMetric(value, label, note = '') {
    return `<article class="metric-card"><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span>${note ? `<small>${escapeHtml(note)}</small>` : ''}</article>`;
  }

  function renderMapAttribution(places = []) {
    const coordinateSources = [...new Map(places.map((place) => place.coordinateSource).filter(Boolean).map((source) => [`${source.name}|${source.license}`, source])).values()];
    return `<p class="overview-map-attribution">Mapový podklad: <a href="https://www.naturalearthdata.com/about/terms-of-use/" target="_blank" rel="noopener noreferrer">Natural Earth (veřejná doména)</a>${coordinateSources.map((source) => ` · souřadnice: <a href="${escapeHtml(source.url || 'https://www.geonames.org/')}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.name || 'zdroj souřadnic')}</a> (${escapeHtml(source.license || '')}${source.licenseUrl ? `, <a href="${escapeHtml(source.licenseUrl)}" target="_blank" rel="noopener noreferrer">licence</a>` : ''})`).join('')}</p>`;
  }

  function allBranches(data) {
    return [...new Set((data.people || []).flatMap((person) => person.branch || []))].sort((a, b) => a.localeCompare(b, 'cs'));
  }

  function allPeople(data) {
    return [...data.people].sort((a, b) => a.displayName.localeCompare(b.displayName, 'cs'));
  }

  function filterChips(data, filters = {}, labels = {}) {
    const valueLabels = { ...labels };
    if (filters.branch) valueLabels[`branch:${filters.branch}`] = filters.branch;
    if (filters.placeId) valueLabels[`placeId:${filters.placeId}`] = data.places.find((place) => place.id === filters.placeId)?.name || filters.placeId;
    if (filters.personId) {
      const person = data.people.find((item) => item.id === filters.personId);
      valueLabels[`personId:${filters.personId}`] = person ? presentation.personChoiceLabel(person) : filters.personId;
    }
    if (filters.sourceId) valueLabels[`sourceId:${filters.sourceId}`] = data.sources.find((source) => source.id === filters.sourceId)?.title || filters.sourceId;
    if (filters.type) valueLabels[`type:${filters.type}`] = presentation.eventTypeLabel(filters.type);
    if (filters.evidence) valueLabels[`evidence:${filters.evidence}`] = presentation.evidenceLabel(filters.evidence);
    if (filters.subjectType) valueLabels[`subjectType:${filters.subjectType}`] = presentation.subjectTypeLabel(filters.subjectType);
    if (filters.sourceType) valueLabels[`sourceType:${filters.sourceType}`] = presentation.sourceTypeLabel(String(filters.sourceType).split(',')[0]);
    if (filters.kind) valueLabels[`kind:${filters.kind}`] = presentation.mediaTypeLabel(filters.kind);
    if (filters.status) valueLabels[`status:${filters.status}`] = presentation.taskStatusLabel(filters.status);
    if (filters.lineage) valueLabels[`lineage:${filters.lineage}`] = presentation.lineageLabel(filters.lineage);
    if (filters.category) valueLabels[`category:${filters.category}`] = presentation.changeCategoryLabel(filters.category);
    return components.activeFilterChips(filters, valueLabels);
  }

  function overviewStories(data, egoId, limit = 4) {
    return (data.people || [])
      .filter((person) => (person.familyNotes || []).length)
      .map((person) => ({ person, text: person.familyNotes.join(' ') }))
      // Remembered stories first, then the richest notes.
      .map((entry) => ({ ...entry, memory: /vzpomín|vyprávě/i.test(entry.text) ? 1 : 0 }))
      .sort((a, b) => b.memory - a.memory || b.text.length - a.text.length)
      .slice(0, limit)
      .map(({ person, text }) => {
        const relation = relationTo(data, egoId, person);
        const excerpt = text.length > 220 ? `${text.slice(0, 220).replace(/\s+\S*$/, '')}…` : text;
        const clip = audioClipsFor(data, person.id)[0];
        return `<article class="overview-story"><header><strong>${escapeHtml(person.displayName)}</strong>${relation ? `<span>${escapeHtml(relation)}</span>` : ''}</header><p>${escapeHtml(excerpt)}</p>${clip ? renderAudioClip(clip, { compact: true }) : ''}<button type="button" class="text-link" data-person-id="${escapeHtml(person.id)}">Celý profil →</button></article>`;
      }).join('');
  }

  function renderOverview(data, state = {}) {
    const egoId = state.egoPersonId || data.meta?.defaultPersonId;
    const ego = RKModel.getPerson(data, egoId);
    const generations = ego ? Math.max(0, ...RKModel.getAncestorDepths(data, ego.id).values()) + 1 : 0;
    const years = (data.people || []).map((person) => presentation.birthYear(person)).filter(Boolean);
    const oldestYear = years.length ? Math.min(...years) : null;
    const mappedPlaces = (data.places || []).filter((place) => Number.isFinite(Number(place.lat)) && Number.isFinite(Number(place.lon))).length;
    const stories = overviewStories(data, egoId);
    const photos = (data.media || []).filter((item) => item.dataUri && isImage(item)).slice(0, 4);
    return `<section class="view view-overview" aria-labelledby="overview-title">
      <div class="overview-hero">
        <div class="overview-intro"><h1 id="overview-title">${escapeHtml(data.meta?.title || 'Rodová kronika')}</h1>
          <p>Kdo byli naši předci, kde žili a co se o nich ví. U každého údaje je poznat, zda vychází z matriky, z rodinného vyprávění, nebo zatím zůstává otevřenou otázkou.</p>
          <div class="overview-ego" data-overview-ego>
            ${components.personPicker({ id: 'overview-ego', attribute: 'data-ego-person', people: data.people, relationships: data.relationships, selectedId: '', label: 'Najděte sebe v rodokmenu', placeholder: 'Napište své jméno…' })}
            <p class="muted">Kronika pak u každého člověka ukáže, jak je vám příbuzný. Volba se pamatuje jen v tomto prohlížeči.</p>
          </div>
          <div class="overview-actions"><button class="overview-primary-action" type="button" data-view="tree">Otevřít rodokmen</button><button class="overview-secondary-action" type="button" data-view="people">Procházet osoby</button></div>
        </div>
        <div class="overview-metrics" aria-label="Kronika v číslech">
          ${renderMetric(String(data.people.length), 'osob')}
          ${generations ? renderMetric(String(generations), 'generací', ego ? `od ${ego.displayName}` : '') : ''}
          ${oldestYear ? renderMetric(String(oldestYear), 'nejstarší zapsané narození') : ''}
          ${renderMetric(String(mappedPlaces), 'míst na mapě')}
        </div>
      </div>
      ${stories ? `<section class="overview-stories" aria-labelledby="overview-stories-heading"><header class="overview-section-heading"><h2 id="overview-stories-heading">Ze vzpomínek a pramenů</h2><button type="button" class="text-link" data-view="claims">Všechny příběhy →</button></header><div class="overview-story-grid">${stories}</div></section>` : ''}
      ${photos.length ? `<section class="overview-photos" aria-labelledby="overview-photos-heading"><header class="overview-section-heading"><h2 id="overview-photos-heading">Rodinné sešity a fotografie</h2><button type="button" class="text-link" data-view="media">Všechny →</button></header><div class="overview-photo-strip">${photos.map((item) => `<button type="button" data-media-id="${escapeHtml(item.id)}"><img src="${item.dataUri}" alt="${escapeHtml(item.title)}" loading="lazy"><span>${escapeHtml(item.title)}</span></button>`).join('')}</div></section>` : ''}
      <section class="overview-map-section" aria-labelledby="overview-places-heading">
        <header class="overview-map-heading"><div><h2 id="overview-places-heading">Místa v kronice</h2><p>Vyberte místo a zobrazte související osoby a události. Mapu přiblížíte kliknutím do ní nebo Ctrl + kolečkem.</p></div></header>
        ${renderMapAttribution(data.places || [])}
        ${renderPlaceMap(data, data.places || [], { idPrefix: 'overview-place-map', title: 'Mapa míst v kronice', description: 'Mapa všech míst s platnými souřadnicemi.' })}
      </section>
    </section>`;
  }

  function renderPersonCard(person, data, egoId = data.meta?.defaultPersonId) {
    const summary = personEvidence(data, person.id);
    const relation = relationTo(data, egoId, person);
    return `<button class="person-card" type="button" data-person-id="${escapeHtml(person.id)}">
      <span class="person-card-top"><span class="person-initials" aria-hidden="true">${escapeHtml(person.displayName.split(/\s+/).filter((part) => !['roz.', 'rozená'].includes(part)).slice(0, 2).map((part) => part[0]).join(''))}</span><span class="lineage-tag lineage-${escapeHtml(person.lineage)}">${escapeHtml(presentation.lineageLabel(person.lineage))}</span></span>
      <strong>${escapeHtml(person.displayName)}</strong>
      ${relation ? `<span class="person-relation">${escapeHtml(relation)}</span>` : ''}
      <span class="person-life">${escapeHtml(formatLife(person))}</span>
      <small>${escapeHtml((person.occupations || person.residences || ['Bez dalších údajů'])[0])}</small>
      <span class="person-evidence-note">${presentation.plural(summary.totalClaims, 'doložený údaj', 'doložené údaje', 'doložených údajů')} · ${presentation.plural(summary.uniqueSourceCount, 'pramen', 'prameny', 'pramenů')}</span>
    </button>`;
  }

  function renderPeople(data, state = {}) {
    const query = state.query || '';
    const filters = state.filters || {};
    const people = RKModel.filterPeople(data, { ...filters, query });
    const branches = allBranches(data);
    const places = [...data.places].sort((a, b) => a.name.localeCompare(b.name, 'cs'));

    return `<section class="view" aria-labelledby="people-title">
      <div class="view-header"><div><h1 id="people-title">Osoby</h1><p>Lidé v kronice: ${people.length} z ${data.people.length} záznamů · rodinné větve a životní příběhy</p></div></div>
      ${components.filterBar({ count: people.length, controls: `<label>Větev<select data-filter="lineage"><option value="">Všechny</option>${Object.entries(lineageLabels).map(([value, label]) => `<option value="${value}"${filters.lineage === value ? ' selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select></label><label>Rod<select data-filter="branch"><option value="">Všechny rody</option>${branches.map((branch) => `<option value="${escapeHtml(branch)}"${filters.branch === branch ? ' selected' : ''}>${escapeHtml(branch)}</option>`).join('')}</select></label><label>Místo<select data-filter="placeId"><option value="">Všechna místa</option>${places.map((place) => `<option value="${escapeHtml(place.id)}"${filters.placeId === place.id ? ' selected' : ''}>${escapeHtml(place.name)}</option>`).join('')}</select></label><label>Období od<input type="number" inputmode="numeric" data-filter="fromYear" value="${escapeHtml(filters.fromYear || '')}" placeholder="rok"></label><label>Období do<input type="number" inputmode="numeric" data-filter="toYear" value="${escapeHtml(filters.toYear || '')}" placeholder="rok"></label><label>Důkazy<select data-filter="evidenceAvailability"><option value="">Všechny</option><option value="available"${filters.evidenceAvailability === 'available' ? ' selected' : ''}>S vazbou na důkazy</option><option value="missing"${filters.evidenceAvailability === 'missing' ? ' selected' : ''}>Bez vazby na důkazy</option></select></label><label>Řazení<select data-filter="sort"><option value="name">Jméno</option><option value="birth"${filters.sort === 'birth' ? ' selected' : ''}>Rok narození</option><option value="branch"${filters.sort === 'branch' ? ' selected' : ''}>Větev</option></select></label>`})}
      ${filterChips(data, filters, { lineage: 'Linie', branch: 'Rod', placeId: 'Místo', fromYear: 'Od roku', toYear: 'Do roku', evidenceAvailability: 'Důkazy', sort: 'Řazení' })}
      ${people.length ? `<div class="result-list person-list" data-result-list>${people.map((person) => `<article class="result-row person-result-row">${renderPersonCard(person, data, state.egoPersonId || data.meta?.defaultPersonId)}</article>`).join('')}</div>` : components.emptyState('Nikdo nenalezen', 'Zkus jiné jméno, obec nebo zruš filtry.')}
    </section>`;
  }

  function renderRelationGroup(title, people) {
    if (!people.length) return '';
    return `<section class="detail-section"><h3>${escapeHtml(title)}</h3><div class="relation-list">${people.map((person) => `<button type="button" data-person-id="${escapeHtml(person.id)}">${escapeHtml(presentation.personChoiceLabel(person))}</button>`).join('')}</div></section>`;
  }

  // General history (src/data/history.json) stays separate from the genealogy
  // data: tests and tools pass it in options.history, the built page embeds RK_HISTORY.
  function historyEvents(options = {}) {
    return (options.history || globalThis.RK_HISTORY)?.events || [];
  }

  function renderHistorySources(event) {
    return (event.sources || []).map((source) => `<a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.title)}${source.publisher ? ` (${escapeHtml(source.publisher)})` : ''}</a>`).join(', ');
  }

  function renderLifeContext(data, person, options = {}) {
    const events = historyEvents(options);
    if (!events.length || !RKHistory) return '';
    const headingId = `life-context-${escapeHtml(person.id)}`;
    const context = RKHistory.lifeContext(person, events, { data, currentYear: options.currentYear });
    if (!context.available) {
      return `<section class="detail-section life-context" aria-labelledby="${headingId}"><h3 id="${headingId}">Život na pozadí dějin</h3><p class="muted">Rok narození kronika nezná, proto k tomuto životu dějinné události nepřiřazuje.</p></section>`;
    }
    if (!context.items.length) return '';
    const { birth, death } = context.span;
    const notes = [
      birth.approximate ? 'Datum narození není přesné, věk je proto uveden se slovem „asi“.' : '',
      death.year && death.latestYear !== death.year ? `Rok úmrtí není jistý (${death.year}–${death.latestYear}).` : '',
      !death.year && context.items.some((item) => item.possible) ? 'Rok úmrtí kronika nezná; u pozdějších událostí je uvedeno, že platí jen pro dobu, kdy byl člověk naživu.' : '',
    ].filter(Boolean).join(' ');
    return `<section class="detail-section life-context" aria-labelledby="${headingId}">
      <h3 id="${headingId}">Život na pozadí dějin</h3>
      <p class="muted">Co se dělo ve světě a na Moravě během tohoto života. Jde o obecné dějiny podle encyklopedických zdrojů, ne o údaje o této osobě.${notes ? ` ${escapeHtml(notes)}` : ''}</p>
      <ol class="life-context-list">${context.items.map((item) => `<li class="life-context-item${item.possible ? ' is-possible' : ''}"><time>${escapeHtml(RKHistory.formatEventDate(item.event))}</time><div><strong>${escapeHtml(item.event.title)}</strong><span class="life-context-age">${escapeHtml(RKHistory.ageSentence(item, person.sex))}</span>${item.possible ? `<span class="life-context-possible">${escapeHtml(RKHistory.possibleNote(person.sex))}</span>` : ''}<details><summary>Co se stalo</summary><p>${escapeHtml(item.event.summary)}</p><p class="muted">Zdroj: ${renderHistorySources(item.event)}</p></details></div></li>`).join('')}</ol>
    </section>`;
  }

  function renderPersonDetail(data, personId, options = {}) {
    const person = RKModel.getPerson(data, personId);
    if (!person) return '<div class="empty-state"><strong>Osoba nenalezena</strong></div>';
    const family = RKModel.getFamily(data, personId, { extended: true });
    const claims = RKModel.getClaimsForSubject(data, 'person', personId);
    const summary = personEvidence(data, personId);
    const sources = (person.sourceIds || []).map((id) => data.sources.find((source) => source.id === id)).filter(Boolean);
    const facts = [
      person.birth?.dateText ? ['Narození', person.birth.dateText] : null,
      person.death?.dateText ? ['Úmrtí', person.death.dateText] : null,
      person.occupations?.length ? ['Povolání', person.occupations.join('; ')] : null,
      person.residences?.length ? ['Místa', person.residences.join('; ')] : null,
    ].filter(Boolean);
    const egoId = options.egoPersonId || data.meta?.defaultPersonId;
    const ego = RKModel.getPerson(data, egoId);
    const relationship = ego ? model.getRelationship(data, ego.id, person.id) : null;
    const relation = relationship ? presentation.relationshipLabel(relationship, person.sex) : '';
    const commonAncestor = relationship?.kind === 'blood' && relationship.up > 0 && relationship.down > 0 ? RKModel.getPerson(data, relationship.commonAncestorId) : null;
    const relationLine = relation && relationship.kind !== 'self'
      ? `<p class="detail-relation"><strong>${escapeHtml(relation)}</strong> · vzhledem k osobě ${escapeHtml(ego.displayName)}${commonAncestor ? ` · společný předek: ${escapeHtml(commonAncestor.displayName)}` : ''}</p>`
      : '';

    return `<div class="person-detail">
      <header class="detail-hero"><span class="person-initials large" aria-hidden="true">${escapeHtml(person.displayName.split(/\s+/).slice(0, 2).map((part) => part[0]).join(''))}</span><div><span class="lineage-tag lineage-${escapeHtml(person.lineage)}">${escapeHtml(presentation.lineageLabel(person.lineage))}</span><h2>${escapeHtml(person.displayName)}</h2><p>${escapeHtml(formatLife(person))}</p>${relationLine}</div></header>
      <div class="detail-actions">${options.showTreeFocusAction ? `<button type="button" data-tree-set-focus="${escapeHtml(person.id)}">Nastavit jako střed rodokmenu</button>` : ''}<button type="button" class="print-action" data-print>Vytisknout profil</button></div>
      ${components.evidenceSummary(summary)}
      ${facts.length ? `<dl class="fact-list">${facts.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>` : ''}
      ${(person.familyNotes || []).length ? `<section class="detail-section"><h3>Vzpomínky a poznámky</h3>${person.familyNotes.map((note) => `<p>${escapeHtml(note)}</p>`).join('')}</section>` : ''}
      ${audioClipsFor(data, person.id).length ? `<section class="detail-section"><h3>Z rozhovoru – poslechněte si</h3><div class="audio-clip-list">${audioClipsFor(data, person.id).map((clip) => renderAudioClip(clip)).join('')}</div></section>` : ''}
      ${renderRelationGroup('Rodiče', family.parents)}
      ${renderRelationGroup('Partner nebo partnerka', family.partners)}
      ${renderRelationGroup('Druhý rodič společných dětí', family.coParents || [])}
      ${renderRelationGroup('Sourozenci', family.siblings)}
      ${renderRelationGroup('Děti', family.children)}
      ${renderLifeContext(data, person, options)}
      ${claims.length ? `<section class="detail-section"><h3>Nálezy</h3><div class="claim-stack">${claims.map((claim) => `<article>${evidenceBadge(claim.evidence)}<p>${escapeHtml(claim.text)}</p></article>`).join('')}</div></section>` : ''}
      ${sources.length ? `<section class="detail-section"><h3>Prameny</h3><ul class="source-links">${sources.map((source) => `<li><button type="button" data-source-id="${escapeHtml(source.id)}">${escapeHtml(source.title)}</button></li>`).join('')}</ul></section>` : ''}
      ${components.feedbackForm(data, { topic: `${person.displayName}${presentation.birthYear(person) ? ` (* ${presentation.birthYear(person)})` : ''}`, context: [`Osoba: ${person.displayName}`, `ID: ${person.id}`, formatLife(person)] }).replace('<details class="feedback"', options.openFeedback ? '<details class="feedback" open' : '<details class="feedback"')}
    </div>`;
  }

  function renderTimeline(data, state = {}) {
    const filters = state.filters || {};
    const eventTypes = [...new Set(data.events.map((event) => event.type))].sort();
    const events = RKModel.filterTimelineEvents(data, filters).sort((a, b) => {
      if (!a.date && !b.date) return a.title.localeCompare(b.title, 'cs');
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date.localeCompare(b.date);
    });
    const people = new Map(data.people.map((person) => [person.id, person]));
    const places = new Map(data.places.map((place) => [place.id, place]));
    const branches = allBranches(data);
    const placeOptions = [...data.places].sort((a, b) => a.name.localeCompare(b.name, 'cs'));
    // History fills only the span of the listed family events (or the chosen years).
    const datedYears = events.map((event) => Number(String(event.date || '').slice(0, 4))).filter(Boolean);
    const fromYear = Number(filters.fromYear) || (datedYears.length ? Math.min(...datedYears) : NaN);
    const toYear = Number(filters.toYear) || (datedYears.length ? Math.max(...datedYears) : NaN);
    const historyItems = filters.history !== 'hidden' && datedYears.length && RKHistory
      ? RKHistory.eventsBetween(historyEvents(state), fromYear, toYear) : [];
    const entries = [...events.map((event) => ({ kind: 'family', key: event.date || '', event })), ...historyItems.map((event) => ({ kind: 'history', key: event.date, event }))]
      .sort((a, b) => (!a.key && !b.key ? 0 : !a.key ? 1 : !b.key ? -1 : a.key.localeCompare(b.key) || (a.kind === 'history' ? -1 : 1)));

    return `<section class="view" aria-labelledby="timeline-title">
      <div class="view-header"><div><h1 id="timeline-title">Časová osa</h1><p>${presentation.plural(events.length, 'událost', 'události', 'událostí')}${historyItems.length ? ` a ${presentation.plural(historyItems.length, 'dějinná souvislost', 'dějinné souvislosti', 'dějinných souvislostí')}` : ''}; nejisté datování je uvedeno slovně.</p></div></div>
      ${components.filterBar({ count: events.length, controls: `<label>Text/osoba<input type="search" data-filter="query" value="${escapeHtml(filters.query || '')}" placeholder="Událost nebo osoba"></label><label>Typ události<select data-filter="type"><option value="">Všechny typy</option>${eventTypes.map((type) => `<option value="${escapeHtml(type)}"${filters.type === type ? ' selected' : ''}>${escapeHtml(presentation.eventTypeLabel(type))}</option>`).join('')}</select></label><label>Jistota<select data-filter="evidence"><option value="">Všechny úrovně</option>${Object.entries(evidenceLabels).map(([value, label]) => `<option value="${value}"${filters.evidence === value ? ' selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select></label><label>Větev<select data-filter="branch"><option value="">Všechny větve</option>${branches.map((branch) => `<option value="${escapeHtml(branch)}"${filters.branch === branch ? ' selected' : ''}>${escapeHtml(branch)}</option>`).join('')}</select></label><label>Místo<select data-filter="placeId"><option value="">Všechna místa</option>${placeOptions.map((place) => `<option value="${escapeHtml(place.id)}"${filters.placeId === place.id ? ' selected' : ''}>${escapeHtml(place.name)}</option>`).join('')}</select></label><label>Od<input type="number" data-filter="fromYear" value="${escapeHtml(filters.fromYear || '')}" placeholder="rok"></label><label>Do<input type="number" data-filter="toYear" value="${escapeHtml(filters.toYear || '')}" placeholder="rok"></label><label>Dějinný kontext<select data-filter="history"><option value="">Zobrazit</option><option value="hidden"${filters.history === 'hidden' ? ' selected' : ''}>Skrýt</option></select></label>`})}
      ${filterChips(data, filters, { type: 'Typ události', evidence: 'Jistota', branch: 'Větev', placeId: 'Místo', query: 'Text', fromYear: 'Od roku', toYear: 'Do roku', history: 'Dějinný kontext', 'history:hidden': 'Skrytý' })}
      <ol class="timeline-list">${entries.map(({ kind, event }) => {
        if (kind === 'history') {
          return `<li class="timeline-history"><div class="timeline-date"><time>${escapeHtml(RKHistory.formatEventDate(event))}</time><span>Dějiny</span></div><article><h2>${escapeHtml(event.title)}</h2><p>${escapeHtml(event.summary)}</p><p class="muted">Zdroj: ${renderHistorySources(event)}</p></article></li>`;
        }
        const eventPeople = (event.personIds || []).map((id) => people.get(id)).filter(Boolean);
        const place = places.get(event.placeId);
        return `<li><div class="timeline-date"><time>${escapeHtml(event.dateText || event.date || 'Datum neznámé')}</time><span>${escapeHtml(presentation.eventTypeLabel(event.type))}</span></div><article><div class="timeline-card-head">${evidenceBadge(event.evidence)}${place ? `<span class="place-chip">${escapeHtml(place.name)}</span>` : ''}</div><h2>${escapeHtml(event.title)}</h2>${eventPeople.length ? `<div class="inline-people">${eventPeople.map((person) => `<button type="button" data-person-id="${escapeHtml(person.id)}">${escapeHtml(presentation.personChoiceLabel(person))}</button>`).join('')}</div>` : ''}<button class="detail-link" type="button" data-event-id="${escapeHtml(event.id)}">Otevřít detail →</button></article></li>`;
      }).join('')}</ol>
    </section>`;
  }

  function renderPlaceMap(data, placeSet = data.places, options = {}) {
    const { idPrefix = 'map', title = 'Mapa míst', description = 'Interaktivní mapa míst s platnými souřadnicemi.' } = options || {};
    const safeIdPrefix = String(idPrefix).replace(/[^a-zA-Z0-9_-]/g, '-') || 'map';
    const placeIds = (placeSet || []).map((place) => encodeURIComponent(place.id)).join(',');
    return `<div class="place-map" id="${safeIdPrefix}" data-map-view data-map-place-ids="${escapeHtml(placeIds)}" role="region" aria-label="${escapeHtml(title)}" aria-description="${escapeHtml(description)}" tabindex="0"></div>`;
  }

  function renderPlacesModes(mode) {
    return `<div class="places-modes" role="group" aria-label="Co ukázat na mapě">${[['all', 'Všechna místa'], ['migration', 'Stěhování rodu']].map(([value, label]) => `<button type="button" data-places-mode="${value}" aria-pressed="${mode === value}">${label}</button>`).join('')}</div>`;
  }

  function migrationStepText(generation, index, count) {
    const years = generation.fromYear ? ` · narození ${generation.fromYear === generation.toYear ? generation.fromYear : `${generation.fromYear}–${generation.toYear}`}` : '';
    return `Krok ${index + 1} z ${count}: ${generation.label}${years}`;
  }

  // Where the ancestors of one person were born and died, generation by generation.
  function renderMigration(data, state = {}) {
    const personId = RKModel.getPerson(data, state.migrationPersonId) ? state.migrationPersonId : (state.egoPersonId || data.meta?.defaultPersonId);
    const person = RKModel.getPerson(data, personId);
    const migration = person && RKMap ? RKMap.buildMigration(data, RKModel.getAncestorDepths(data, person.id)) : { generations: [], steps: [], links: [], places: [], unmapped: 0 };
    const places = new Map(data.places.map((place) => [place.id, place]));
    const placeName = (id) => places.get(id)?.name || '';
    const steps = migration.steps;
    const stepIndex = new Map(steps.map((generation, index) => [generation.depth, index]));
    const lifeLine = (entry) => [
      entry.birthYear || entry.birthPlaceId ? `* ${[entry.birthYear, placeName(entry.birthPlaceId)].filter(Boolean).join(' ')}` : '',
      entry.deathYear || entry.deathPlaceId ? `† ${[entry.deathYear, placeName(entry.deathPlaceId)].filter(Boolean).join(' ')}` : '',
    ].filter(Boolean).join(' · ') || 'místo ani rok nejsou známé';
    const intro = person ? `Kde se rodili a umírali předkové osoby ${person.displayName}. Na mapě jsou jen místa zapsaná u narození nebo úmrtí, která mají souřadnice; čára vede z místa narození rodiče do místa narození dítěte.` : '';
    return `<section class="view" aria-labelledby="places-title">
      <div class="view-header"><div><h1 id="places-title">Místa</h1><p>Stěhování rodu po generacích</p></div></div>
      ${renderPlacesModes('migration')}
      <div class="migration-controls">
        ${components.personPicker({ id: 'migration-person', attribute: 'data-migration-person', people: data.people, relationships: data.relationships, selectedId: person?.id || '', label: 'Předkové osoby', placeholder: 'Napište jméno…' })}
        ${steps.length ? `<div class="migration-steps">
          <button type="button" data-migration-nav="-1" aria-label="O generaci starší">←</button>
          <label class="migration-range">Generace<input type="range" data-migration-step min="0" max="${steps.length - 1}" step="1" value="${steps.length - 1}" aria-valuetext="${escapeHtml(migrationStepText(steps[steps.length - 1], steps.length - 1, steps.length))}"></label>
          <button type="button" data-migration-nav="1" aria-label="O generaci mladší">→</button>
          <button type="button" class="migration-play" data-migration-play aria-pressed="false">Přehrát od nejstarších</button>
        </div>
        <p class="migration-readout" data-migration-readout aria-live="polite">${escapeHtml(migrationStepText(steps[steps.length - 1], steps.length - 1, steps.length))}</p>` : ''}
      </div>
      <p class="map-note">${escapeHtml(intro)}</p>
      ${steps.length ? `<div class="map-panel">
        <ul class="migration-legend" aria-label="Vysvětlivky mapy"><li><span class="migration-legend-birth" aria-hidden="true">*</span> místo narození</li><li><span class="migration-legend-death" aria-hidden="true">†</span> místo úmrtí</li><li><span class="migration-legend-line" aria-hidden="true"></span> z místa narození rodiče k místu narození dítěte</li><li>starší generace jsou slabší</li></ul>
        ${renderMapAttribution(migration.places)}
        <div class="place-map migration-map" id="migration-map" data-migration-map data-migration-person="${escapeHtml(person.id)}" role="region" aria-label="Mapa stěhování rodu" aria-description="Místa narození a úmrtí předků po generacích. Stejné údaje jsou vypsané pod mapou." tabindex="0"></div>
      </div>` : components.emptyState('Žádná místa k zobrazení', person ? 'U této osoby ani jejích předků nejsou zapsána místa narození nebo úmrtí se souřadnicemi.' : 'Vyberte osobu.', false)}
      ${migration.generations.length ? `<div class="migration-list">${migration.generations.map((generation) => {
        const index = stepIndex.get(generation.depth);
        return `<section class="migration-generation${index === steps.length - 1 ? ' is-current' : ''}"${index === undefined ? '' : ` data-migration-generation="${index}" data-migration-label="${escapeHtml(migrationStepText(generation, index, steps.length))}"`}><h2>${escapeHtml(generation.label)}${generation.fromYear ? ` <small>narození ${generation.fromYear === generation.toYear ? generation.fromYear : `${generation.fromYear}–${generation.toYear}`}</small>` : ''}</h2><ul>${generation.people.map((entry) => `<li><button type="button" class="text-link" data-person-id="${escapeHtml(entry.id)}">${escapeHtml(entry.name)}</button> <span>${escapeHtml(lifeLine(entry))}</span></li>`).join('')}</ul>${index === undefined ? '<p class="muted">Pro tuto generaci zatím není zapsané žádné místo se souřadnicemi.</p>' : ''}</section>`;
      }).join('')}</div>` : ''}
      ${migration.unmapped ? `<p class="muted">U ${presentation.plural(migration.unmapped, 'předka', 'předků', 'předků')} chybí místo narození i úmrtí se souřadnicemi; v seznamu jsou uvedeni, na mapě ne.</p>` : ''}
    </section>`;
  }

  function renderPlaces(data, state = {}) {
    if (state.placesMode === 'migration') return renderMigration(data, state);
    const filters = state.filters || {};
    const filteredPlaces = model.filterPlaces(data, filters);
    const branches = allBranches(data);
    return `<section class="view" aria-labelledby="places-title">
      <div class="view-header"><div><h1 id="places-title">Místa</h1><p>${filteredPlaces.length} z ${data.places.length} lokalit</p></div></div>
      ${renderPlacesModes('all')}
      ${components.filterBar({ count: filteredPlaces.length, controls: `<label>Text<input type="search" data-filter="query" value="${escapeHtml(filters.query || '')}" placeholder="Obec, region nebo země"></label><label>Větev<select data-filter="branch"><option value="">Všechny větve</option>${branches.map((branch) => `<option value="${escapeHtml(branch)}"${filters.branch === branch ? ' selected' : ''}>${escapeHtml(branch)}</option>`).join('')}</select></label><label>Typ vazby<select data-filter="connectionType"><option value="">Všechny vazby</option><option value="people"${filters.connectionType === 'people' ? ' selected' : ''}>Osoby</option><option value="events"${filters.connectionType === 'events' ? ' selected' : ''}>Události</option><option value="migration"${filters.connectionType === 'migration' ? ' selected' : ''}>Doložené migrace</option></select></label>`})}
      ${filterChips(data, filters, { query: 'Text', branch: 'Větev', connectionType: 'Typ vazby', 'connectionType:people': 'Osoby', 'connectionType:events': 'Události', 'connectionType:migration': 'Doložené migrace' })}
      <div class="places-layout"><div class="map-panel"><p class="map-note">Vyberte místo na mapě nebo v přehledu míst.</p>${renderMapAttribution(filteredPlaces)}${renderPlaceMap(data, filteredPlaces, { idPrefix: 'places-map', title: 'Mapa vybraných míst', description: 'Interaktivní mapa vybraných míst.' })}</div><div class="place-directory">${filteredPlaces.map((place) => {
        const connections = RKModel.getPlaceConnections(data, place.id);
        return `<article id="place-${escapeHtml(place.id)}"><button type="button" data-place-id="${escapeHtml(place.id)}"><strong>${escapeHtml(place.name)}</strong><span>${[presentation.plural(connections.people.length, 'osoba', 'osoby', 'osob'), connections.events.length ? presentation.plural(connections.events.length, 'událost', 'události', 'událostí') : ''].filter(Boolean).join(' · ')}</span>${place.houseNumbers?.length ? `<small>čp. ${escapeHtml(place.houseNumbers.join(', '))}</small>` : ''}</button></article>`;
      }).join('')}</div></div>
    </section>`;
  }

  function renderPlaceDetail(data, placeId) {
    const connections = RKModel.getPlaceConnections(data, placeId);
    const migrations = connections.events.filter((event) => event.type === 'migration' && event.fromPlaceId && event.placeId);
    if (!connections.place) return '<div class="empty-state"><strong>Místo nenalezeno</strong></div>';
    const placeSourceIds = new Set(connections.events.flatMap((event) => event.sourceIds || []));
    const claims = data.claims.filter((claim) => (
      (claim.subjectType === 'place' && claim.subjectId === placeId)
      || (claim.sourceIds || []).some((sourceId) => placeSourceIds.has(sourceId))
    ));
    return `<article class="place-detail"><header><h2>${escapeHtml(connections.place.name)}</h2><p>${escapeHtml(connections.place.region || connections.place.country)}</p>${connections.place.houseNumbers?.length ? `<p>Známá čísla domů: <strong>${escapeHtml(connections.place.houseNumbers.join(', '))}</strong></p>` : ''}</header>${connections.people.length ? `<section><h3>Spojené osoby</h3><div class="relation-list">${connections.people.map((person) => `<button type="button" data-person-id="${escapeHtml(person.id)}">${escapeHtml(presentation.personChoiceLabel(person))}</button>`).join('')}</div></section>` : ''}${connections.events.length ? `<section><h3>Události</h3><ol class="place-events">${connections.events.map((event) => `<li><time>${escapeHtml(event.dateText || event.date || 'datum neznámé')}</time><span>${escapeHtml(event.title)}</span></li>`).join('')}</ol></section>` : ''}${migrations.length ? `<section><h3>Doložené migrační vazby</h3><ul class="migration-list">${migrations.map((event) => `<li>${escapeHtml(event.title)} · ${escapeHtml(event.dateText || event.date || 'datum neznámé')}</li>`).join('')}</ul></section>` : ''}${claims.length ? `<section><h3>Nálezy vztahující se k místu</h3><div class="claim-stack">${claims.map((claim) => `<article>${evidenceBadge(claim.evidence)}<p>${escapeHtml(claim.text)}</p></article>`).join('')}</div></section>` : ''}${components.feedbackForm(data, { topic: `místo ${connections.place.name}`, context: [`Místo: ${connections.place.name}`, `ID: ${connections.place.id}`] })}</article>`;
  }

  function renderClaims(data, state = {}) {
    const filters = state.filters || {};
    const evidence = filters.evidence || '';
    const claims = model.filterClaims(data, filters);
    const sources = new Map(data.sources.map((source) => [source.id, source]));
    const counts = Object.fromEntries(Object.keys(evidenceLabels).map((key) => [key, data.claims.filter((claim) => claim.evidence === key).length]));
    const branches = allBranches(data);
    return `<section class="view" aria-labelledby="claims-title">
      <div class="view-header"><div><h1 id="claims-title">Příběhy</h1><p>Každý příběh uvádí, zda vychází z pramene, rodinné vzpomínky, nebo zatím zůstává otevřenou možností.</p></div></div>
      <div class="evidence-summary">${Object.entries(evidenceLabels).map(([key, label]) => `<button type="button" data-evidence-filter="${key}" class="evidence-summary-${key}${evidence === key ? ' is-active' : ''}"><strong>${counts[key]}</strong><span>${escapeHtml(label)}</span></button>`).join('')}</div>
      ${components.filterBar({ count: claims.length, controls: `<label>Hledat příběh<input type="search" data-filter="query" value="${escapeHtml(filters.query || '')}" placeholder="Jméno nebo rodinná událost"></label><label>Jak dobře je doložen<select data-filter="evidence"><option value="">Všechny příběhy</option>${Object.entries(evidenceLabels).map(([value, label]) => `<option value="${value}"${evidence === value ? ' selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select></label><label>Týká se<select data-filter="subjectType"><option value="">Všech příběhů</option>${['person', 'place', 'event', 'source'].map((value) => `<option value="${value}"${filters.subjectType === value ? ' selected' : ''}>${escapeHtml(subjectLabel(value))}</option>`).join('')}</select></label><label>Rod<select data-filter="branch"><option value="">Všechny větve</option>${branches.map((branch) => `<option value="${escapeHtml(branch)}"${filters.branch === branch ? ' selected' : ''}>${escapeHtml(branch)}</option>`).join('')}</select></label><label>Související pramen<select data-filter="sourceId"><option value="">Všechny prameny</option>${data.sources.map((source) => `<option value="${escapeHtml(source.id)}"${filters.sourceId === source.id ? ' selected' : ''}>${escapeHtml(source.title)}</option>`).join('')}</select></label>`})}
      ${filterChips(data, filters, { query: 'Text', evidence: 'Jistota', subjectType: 'Typ subjektu', branch: 'Větev', sourceId: 'Pramen', 'evidence:hypothesis': 'Hypotéza / rozpor' })}
      ${claims.length ? `<div class="result-list claim-list">${claims.map((claim) => `<article class="claim-row"><div class="claim-row-main"><div>${evidenceBadge(claim.evidence)}<span class="subject-type">${escapeHtml(subjectLabel(claim.subjectType))}</span></div><h2>${escapeHtml(claim.text)}</h2><p class="claim-chain">${escapeHtml(familyEvidenceExplanation(claim.evidence))}</p></div><footer><strong>Prameny</strong>${(claim.sourceIds || []).map((id) => sources.get(id)).filter(Boolean).map((source) => `<button type="button" data-source-id="${escapeHtml(source.id)}">${escapeHtml(source.title)}</button>`).join('') || '<span class="muted">Bez pramene</span>'}</footer></article>`).join('')}</div>` : components.emptyState('Žádné příběhy neodpovídají filtrům', 'Zruš některý filtr nebo vyhledej jiný výraz.')}
    </section>`;
  }

  function renderMedia(data, state = {}) {
    const filters = state.filters || {};
    const filtered = model.filterMedia(data, filters);
    const media = filtered.filter(isImage);
    const clips = filtered.filter(isAudio).sort((a, b) => String(a.interview).localeCompare(String(b.interview)) || a.start - b.start);
    const kinds = [...new Set(data.media.map((item) => item.kind))].sort();
    const people = allPeople(data);
    const peopleById = new Map(data.people.map((person) => [person.id, person]));
    return `<section class="view" aria-labelledby="media-title"><div class="view-header"><div><h1 id="media-title">Fotografie a nahrávky</h1><p>${presentation.plural(data.media.filter(isImage).length, 'obrazový záznam', 'obrazové záznamy', 'obrazových záznamů')} a ${presentation.plural(data.media.filter(isAudio).length, 'nahrávka', 'nahrávky', 'nahrávek')} z rozhovorů.</p></div></div>${components.filterBar({ count: media.length, controls: `<label>Text<input type="search" data-filter="query" value="${escapeHtml(filters.query || '')}" placeholder="Popisek nebo soubor"></label><label>Typ<select data-filter="kind"><option value="">Všechny typy</option>${kinds.map((kind) => `<option value="${escapeHtml(kind)}"${filters.kind === kind ? ' selected' : ''}>${escapeHtml(presentation.mediaTypeLabel(kind))}</option>`).join('')}</select></label><label>Pramen<select data-filter="sourceId"><option value="">Všechny prameny</option>${data.sources.map((source) => `<option value="${escapeHtml(source.id)}"${filters.sourceId === source.id ? ' selected' : ''}>${escapeHtml(source.title)}</option>`).join('')}</select></label><label>Propojená osoba<select data-filter="personId"><option value="">Všechny osoby</option>${people.map((person) => `<option value="${escapeHtml(person.id)}"${filters.personId === person.id ? ' selected' : ''}>${escapeHtml(presentation.personChoiceLabel(person))}</option>`).join('')}</select></label>`})}${filterChips(data, filters, { query: 'Text', kind: 'Typ média', sourceId: 'Pramen', personId: 'Osoba' })}${clips.length ? `<section class="media-audio"><h2>Nahrávky z rozhovorů</h2><div class="audio-clip-list">${clips.map((clip) => renderAudioClip(clip)).join('')}</div></section>` : ''}${media.length ? `<div class="media-gallery">${media.map((item) => `<article class="media-card"><button type="button" data-media-id="${escapeHtml(item.id)}" data-source-id="${escapeHtml(item.sourceId || '')}">${item.dataUri ? `<img src="${item.dataUri}" alt="${escapeHtml(item.title)}" loading="lazy">` : '<span class="source-image-placeholder">Náhled bude vložen při sestavení</span>'}<span class="media-card-copy"><small>${escapeHtml(presentation.mediaTypeLabel(item.kind))}</small><strong>${escapeHtml(item.title)}</strong><span>${(item.personIds || []).map((id) => peopleById.get(id)?.displayName).filter(Boolean).join(', ') || 'Bez propojené osoby'}</span><em>Otevřít pramen →</em></span></button></article>`).join('')}</div>` : (clips.length ? '' : components.emptyState('Žádná média neodpovídají filtrům', 'Zruš některý filtr.'))}</section>`;
  }

  function renderGlobalSearchResults(data, query = '') {
    const result = model.globalSearch(data, query);
    if (!model.normalizeText(query)) return '<div class="global-search-results" data-search-results hidden></div>';
    const groupLabels = { people: 'Osoby', places: 'Místa', events: 'Události', claims: 'Příběhy', sources: 'Prameny', media: 'Fotografie', researchTasks: 'Výzkumné úkoly' };
    const titleFor = (type, item) => type === 'people' ? presentation.personChoiceLabel(item) : type === 'places' ? item.name : type === 'events' || type === 'claims' || type === 'sources' || type === 'media' || type === 'researchTasks' ? (item.title || item.text) : item.id;
    const actionFor = (type, item) => {
      if (type === 'people') return `data-search-open="person" data-search-id="${escapeHtml(item.id)}"`;
      if (type === 'places') return `data-search-open="place" data-search-id="${escapeHtml(item.id)}"`;
      if (type === 'sources') return `data-search-open="source" data-search-id="${escapeHtml(item.id)}"`;
      if (type === 'media') return `data-search-open="media" data-search-id="${escapeHtml(item.id)}"`;
      if (type === 'claims') return `data-search-open="claim" data-search-id="${escapeHtml(item.id)}"`;
      if (type === 'events') return `data-search-open="event" data-search-id="${escapeHtml(item.id)}"`;
      return `data-search-open="research" data-search-id="${escapeHtml(item.id)}"`;
    };
    const groups = Object.entries(result.groups).filter(([, items]) => items.length);
    return `<div class="global-search-results" data-search-results role="region" aria-label="Výsledky hledání">${groups.map(([type, items]) => `<section class="search-result-group" data-search-result-type="${escapeHtml(type)}"><h2>${escapeHtml(groupLabels[type])}<span>${items.length}</span></h2><ul>${items.slice(0, 8).map((item) => `<li><button type="button" ${actionFor(type, item)} data-search-result-id="${escapeHtml(item.id)}"><strong>${escapeHtml(titleFor(type, item))}</strong><span>${escapeHtml(item.matchReason)}</span></button></li>`).join('')}</ul></section>`).join('') || '<p class="search-no-results">Nic nenalezeno.</p>'}</div>`;
  }

  function renderSourceDetail(data, sourceId) {
    const source = data.sources.find((item) => item.id === sourceId);
    if (!source) return '<div class="empty-state"><strong>Pramen nenalezen</strong></div>';
    const media = data.media.find((item) => isImage(item) && (item.id === source.mediaId || item.sourceId === source.id));
    const clips = data.media.filter((item) => isAudio(item) && item.sourceId === source.id).sort((a, b) => a.start - b.start);
    const claims = data.claims.filter((claim) => (claim.sourceIds || []).includes(source.id));
    return `<article class="source-detail"><header><h2>${escapeHtml(source.title)}</h2><p>${escapeHtml(presentation.sourceTypeLabel(source.type))}${source.publisher ? ` · ${escapeHtml(source.publisher)}` : ''}</p></header>${media?.dataUri ? `<figure><img src="${media.dataUri}" alt="${escapeHtml(media.title)}"><figcaption>${escapeHtml(media.title)}</figcaption></figure>` : ''}${sourceReadingNote(source)}${clips.length ? `<section><h3>Nahrávky z rozhovoru</h3><div class="audio-clip-list">${clips.map((clip) => renderAudioClip(clip)).join('')}</div></section>` : ''}${claims.length ? `<section><h3>Co nám tento pramen vypráví</h3><div class="claim-stack">${claims.map((claim) => `<article>${evidenceBadge(claim.evidence)}<p>${escapeHtml(claim.text)}</p></article>`).join('')}</div></section>` : ''}${source.url ? `<a class="source-external" href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">Otevřít původní pramen ↗</a>` : ''}</article>`;
  }

  function renderSources(data, state = {}) {
    const filters = state.filters || {};
    const sources = model.filterSources(data, filters);
    const mediaBySource = new Map(data.media.filter(isImage).map((media) => [media.sourceId, media]));
    const photographic = sources.filter((source) => mediaBySource.has(source.id));
    const documentary = sources.filter((source) => !mediaBySource.has(source.id));
    const sourceTypes = [...new Set(data.sources.map((source) => source.type))].sort();
    return `<section class="view" aria-labelledby="sources-title">
      <div class="view-header"><div><h1 id="sources-title">Prameny</h1><p>${sources.length} z ${data.sources.length} pramenů, z toho ${photographic.length} s vloženou fotografií.</p></div></div>
      ${components.filterBar({ count: sources.length, controls: `<label>Hledat<input type="search" data-filter="query" value="${escapeHtml(filters.query || '')}" placeholder="Název nebo obsah pramene"></label><label>Typ pramene<select data-filter="sourceType"><option value="">Všechny typy</option>${presentation.groupTypesByLabel(sourceTypes, presentation.sourceTypeLabel).map((group) => `<option value="${escapeHtml(group.value)}"${filters.sourceType === group.value ? ' selected' : ''}>${escapeHtml(group.label)}</option>`).join('')}</select></label>`})}
      ${filterChips(data, filters, { query: 'Text', sourceType: 'Typ pramene' })}
      <div class="source-gallery">${photographic.map((source) => {
        const media = mediaBySource.get(source.id);
        return `<button class="source-card source-card-image" type="button" data-source-id="${escapeHtml(source.id)}">${media.dataUri ? `<img src="${media.dataUri}" alt="${escapeHtml(media.title)}" loading="lazy">` : '<span class="source-image-placeholder">Fotografie pramene</span>'}<span><small>${escapeHtml(presentation.sourceTypeLabel(source.type))}</small><strong>${escapeHtml(source.title)}</strong><em>${data.claims.filter((claim) => claim.sourceIds?.includes(source.id)).length} souvisejících rodinných příběhů</em></span></button>`;
      }).join('')}</div>
      <div class="document-source-list"><h2>Další prameny</h2>${documentary.map((source) => `<article><div><small>${escapeHtml(presentation.sourceTypeLabel(source.type))}</small><strong>${escapeHtml(source.title)}</strong></div><button type="button" data-source-id="${escapeHtml(source.id)}">Detail</button></article>`).join('')}</div>
    </section>`;
  }

  function renderResearch(data, state = {}) {
    const filters = state.filters || {};
    const tasks = model.filterResearchTasks(data, filters).sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title, 'cs'));
    const people = new Map(data.people.map((person) => [person.id, person]));
    const peopleOptions = allPeople(data);
    const branches = allBranches(data);
    const statusCounts = Object.fromEntries(['open', 'in-progress', 'closed'].map((status) => [status, data.researchTasks.filter((task) => task.status === status || (status === 'in-progress' && task.status === 'in_progress')).length]));
    return `<section class="view" aria-labelledby="research-title">
      <div class="view-header"><div><h1 id="research-title">Badatelská fronta</h1><p>Výzkumné úkoly v prioritizovaném seznamu; metodické poznámky zůstávají rozbalitelné.</p></div></div>
      <div class="task-summary" aria-label="Souhrn úkolů"><span><strong>${statusCounts.open}</strong> otevřených</span><span><strong>${statusCounts['in-progress']}</strong> rozpracovaných</span><span><strong>${statusCounts.closed}</strong> uzavřených</span></div>
      ${components.filterBar({ count: tasks.length, controls: `<label>Text<input type="search" data-filter="query" value="${escapeHtml(filters.query || '')}" placeholder="Otázka nebo další krok"></label><label>Stav<select data-filter="status"><option value="">Všechny stavy</option><option value="open"${filters.status === 'open' ? ' selected' : ''}>Otevřeno</option><option value="in-progress"${filters.status === 'in-progress' || filters.status === 'in_progress' ? ' selected' : ''}>Rozpracováno</option><option value="closed"${filters.status === 'closed' ? ' selected' : ''}>Uzavřeno</option></select></label><label>Priorita<select data-filter="priority"><option value="">Všechny priority</option>${[1, 2, 3].map((priority) => `<option value="${priority}"${String(filters.priority || '') === String(priority) ? ' selected' : ''}>${priority}</option>`).join('')}</select></label><label>Větev<select data-filter="branch"><option value="">Všechny větve</option>${branches.map((branch) => `<option value="${escapeHtml(branch)}"${filters.branch === branch ? ' selected' : ''}>${escapeHtml(branch)}</option>`).join('')}</select></label><label>Související osoba<select data-filter="personId"><option value="">Všechny osoby</option>${peopleOptions.map((person) => `<option value="${escapeHtml(person.id)}"${filters.personId === person.id ? ' selected' : ''}>${escapeHtml(presentation.personChoiceLabel(person))}</option>`).join('')}</select></label>`})}
      ${filterChips(data, filters, { query: 'Text', status: 'Stav', priority: 'Priorita', branch: 'Větev', personId: 'Osoba' })}
      <div class="task-list">${tasks.map((task) => `<article class="task-row" data-task-id="${escapeHtml(task.id)}"><div class="task-priority">P${escapeHtml(task.priority)}</div><div class="task-main"><div class="task-row-meta"><span class="task-status task-status-${escapeHtml(task.status)}">${escapeHtml(presentation.taskStatusLabel(task.status))}</span><span>${escapeHtml(task.branch?.join(' · ') || 'Bez určené větve')}</span></div><h2>${escapeHtml(task.title)}</h2><p><strong>Očekávaný přínos:</strong> ${escapeHtml(task.expectedPayoff)}</p><p><strong>Nejbližší krok:</strong> ${escapeHtml(task.nextAction)}</p><details><summary>Metodická poznámka</summary><p>${escapeHtml(task.notes || task.method || 'Poznámka zatím nebyla doplněna.')}</p></details>${task.personIds?.length ? `<div class="inline-people">${task.personIds.map((id) => people.get(id)).filter(Boolean).map((person) => `<button type="button" data-person-id="${escapeHtml(person.id)}">${escapeHtml(presentation.personChoiceLabel(person))}</button>`).join('')}</div>` : ''}</div></article>`).join('')}</div>
    </section>`;
  }

  function renderEventDetail(data, eventId) {
    const event = data.events.find((item) => item.id === eventId);
    if (!event) return components.emptyState('Událost nenalezena', 'Záznam byl mezitím odstraněn.', false);
    const people = (event.personIds || []).map((id) => model.getPerson(data, id)).filter(Boolean);
    const place = data.places.find((item) => item.id === event.placeId);
    return `<article class="event-detail"><header><h2>${escapeHtml(event.title)}</h2><p>Typ události: ${escapeHtml(presentation.eventTypeLabel(event.type))} · ${escapeHtml(event.dateText || event.date || 'Datum neznámé')}${place ? ` · ${escapeHtml(place.name)}` : ''}</p></header>${people.length ? `<section class="detail-section"><h3>Účastníci</h3><div class="relation-list">${people.map((person) => `<button type="button" data-person-id="${escapeHtml(person.id)}">${escapeHtml(presentation.personChoiceLabel(person))}</button>`).join('')}</div></section>` : ''}${event.evidence ? `<section class="detail-section">${evidenceBadge(event.evidence)}</section>` : ''}${event.sourceIds?.length ? `<section class="detail-section"><h3>Prameny</h3><div class="relation-list">${event.sourceIds.map((id) => data.sources.find((source) => source.id === id)).filter(Boolean).map((source) => `<button type="button" data-source-id="${escapeHtml(source.id)}">${escapeHtml(source.title)}</button>`).join('')}</div></section>` : ''}</article>`;
  }

  function renderClaimDetail(data, claimId) {
    const claim = data.claims.find((item) => item.id === claimId);
    if (!claim) return components.emptyState('Tvrzení nenalezeno', 'Záznam byl mezitím odstraněn.', false);
    const subject = claim.subjectType === 'person' ? model.getPerson(data, claim.subjectId) : data[`${claim.subjectType}s`]?.find((item) => item.id === claim.subjectId);
    const subjectTitle = subject?.displayName || subject?.name || subject?.title || claim.subjectId || 'Neurčený subjekt';
    const sources = (claim.sourceIds || []).map((id) => data.sources.find((source) => source.id === id)).filter(Boolean);
    return `<article class="claim-detail"><header><h2>${escapeHtml(claim.text)}</h2><p>${escapeHtml(subjectLabel(claim.subjectType))}: ${escapeHtml(subjectTitle)}</p></header><section class="detail-section">${evidenceBadge(claim.evidence)}<h3>Co víme</h3><p>${escapeHtml(familyEvidenceExplanation(claim.evidence))}</p></section>${sources.length ? `<section class="detail-section"><h3>Prameny</h3><div class="relation-list">${sources.map((source) => `<button type="button" data-source-id="${escapeHtml(source.id)}">${escapeHtml(source.title)}</button>`).join('')}</div></section>` : '<p class="muted">Pramen není připojen.</p>'}</article>`;
  }

  function renderMediaDetail(data, mediaId) {
    const media = data.media.find((item) => item.id === mediaId);
    if (!media) return components.emptyState('Médium nenalezeno', 'Záznam byl mezitím odstraněn.', false);
    const people = (media.personIds || []).map((id) => model.getPerson(data, id)).filter(Boolean);
    return `<article class="media-detail"><header><h2>${escapeHtml(media.title)}</h2><p>Média · ${escapeHtml(presentation.mediaTypeLabel(media.kind))}</p></header>${isAudio(media) ? renderAudioClip(media) : media.dataUri ? `<figure><img src="${media.dataUri}" alt="${escapeHtml(media.title)}"><figcaption>${escapeHtml(media.title)}</figcaption></figure>` : '<p class="source-image-placeholder">Náhled bude vložen při sestavení.</p>'}${media.sourceId ? `<p>Pramen: <button type="button" data-source-id="${escapeHtml(media.sourceId)}">Otevřít pramen</button></p>` : ''}${people.length ? `<section class="detail-section"><h3>Propojené osoby</h3><div class="relation-list">${people.map((person) => `<button type="button" data-person-id="${escapeHtml(person.id)}">${escapeHtml(presentation.personChoiceLabel(person))}</button>`).join('')}</div></section>` : ''}</article>`;
  }

  function renderResearchTaskDetail(data, taskId) {
    const task = data.researchTasks.find((item) => item.id === taskId);
    if (!task) return components.emptyState('Úkol nenalezen', 'Záznam byl mezitím odstraněn.', false);
    const people = (task.personIds || []).map((id) => model.getPerson(data, id)).filter(Boolean);
    return `<article class="research-task-detail"><header><h2>${escapeHtml(task.title)}</h2><p>${escapeHtml(presentation.taskStatusLabel(task.status))} · priorita ${escapeHtml(task.priority)}</p></header><section class="detail-section"><h3>Očekávaný přínos</h3><p>${escapeHtml(task.expectedPayoff || 'Nebyl popsán.')}</p><h3>Další krok</h3><p>${escapeHtml(task.nextAction || 'Další krok zatím nebyl doplněn.')}</p></section>${task.notes || task.method ? `<section class="detail-section"><h3>Metodická poznámka</h3><p>${escapeHtml(task.notes || task.method)}</p></section>` : ''}${people.length ? `<section class="detail-section"><h3>Související osoby</h3><div class="relation-list">${people.map((person) => `<button type="button" data-person-id="${escapeHtml(person.id)}">${escapeHtml(presentation.personChoiceLabel(person))}</button>`).join('')}</div></section>` : ''}</article>`;
  }

  function renderChangelog(data, state = {}) {
    const entries = [...data.changelog].sort((a, b) => b.date.localeCompare(a.date));
    const category = state.filters?.category || '';
    const filtered = entries.filter((entry) => !category || (entry.categories || []).includes(category));
    const categories = [...new Set(data.changelog.flatMap((entry) => entry.categories || []))].sort();
    const formatDate = (date) => date.split('-').reverse().map((part) => String(Number(part))).join('. ') + '.';
    return `<section class="view" aria-labelledby="changelog-title"><div class="view-header"><div><h1 id="changelog-title">Historie změn</h1><p>Auditní stopa: co bylo přidáno, přeřazeno nebo opraveno.</p></div></div>${components.filterBar({ count: filtered.length, controls: `<label>Typ změny<select data-filter="category"><option value="">Všechny typy</option>${categories.map((value) => `<option value="${escapeHtml(value)}"${category === value ? ' selected' : ''}>${escapeHtml(presentation.changeCategoryLabel(value))}</option>`).join('')}</select></label>`})}${filterChips(data, { category }, { category: 'Typ změny' })}<ol class="changelog-list">${filtered.map((entry) => `<li><time datetime="${escapeHtml(entry.date)}">${escapeHtml(formatDate(entry.date))}</time><article><div class="change-categories">${(entry.categories || []).map((value) => `<span>${escapeHtml(presentation.changeCategoryLabel(value))}</span>`).join('')}</div><h2>${escapeHtml(entry.title)}</h2><ul>${entry.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></article></li>`).join('')}</ol></section>`;
  }

  function renderPlaceholder(title, eyebrow, description) {
    return `<section class="view" aria-labelledby="placeholder-title"><div class="view-header"><div><h1 id="placeholder-title">${escapeHtml(title)}</h1><p>${escapeHtml(`${eyebrow}: ${description}`)}</p></div></div><div class="empty-state"><strong>Pohled se připravuje</strong><p>Datový základ už je hotový.</p></div></section>`;
  }

  function bubbleNames(people, limit = 3) {
    const shown = people.slice(0, limit).map((person) => `<button type="button" data-bubble-person="${escapeHtml(person.id)}">${escapeHtml(person.displayName)}</button>`).join('');
    return `${shown}${people.length > limit ? `<span class="muted">a ${people.length - limit} další</span>` : ''}`;
  }

  // Compact summary shown in the anchored bubble next to a tree card or map point.
  function renderPersonBubble(data, personId, options = {}) {
    const person = RKModel.getPerson(data, personId);
    if (!person) return '';
    const family = RKModel.getFamily(data, personId);
    const egoId = options.egoPersonId || data.meta?.defaultPersonId;
    const relation = relationTo(data, egoId, person);
    const note = (person.familyNotes || [])[0] || '';
    const excerpt = note.length > 200 ? `${note.slice(0, 200).replace(/\s+\S*$/, '')}…` : note;
    const partners = [...family.partners, ...(family.coParents || [])];
    const rows = [
      family.parents.length ? ['Rodiče', bubbleNames(family.parents)] : null,
      partners.length ? ['Partner', bubbleNames(partners, 2)] : null,
      family.children.length ? ['Děti', bubbleNames(family.children)] : null,
    ].filter(Boolean);
    const initials = person.displayName.split(/\s+/).filter((part) => !['roz.', 'rozená'].includes(part)).slice(0, 2).map((part) => part[0]).join('');
    return `<article class="bubble-person">
      <header class="bubble-head"><span class="person-initials" aria-hidden="true">${escapeHtml(initials)}</span><div><h2 id="entity-bubble-title">${escapeHtml(person.displayName)}</h2><p>${escapeHtml(formatLife(person))}</p>${relation && relation !== 'to jste vy' ? `<p class="bubble-relation">${escapeHtml(relation)}</p>` : ''}</div></header>
      ${excerpt ? `<p class="bubble-note">${escapeHtml(excerpt)}</p>` : ''}
      ${rows.length ? `<dl class="bubble-facts">${rows.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>` : ''}
      ${audioClipsFor(data, person.id).length ? `<div class="bubble-audio">${renderAudioClip(audioClipsFor(data, person.id)[0], { compact: true })}${audioClipsFor(data, person.id).length > 1 ? `<p class="muted">Další nahrávky (${audioClipsFor(data, person.id).length - 1}) jsou v celém profilu.</p>` : ''}</div>` : ''}
      <div class="bubble-actions"><button type="button" class="bubble-primary" data-bubble-open-person="${escapeHtml(person.id)}">Celý profil</button>${data.meta?.feedback?.email ? `<button type="button" data-bubble-feedback-person="${escapeHtml(person.id)}">Opravit / doplnit</button>` : ''}${options.inTree ? `<button type="button" data-bubble-focus-person="${escapeHtml(person.id)}">Zaměřit rodokmen</button>` : ''}</div>
    </article>`;
  }

  function renderPlaceBubble(data, placeId, options = {}) {
    const connections = RKModel.getPlaceConnections(data, placeId);
    const place = connections.place;
    if (!place) return '';
    const egoId = options.egoPersonId || data.meta?.defaultPersonId;
    const summary = [presentation.plural(connections.people.length, 'osoba', 'osoby', 'osob'), connections.events.length ? presentation.plural(connections.events.length, 'událost', 'události', 'událostí') : ''].filter(Boolean).join(' · ');
    const people = connections.people.slice(0, 6);
    return `<article class="bubble-place">
      <header class="bubble-head bubble-head-place"><div><h2 id="entity-bubble-title">${escapeHtml(place.name)}</h2><p>${escapeHtml([place.region, place.country].filter(Boolean).join(', '))}</p><p class="bubble-relation">${escapeHtml(summary)}${place.houseNumbers?.length ? ` · čp. ${escapeHtml(place.houseNumbers.join(', '))}` : ''}</p></div></header>
      ${people.length ? `<ul class="bubble-people">${people.map((person) => {
        const relation = relationTo(data, egoId, person);
        return `<li><button type="button" data-bubble-person="${escapeHtml(person.id)}"><strong>${escapeHtml(person.displayName)}</strong><span>${escapeHtml([relation, formatLife(person)].filter(Boolean).join(' · '))}</span></button></li>`;
      }).join('')}</ul>${connections.people.length > people.length ? `<p class="muted bubble-more">a ${connections.people.length - people.length} další v detailu místa</p>` : ''}` : ''}
      <div class="bubble-actions"><button type="button" class="bubble-primary" data-bubble-open-place="${escapeHtml(place.id)}">Detail místa</button></div>
    </article>`;
  }

  return {
    escapeHtml,
    evidenceBadge,
    formatLife,
    renderOverview,
    renderPlaceMap,
    renderPeople,
    renderPersonDetail,
    renderTimeline,
    renderPlaces,
    renderPlaceDetail,
    renderPersonBubble,
    renderPlaceBubble,
    renderClaims,
    renderSources,
    renderMedia,
    renderGlobalSearchResults,
    renderSourceDetail,
    renderEventDetail,
    renderClaimDetail,
    renderMediaDetail,
    renderResearchTaskDetail,
    renderResearch,
    renderChangelog,
    renderPlaceholder,
  };
});
