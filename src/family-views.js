(function registerFamilyViews(root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const load = (path, name) => (isNode ? require(path) : root[name]);
  const api = factory({
    model: load('./model.js', 'RKModel'),
    presentation: load('./presentation.js', 'RKPresentation'),
    components: load('./components.js', 'RKComponents'),
    kinship: load('./kinship.js', 'RKKinship'),
    story: load('./story.js', 'RKStory'),
    stats: load('./stats.js', 'RKStats'),
    questions: load('./questions.js', 'RKQuestions'),
  });
  if (isNode) module.exports = api;
  root.RKFamilyViews = api;
})(globalThis, function createFamilyViews(deps) {
  'use strict';

  // Family-facing sections added to the chronicle: how two people are
  // related, the life story, interview words that follow the recording.

  const { model, presentation, components, kinship, story, stats, questions } = deps;
  const escapeHtml = components.escapeHtml;
  const historyData = (options) => options.history || globalThis.RK_HISTORY || null;

  // ---------- kinship ----------
  function chainHtml(data, result, { egoId } = {}) {
    const people = new Map((data.people || []).map((person) => [person.id, person]));
    // A direct ancestor is the end of the chain, not a "common" ancestor.
    const collateral = result.relationship?.kind !== 'blood' || (result.relationship.up > 0 && result.relationship.down > 0);
    const common = new Set(collateral ? result.commonAncestorIds || [] : []);
    const partnerSteps = new Set((result.partnerSteps || []).map(([a, b]) => `${a}|${b}`));
    const items = result.path.map((id, index) => {
      const person = people.get(id);
      if (!person) return '';
      const previous = result.path[index - 1];
      const step = index === 0 ? '' : partnerSteps.has(`${previous}|${id}`) ? '<span class="kin-step kin-step-partner" aria-hidden="true">⚭</span>' : '<span class="kin-step" aria-hidden="true">→</span>';
      const couple = common.has(id) && result.commonAncestorIds.length > 1 ? result.commonAncestorIds.filter((other) => other !== id).map((other) => people.get(other)?.displayName).filter(Boolean) : [];
      return `${step}<li class="kin-person${common.has(id) ? ' is-common' : ''}${id === egoId ? ' is-ego' : ''}"><button type="button" data-person-id="${escapeHtml(id)}"><strong>${escapeHtml(person.displayName)}</strong><small>${escapeHtml(presentation.lifeYears(person))}</small>${common.has(id) ? `<em>společný předek${couple.length ? ` (s ${escapeHtml(couple.join(', '))})` : ''}</em>` : ''}</button></li>`;
    });
    return `<ol class="kin-chain" aria-label="Řetězec příbuzenství">${items.join('')}</ol>`;
  }

  function relationText(result, person) {
    const label = presentation.relationshipLabel(result.relationship, person.sex);
    return result.half ? `${label} (nevlastní – jen přes jednoho společného rodiče)` : label;
  }

  // Profile section: the chain from the chosen person ("Já jsem") to this one.
  function renderKinship(data, egoId, personId) {
    if (!egoId || egoId === personId) return '';
    const result = kinship.kinshipPath(data, egoId, personId);
    if (!result || !result.path || result.path.length < 3) return '';
    const person = model.getPerson(data, personId);
    const ego = model.getPerson(data, egoId);
    return `<section class="detail-section kin-section"><h3>Jak jsme příbuzní</h3><p><strong>${escapeHtml(person.displayName)}</strong> je pro osobu ${escapeHtml(ego.displayName)}: <strong>${escapeHtml(relationText(result, person))}</strong>.</p>${chainHtml(data, result, { egoId })}</section>`;
  }

  // Dialog: any two people.
  function renderKinshipCalculator(data, { aId = '', bId = '' } = {}) {
    const pickers = `<div class="kin-pickers">${components.personPicker({ id: 'kin-a', attribute: 'data-kinship-a', people: data.people, relationships: data.relationships, selectedId: aId, label: 'První osoba' })}${components.personPicker({ id: 'kin-b', attribute: 'data-kinship-b', people: data.people, relationships: data.relationships, selectedId: bId, label: 'Druhá osoba' })}</div>`;
    return `<div class="kin-calculator" data-kinship-calculator><h2>Jak jsou příbuzní?</h2><p>Vyber dvě osoby; kronika najde nejbližšího společného předka a ukáže cestu přes rodiče a děti.</p>${pickers}<div data-kinship-result aria-live="polite">${renderKinshipResult(data, aId, bId)}</div></div>`;
  }

  function renderKinshipResult(data, aId, bId) {
    let result = '';
    if (aId && bId) {
      const found = kinship.kinshipPath(data, aId, bId);
      const a = model.getPerson(data, aId);
      const b = model.getPerson(data, bId);
      result = !found || found.relationship.kind === 'none'
        ? `<p class="kin-result">Mezi osobami ${escapeHtml(a.displayName)} a ${escapeHtml(b.displayName)} kronika zatím nezná žádnou vazbu.</p>`
        : found.relationship.kind === 'self'
          ? '<p class="kin-result">Jde o tutéž osobu.</p>'
          : `<p class="kin-result"><strong>${escapeHtml(b.displayName)}</strong> je pro osobu ${escapeHtml(a.displayName)}: <strong>${escapeHtml(relationText(found, b))}</strong>.</p>${chainHtml(data, found, { egoId: aId })}`;
    }
    return result;
  }

  // ---------- life story ----------
  function renderStory(data, personId, options = {}) {
    const paragraphs = story.lifeStory(data, personId, { history: historyData(options) });
    if (!paragraphs.length) return '';
    return `<section class="detail-section life-story"><h3>Životní příběh</h3>${paragraphs.map((paragraph) => `<p class="life-story-${escapeHtml(paragraph.kind)}">${escapeHtml(paragraph.text)}</p>`).join('')}<p class="muted">Text skládá kronika z údajů v datech; nejisté údaje jsou tak i označené.</p></section>`;
  }

  // ---------- interview words ----------
  // Words with their time; the app highlights the current word while the
  // recording plays and a click on a word starts playback there.
  function renderClipWords(media) {
    if (!media?.words?.length) return '';
    return `<p class="clip-words" data-clip-words="${escapeHtml(media.id)}">${media.words.map(([time, word]) => `<span class="clip-word" data-word-time="${Number(time)}">${escapeHtml(word)}</span>`).join(' ')}</p>`;
  }

  // ---------- lives side by side ----------
  const yearOf = (entry) => Number(String(entry?.date || entry?.dateText || '').match(/(?<!\d)(1\d{3}|20\d{2})(?!\d)/)?.[1]) || null;
  const LIFE_MAX = 100;

  // Rows for the chosen person's direct line (scope "line") or for everybody
  // with a known birth year (scope "all"), oldest generation first.
  function lifelineRows(data, { egoId, scope = 'line', now = new Date() } = {}) {
    const currentYear = now.getFullYear();
    const people = new Map((data.people || []).map((person) => [person.id, person]));
    let entries;
    if (scope === 'all') {
      entries = (data.people || []).map((person) => ({ person, group: null }));
    } else {
      const { numberOf } = model.getAhnentafel(data, egoId);
      entries = [...numberOf].map(([id, number]) => ({ person: people.get(id), group: Math.floor(Math.log2(number)), number }));
    }
    const children = new Map();
    for (const link of data.relationships || []) if (link.type === 'parent-child') children.set(link.from, [...(children.get(link.from) || []), link.to]);
    return entries.filter((entry) => entry.person && yearOf(entry.person.birth)).map(({ person, group, number }) => {
      const born = yearOf(person.birth);
      const died = yearOf(person.death);
      let end = died;
      let endKind = 'known';
      if (!died) {
        if (currentYear - born <= LIFE_MAX && !person.death) { end = currentYear; endKind = 'living'; }
        else { end = Math.min(born + 70, currentYear); endKind = 'unknown'; }
      }
      const marriages = (data.events || []).filter((event) => event.type === 'marriage' && (event.personIds || []).includes(person.id)).map(yearOf).filter(Boolean);
      const births = (children.get(person.id) || []).map((id) => yearOf(people.get(id)?.birth)).filter(Boolean);
      return { person, group, number, born, end, endKind, marriages, births };
    }).sort((a, b) => (scope === 'all' ? a.born - b.born : b.group - a.group || a.number - b.number));
  }

  function renderLifelines(data, state = {}, options = {}) {
    const egoId = state.egoPersonId || data.meta?.defaultPersonId;
    const scope = (state.filters || {}).lives === 'all' ? 'all' : 'line';
    const rows = lifelineRows(data, { egoId, scope, now: options.now });
    if (!rows.length) return components.emptyState('Žádné životy k zobrazení', 'U osob chybí rok narození.', false);
    const first = Math.floor(Math.min(...rows.map((row) => row.born)) / 10) * 10;
    const last = Math.ceil(Math.max(...rows.map((row) => row.end)) / 10) * 10;
    const perYear = 6;
    const label = 240;
    const rowHeight = 26;
    const top = 34;
    const width = label + (last - first) * perYear + 20;
    const height = top + rows.length * rowHeight + 10;
    const x = (year) => label + (year - first) * perYear;
    const history = (options.history?.events || globalThis.RK_HISTORY?.events || [])
      .filter((event) => event.endDate && !event.placeIds && ['war', 'politics', 'economy', 'health', 'society'].includes(event.category))
      .map((event) => ({ event, from: yearOf({ date: event.date }), to: yearOf({ date: event.endDate }) }))
      .filter((item) => item.from && item.to && item.to >= first && item.from <= last);
    const decades = [];
    for (let year = first; year <= last; year += 10) decades.push(year);
    let previousGroup = null;
    const rowSvg = rows.map((row, index) => {
      const y = top + index * rowHeight;
      const groupName = row.group === 0 ? 'Zvolená osoba' : `${row.group}. generace`;
      const groupLine = scope === 'line' && row.group !== previousGroup ? `<text class="life-group" x="4" y="${y + 9}">${groupName}</text>` : '';
      previousGroup = row.group;
      const name = presentation.splitDisplayName(row.person.displayName).main;
      const years = presentation.lifeYears(row.person);
      const tooltip = `${row.person.displayName}: ${years}${row.endKind === 'unknown' ? ' (konec života neznámý, pruh je odhad)' : ''}`;
      const marks = [
        ...row.marriages.map((year) => `<circle class="life-marriage" cx="${x(year)}" cy="${y + 12.5}" r="4"><title>Sňatek ${year}</title></circle>`),
        ...row.births.map((year) => `<circle class="life-child" cx="${x(year)}" cy="${y + 12.5}" r="2.4"><title>Narození dítěte ${year}</title></circle>`),
      ].join('');
      return `<g class="life-row life-${row.endKind}" data-person-id="${escapeHtml(row.person.id)}" tabindex="0" role="button" aria-label="${escapeHtml(`${row.person.displayName}, ${years}`)}">${groupLine}<text class="life-name" x="${label - 8}" y="${y + 17}" text-anchor="end">${escapeHtml(name)}</text><rect class="life-bar" x="${x(row.born)}" y="${y + 6}" width="${Math.max(3, (row.end - row.born) * perYear)}" height="13" rx="6"><title>${escapeHtml(tooltip)}</title></rect>${marks}</g>`;
    }).join('');
    const bands = history.map(({ event, from, to }) => {
      const start = Math.max(from, first);
      const span = Math.max(2, (Math.min(to, last) - start + 1) * perYear);
      const title = event.title.length > 24 ? `${event.title.slice(0, 22)}…` : event.title;
      return `<g class="life-history"><rect x="${x(start)}" y="${top - 6}" width="${span}" height="${height - top}"><title>${escapeHtml(`${event.title} (${from}–${to})`)}</title></rect><text x="${x(start) + 3}" y="${top - 10}">${escapeHtml(title)}</text></g>`;
    }).join('');
    const axis = decades.map((year) => `<g class="life-axis"><line x1="${x(year)}" x2="${x(year)}" y1="${top - 4}" y2="${height}"/><text x="${x(year)}" y="${height - 1}" text-anchor="middle">${year % 50 === 0 ? year : ''}</text></g>`).join('');
    return `<div class="lifelines" data-lifelines>
      <div class="lifelines-legend"><span><i class="legend-bar"></i> doložený život</span><span><i class="legend-bar legend-living"></i> bez záznamu o úmrtí (do 100 let)</span><span><i class="legend-bar legend-unknown"></i> konec neznámý (odhad)</span><span><i class="legend-dot legend-marriage"></i> sňatek</span><span><i class="legend-dot legend-child"></i> narození dítěte</span></div>
      <div class="lifelines-scroll"><svg class="lifelines-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Životy po generacích na časové ose">${bands}${axis}${rowSvg}</svg></div>
    </div>`;
  }

  // ---------- the family in numbers ----------
  function figure(value, n, unit = '') {
    return value === null ? '<span class="muted">–</span>' : `${String(value).replace('.', ',')}${unit}<small> (n = ${n})</small>`;
  }

  function renderStats(data) {
    const result = stats.computeStats(data);
    const bands = result.bands.filter((band) => band.people >= 2);
    if (!bands.length) return '';
    const rows = bands.map((band) => {
      const deaths = band.childDeaths.count ? `${band.childDeaths.count} z ${band.childDeaths.of}` : '<span class="muted">–</span>';
      const jobs = band.occupations.length ? escapeHtml(band.occupations.map(([name]) => name).join(', ')) : '<span class="muted">–</span>';
      return `<tr><th scope="row">${escapeHtml(band.label)}</th><td>${band.people}</td><td>${figure(band.lifespan.average, band.lifespan.n, ' let')}</td><td>${figure(band.marriageAge.male.average, band.marriageAge.male.n)}</td><td>${figure(band.marriageAge.female.average, band.marriageAge.female.n)}</td><td>${figure(band.children.average, band.children.n)}</td><td>${deaths}</td><td>${jobs}</td></tr>`;
    }).join('');
    return `<section class="overview-stats" aria-labelledby="overview-stats-heading"><header class="overview-section-heading"><h2 id="overview-stats-heading">Rod v číslech</h2></header>
      <p class="muted">Podle roku narození, po 25 letech. Čísla vycházejí jen z osob, u kterých kronika údaj zná (n); u starších generací jde o malé vzorky.</p>
      <div class="stats-scroll"><table class="stats-table"><thead><tr><th scope="col">Narození</th><th scope="col">Osob</th><th scope="col">Délka života</th><th scope="col">Věk při 1. sňatku – muži</th><th scope="col">– ženy</th><th scope="col">Dětí na rodiče</th><th scope="col">Zemřeli do 5 let</th><th scope="col">Nejčastější povolání</th></tr></thead><tbody>${rows}</tbody></table></div>
    </section>`;
  }

  // ---------- film caption ----------
  const KIND_TITLES = { birth: 'Narození', move: 'Stěhování', death: 'Úmrtí' };

  // Moments of (year - step, year] and the history of those years.
  function filmCaption(data, film, year, step = 5, history = globalThis.RK_HISTORY) {
    const from = year - step;
    const moments = (film.moments || []).filter((moment) => moment.year > from && moment.year <= year);
    const placeName = (id) => (data.places || []).find((place) => place.id === id)?.name || '';
    const filmPlaces = new Set((film.places || []).map((place) => place.id));
    const historyItems = (history?.events || []).filter((event) => {
      const start = yearOf({ date: event.date });
      const end = yearOf({ date: event.endDate || event.date });
      if (!start || start > year || end <= from) return false;
      return !event.placeIds || event.placeIds.some((id) => filmPlaces.has(id));
    }).slice(0, 3);
    const groups = Object.keys(KIND_TITLES).map((kind) => [kind, moments.filter((moment) => moment.kind === kind)]).filter(([, list]) => list.length);
    const range = `${from + 1}–${year}`;
    const spoken = [`Roky ${from + 1} až ${year}.`];
    for (const [kind, list] of groups) spoken.push(`${KIND_TITLES[kind]}: ${list.map((moment) => moment.name).join(', ')}.`);
    for (const event of historyItems) spoken.push(`${event.title}.`);
    if (spoken.length === 1) spoken.push('V kronice z těchto let nic zapsáno není.');
    const html = `<h2>${escapeHtml(range)}</h2>${groups.length ? groups.map(([kind, list]) => `<p><strong>${escapeHtml(KIND_TITLES[kind])}:</strong> ${list.map((moment) => `<button type="button" class="text-link" data-person-id="${escapeHtml(moment.personId)}">${escapeHtml(moment.name)}</button> <span class="muted">(${moment.year}, ${escapeHtml(placeName(moment.placeId))})</span>`).join(', ')}</p>`).join('') : '<p class="muted">V kronice z těchto let nic zapsáno není.</p>'}${historyItems.length ? `<p class="film-history"><strong>Doba:</strong> ${historyItems.map((event) => escapeHtml(event.title)).join(' · ')}</p>` : ''}`;
    return { html, text: spoken.join(' ') };
  }

  // ---------- regions on photos and notebook pages ----------
  const EVIDENCE_WORDS = { verified: 'ověřeno', supported: 'podpořeno prameny', 'family-record': 'podle rodinného vyprávění', hypothesis: 'odhad' };

  function mediaDating(media) {
    if (!media?.dateText && !media?.date) return '';
    const how = EVIDENCE_WORDS[media.dateEvidence] || '';
    return `<p class="media-dating"><strong>Datace:</strong> ${escapeHtml(media.dateText || media.date)}${how ? ` (${escapeHtml(how)})` : ''}${media.dateReasoning ? ` – ${escapeHtml(media.dateReasoning)}` : ''}</p>`;
  }

  // The image with switchable frames: named people link to their profile,
  // an unknown face asks the family "Kdo to je?".
  function renderMediaFigure(data, media) {
    if (!media?.dataUri) return '';
    const regions = media.regions || [];
    const people = new Map((data.people || []).map((person) => [person.id, person]));
    const frames = regions.map((region) => {
      const person = people.get(region.personId);
      const style = `left:${region.x * 100}%;top:${region.y * 100}%;width:${region.w * 100}%;height:${region.h * 100}%`;
      const label = person ? person.displayName : region.label || 'neznámá osoba';
      if (person) return `<button type="button" class="media-region media-region-${escapeHtml(region.kind)}" style="${style}" data-person-id="${escapeHtml(person.id)}" aria-label="${escapeHtml(`${label} – otevřít profil`)}"><span>${escapeHtml(label)}</span></button>`;
      return `<button type="button" class="media-region media-region-unknown" style="${style}" data-region-unknown="${escapeHtml(region.id)}" aria-label="Kdo to je? Napsat správci kroniky"><span>Kdo to je?</span></button>`;
    }).join('');
    return `<figure class="media-figure${regions.length ? ' has-regions' : ''}" data-media-figure="${escapeHtml(media.id)}"><div class="media-figure-frame"><img src="${media.dataUri}" alt="${escapeHtml(media.title)}">${frames}</div><figcaption>${escapeHtml(media.title)}${regions.length ? ` <label class="media-region-toggle"><input type="checkbox" data-region-toggle checked> ukázat označené osoby (${regions.length})</label>` : ''}</figcaption></figure>${mediaDating(media)}`;
  }

  // Profile section: cut-outs of the person from photos and notebook pages,
  // ordered by the date of the picture.
  function renderPersonPhotos(data, personId) {
    const items = (data.media || []).flatMap((media) => (media.regions || []).filter((region) => region.personId === personId && media.dataUri).map((region) => ({ media, region })));
    if (!items.length) return '';
    items.sort((a, b) => String(a.media.date || '9999').localeCompare(String(b.media.date || '9999')));
    return `<section class="detail-section person-photos"><h3>Na fotografiích a v sešitech</h3><ul class="region-thumbs">${items.map(({ media, region }) => `<li><button type="button" data-media-id="${escapeHtml(media.id)}"><canvas class="region-thumb" width="132" height="132" data-region-thumb data-media-ref="${escapeHtml(media.id)}" data-x="${region.x}" data-y="${region.y}" data-w="${region.w}" data-h="${region.h}" aria-hidden="true"></canvas><span>${escapeHtml(media.title)}</span>${media.dateText || media.date ? `<small>${escapeHtml(media.dateText || media.date)}</small>` : ''}<em>${region.kind === 'text' ? 'zápis' : 'fotografie'}</em></button></li>`).join('')}</ul></section>`;
  }

  // Draws the cut-outs once the images are decoded (browser only).
  function drawRegionThumbs(root, data) {
    if (typeof Image === 'undefined') return;
    for (const canvas of root.querySelectorAll('[data-region-thumb]')) {
      const media = (data.media || []).find((item) => item.id === canvas.dataset.mediaRef);
      if (!media?.dataUri || !canvas.getContext) continue;
      const image = new Image();
      image.onload = () => {
        const [x, y, w, h] = ['x', 'y', 'w', 'h'].map((key) => Number(canvas.dataset[key]));
        const sourceWidth = w * image.naturalWidth;
        const sourceHeight = h * image.naturalHeight;
        canvas.height = Math.max(40, Math.round(canvas.width * (sourceHeight / sourceWidth)));
        canvas.getContext('2d').drawImage(image, x * image.naturalWidth, y * image.naturalHeight, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
      };
      image.src = media.dataUri;
    }
  }

  // ---------- questions for relatives ----------
  // Profile section: what the chronicle would like to know about this person
  // and their parents; each question pre-fills the feedback form.
  function renderQuestions(data, personId) {
    if (!data.meta?.feedback?.email || !questions) return '';
    const parents = new Set((data.relationships || []).filter((link) => link.type === 'parent-child' && link.to === personId).map((link) => link.from));
    const list = questions.questionsFor(data, personId).filter((question) => question.personId === personId || parents.has(question.personId)).slice(0, 6);
    if (!list.length) return '';
    return `<section class="detail-section questions"><h3>Víte něco víc?</h3><p class="muted">Na tohle kronika zatím odpověď nezná. Pokud něco víte, napište – stačí i útržek vzpomínky.</p><ul class="question-list">${list.map((question) => `<li><span>${escapeHtml(question.text)}</span><button type="button" class="text-link" data-question-answer="${escapeHtml(question.text)}">Odpovědět</button></li>`).join('')}</ul></section>`;
  }

  // ---------- what is new since the last edition ----------
  function renderWhatsNew(data) {
    const changes = data.editionChanges;
    if (!changes || changes.empty) return '';
    const people = new Map((data.people || []).map((person) => [person.id, person]));
    const sinceDate = changes.sinceDate ? changes.sinceDate.split('-').reverse().map(Number).join('. ') : '';
    const blocks = [];
    if (changes.newPeople.length) blocks.push(`<li><strong>${escapeHtml(presentation.plural(changes.newPeople.length, 'nová osoba', 'nové osoby', 'nových osob'))}:</strong> ${changes.newPeople.slice(0, 12).map((person) => `<button type="button" class="text-link" data-person-id="${escapeHtml(person.id)}">${escapeHtml(person.displayName)}</button>`).join(', ')}${changes.newPeople.length > 12 ? ' a další' : ''}</li>`);
    if (changes.strengthened.length) blocks.push(`<li><strong>${escapeHtml(presentation.plural(changes.strengthened.length, 'vazba je', 'vazby jsou', 'vazeb je'))} teď jistější:</strong> ${changes.strengthened.slice(0, 8).map((link) => `${escapeHtml(people.get(link.from)?.displayName || link.from)} → <button type="button" class="text-link" data-person-id="${escapeHtml(link.to)}">${escapeHtml(people.get(link.to)?.displayName || link.to)}</button>`).join('; ')}</li>`);
    if (changes.newlyVerified.length) blocks.push(`<li><strong>${escapeHtml(presentation.plural(changes.newlyVerified.length, 'nově ověřený údaj', 'nově ověřené údaje', 'nově ověřených údajů'))}</strong>${changes.newlyVerified.slice(0, 3).map((claim) => `<br><span class="muted">${escapeHtml(claim.text.slice(0, 140))}</span>`).join('')}</li>`);
    if (changes.newMedia.length) blocks.push(`<li><strong>${escapeHtml(presentation.plural(changes.newMedia.length, 'nová fotografie nebo nahrávka', 'nové fotografie a nahrávky', 'nových fotografií a nahrávek'))}:</strong> ${changes.newMedia.slice(0, 6).map((media) => `<button type="button" class="text-link" data-media-id="${escapeHtml(media.id)}">${escapeHtml(media.title)}</button>`).join(', ')}</li>`);
    if (changes.newPlaces.length) blocks.push(`<li><strong>${escapeHtml(presentation.plural(changes.newPlaces.length, 'nové místo', 'nová místa', 'nových míst'))}:</strong> ${changes.newPlaces.map((place) => `<button type="button" class="text-link" data-place-id="${escapeHtml(place.id)}">${escapeHtml(place.name)}</button>`).join(', ')}</li>`);
    if (changes.newSourceCount) blocks.push(`<li><strong>${escapeHtml(presentation.plural(changes.newSourceCount, 'nový pramen', 'nové prameny', 'nových pramenů'))}</strong></li>`);
    return `<section class="overview-news" aria-labelledby="overview-news-heading"><header class="overview-section-heading"><h2 id="overview-news-heading">Co je nového od vydání ${escapeHtml(changes.sinceVersion)}${sinceDate ? ` (${escapeHtml(sinceDate)})` : ''}</h2></header><ul class="news-list">${blocks.join('')}</ul></section>`;
  }

  // ---------- historical gazetteer and houses ----------
  const LANG_NAMES = { de: 'německy', la: 'latinsky', cs: 'česky' };
  const JURISDICTION_LABELS = { parish: 'farnost', estate: 'panství', 'judicial-district': 'soudní okres', 'political-district': 'politický okres', region: 'kraj' };
  const span = (entry) => (entry.from || entry.to ? ` (${entry.from || '…'}–${entry.to || '…'})` : '');

  // Who lived or was recorded in which house: house numbers from the place,
  // "č. 12" / "čp. 12" in event places, residences and birth places.
  function houseHistory(data, place) {
    const houses = new Map((place.houseNumbers || []).map((number) => [String(number), []]));
    const numberIn = (text) => String(text || '').match(/č(?:p|\.\s*p)?\.?\s*(\d+[a-z]?)/i)?.[1] || null;
    const mentionsPlace = (text) => String(text || '').toLocaleLowerCase('cs').includes(place.name.toLocaleLowerCase('cs').split(' ')[0]);
    const add = (number, entry) => {
      if (!number) return;
      if (!houses.has(number)) houses.set(number, []);
      houses.get(number).push(entry);
    };
    for (const event of data.events || []) {
      if (event.placeId !== place.id && !mentionsPlace(event.placeText)) continue;
      add(numberIn(event.placeText), { year: yearOf(event), text: event.title, personIds: (event.personIds || []).slice(0, 1) });
    }
    for (const person of data.people || []) {
      for (const residence of person.residences || []) if (mentionsPlace(residence)) add(numberIn(residence), { year: null, text: `bydliště: ${person.displayName}`, personIds: [person.id] });
      if (person.birth?.placeId === place.id || mentionsPlace(person.birth?.placeText)) add(numberIn(person.birth?.placeText), { year: yearOf(person.birth), text: `narození: ${person.displayName}`, personIds: [person.id] });
    }
    return [...houses.entries()]
      .map(([number, entries]) => [number, entries.sort((a, b) => (a.year || 9999) - (b.year || 9999))
        .filter((entry, index, all) => all.findIndex((other) => other.text === entry.text) === index)])
      .sort((a, b) => Number.parseInt(a[0], 10) - Number.parseInt(b[0], 10));
  }

  function renderPlaceHistory(data, place) {
    const historical = place.historical;
    const parts = [];
    const period = (entry) => (entry.from || entry.to ? `${entry.from || '…'}–${entry.to || '…'}` : '');
    if (historical?.historicalNames?.length) {
      parts.push(`<p><strong>Historické názvy:</strong> ${historical.historicalNames.map((entry) => {
        const note = [LANG_NAMES[entry.lang] || entry.lang, period(entry)].filter(Boolean).join(', ');
        return `${escapeHtml(entry.name)}${note ? ` <span class="muted">(${escapeHtml(note)})</span>` : ''}`;
      }).join(', ')}</p>`);
    }
    if (historical?.jurisdictions?.length) {
      parts.push(`<p><strong>Příslušnost:</strong> ${historical.jurisdictions.map((entry) => {
        const label = JURISDICTION_LABELS[entry.type] || entry.type;
        // "statek Klečůvka", "okres Polička" already say what they are.
        const named = /^(?:panství|statek|velkostatek|farnost|fara|kraj|okres|soudní|politický|děkanství)\b/i.test(entry.name);
        const name = named || entry.name.toLocaleLowerCase('cs').startsWith(label.split(' ').pop()) ? entry.name : `${label} ${entry.name}`;
        return `${escapeHtml(name)}${escapeHtml(span(entry))}`;
      }).join('; ')}</p>`);
    }
    if (historical?.links?.length) parts.push(`<ul class="place-links">${historical.links.map((link) => `<li><a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.title)} ↗</a></li>`).join('')}</ul>`);
    if (historical?.sources?.length) parts.push(`<p class="muted">Zdroje: ${historical.sources.map((source) => `<a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.title)}</a>`).join(', ')}</p>`);
    const houses = houseHistory(data, place).filter(([, entries]) => entries.length);
    const people = new Map((data.people || []).map((person) => [person.id, person]));
    if (houses.length) {
      parts.push(`<h3>Domy</h3><dl class="house-list">${houses.map(([number, entries]) => `<div><dt>č. ${escapeHtml(number)}</dt><dd><ul>${entries.map((entry) => `<li>${entry.year ? `<time>${entry.year}</time> ` : ''}${entry.personIds[0] && people.has(entry.personIds[0]) ? `<button type="button" class="text-link" data-person-id="${escapeHtml(entry.personIds[0])}">${escapeHtml(entry.text)}</button>` : escapeHtml(entry.text)}</li>`).join('')}</ul></dd></div>`).join('')}</dl>`);
    }
    return parts.length ? `<section class="place-history"><h3>Z historie místa</h3>${parts.join('')}</section>` : '';
  }

  return { renderPlaceHistory, houseHistory, renderQuestions, renderWhatsNew, renderMediaFigure, renderPersonPhotos, drawRegionThumbs, mediaDating, filmCaption, renderLifelines, lifelineRows, renderStats, renderKinship, renderKinshipCalculator, renderKinshipResult, renderStory, renderClipWords, chainHtml };
});
