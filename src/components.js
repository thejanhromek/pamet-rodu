(function registerComponents(root, factory) {
  const model = typeof module === 'object' && module.exports ? require('./model.js') : root.RKModel;
  const presentation = typeof module === 'object' && module.exports ? require('./presentation.js') : root.RKPresentation;
  const api = factory(model, presentation);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.RKComponents = api;
})(globalThis, function createComponents(RKModel, RKPresentation) {
  'use strict';
  function escapeHtml(value = '') {
    return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  }
  function evidenceSummary(summary = {}) {
    const counts = summary.counts || {};
    const entries = Object.entries(RKPresentation.evidenceLabels);
    const sourceCount = Number(summary.uniqueSourceCount || 0);
    const totalClaims = Number(summary.totalClaims || Object.values(counts).reduce((sum, value) => sum + Number(value || 0), 0));
    return `<div class="evidence-summary" data-evidence-summary aria-label="${totalClaims} tvrzení a ${sourceCount} pramenů">${entries.filter(([state]) => Number(counts[state] || 0) > 0).map(([state, label]) => `<span class="evidence-summary-item evidence-${escapeHtml(state)}" data-evidence-state="${escapeHtml(state)}"><strong>${Number(counts[state] || 0)}</strong><span>${escapeHtml(label)}</span></span>`).join('')}<span class="evidence-summary-item evidence-summary-sources" aria-label="${sourceCount} pramen${sourceCount === 1 ? '' : 'ů'}"><strong>${sourceCount}</strong><span>${sourceCount === 1 ? 'pramen' : 'pramenů'}</span></span></div>`;
  }
  function sectionHeader(title, description = '', count = null, action = '') {
    return `<header class="section-header"><div><h1>${escapeHtml(title)}</h1>${description ? `<p>${escapeHtml(description)}</p>` : ''}</div>${count === null && !action ? '' : `<div class="section-header-meta">${count === null ? '' : `<span>${escapeHtml(count)} výsledků</span>`}${action}</div>`}</header>`;
  }
  function filterBar({ controls = '', count = null, reset = true, label = 'Filtry' } = {}) {
    return `<div class="filter-bar" data-filter-bar aria-label="${escapeHtml(label)}">${controls}${count === null ? '' : `<span class="filter-result-count">${escapeHtml(count)} výsledků</span>`}${reset ? '<button type="button" class="filter-reset" data-reset-filters>Zrušit filtry</button>' : ''}</div>`;
  }
  function activeFilterChips(filters = {}, labels = {}) {
    const entries = Object.entries(filters).filter(([, value]) => value !== '' && value !== null && value !== undefined);
    if (!entries.length) return '';
    return `<div class="active-filter-chips" aria-label="Aktivní filtry">${entries.map(([key, value]) => {
      const label = labels[key] || key;
      const valueLabel = labels[`${key}:${value}`] || value;
      return `<button type="button" class="active-filter-chip" data-clear-filter="${escapeHtml(key)}"><span>${escapeHtml(label)}: ${escapeHtml(valueLabel)}</span><span aria-hidden="true">×</span></button>`;
    }).join('')}</div>`;
  }
  function emptyState(title, description = '', reset = true) {
    return `<div class="empty-state" role="status"><strong>${escapeHtml(title)}</strong>${description ? `<p>${escapeHtml(description)}</p>` : ''}${reset ? '<button type="button" data-reset-filters>Zrušit filtry</button>' : ''}</div>`;
  }
  function entityLink(type, id, label, action = 'detail') {
    return `<button type="button" class="entity-link" data-entity-type="${escapeHtml(type)}" data-entity-id="${escapeHtml(id)}" data-entity-action="${escapeHtml(action)}">${escapeHtml(label)}</button>`;
  }
  // Family members send corrections and memories by e-mail; the page stays
  // offline and only prepares the message (mailto, Gmail, or copy and paste).
  const FEEDBACK_KINDS = [['doplneni', 'Doplnění'], ['oprava', 'Oprava chyby'], ['vzpominka', 'Vzpomínka'], ['fotka', 'Kdo je na fotografii']];

  function feedbackForm(data, { topic = 'Kronika', context = [], subject = '', kind = 'doplneni' } = {}) {
    const email = data?.meta?.feedback?.email;
    if (!email) return '';
    return `<details class="feedback" data-feedback data-feedback-topic="${escapeHtml(topic)}" data-feedback-context="${escapeHtml(context.filter(Boolean).join('\n'))}" data-feedback-email="${escapeHtml(email)}"${subject ? ` data-feedback-subject="${escapeHtml(subject)}"` : ''}>
      <summary>Navrhnout opravu nebo doplnit vzpomínku</summary>
      <p>Víte něco, co v kronice chybí, nebo je tu chyba? Napište to sem. Zpráva se připraví do e-mailu pro správce kroniky (<strong>${escapeHtml(email)}</strong>); odešlete ji až vy.</p>
      <label>Druh zprávy<select data-feedback-kind>${FEEDBACK_KINDS.map(([value, label]) => `<option value="${value}"${value === kind ? ' selected' : ''}>${label}</option>`).join('')}</select></label>
      <label>Vaše zpráva<textarea data-feedback-text rows="5" placeholder="Například: Babička se narodila v sousední obci, ne ve městě. Vím to od své maminky."></textarea></label>
      <label>Vaše jméno<input data-feedback-name type="text" autocomplete="name" placeholder="Aby správce věděl, od koho zpráva je"></label>
      <div class="feedback-actions"><button type="button" class="feedback-primary" data-feedback-send="mailto">Otevřít v e-mailu</button><button type="button" data-feedback-send="gmail">Otevřít v Gmailu</button><button type="button" data-feedback-send="copy">Zkopírovat zprávu</button></div>
      <p class="feedback-status muted" data-feedback-status role="status"></p>
    </details>`;
  }
  // The last line is a short machine-readable block that
  // scripts/import-suggestions.mjs uses to file the message.
  function feedbackMessage({ topic = 'Kronika', context = '', text = '', name = '', edition = '', kind = '', subject: about = '', date = new Date() } = {}) {
    const subject = `Rodová kronika – ${topic}`;
    const block = JSON.stringify({ k: kind || 'doplneni', ...(about ? { s: about } : {}), d: date.toISOString().slice(0, 10) });
    const body = [
      text.trim() || '(sem napište opravu nebo vzpomínku)',
      '',
      name.trim() ? `Od: ${name.trim()}` : 'Od: (vaše jméno)',
      '',
      '— Údaje pro správce kroniky —',
      context,
      edition ? `Vydání: ${edition}` : '',
      `[RK-NAVRH v1 ${block}]`,
    ].filter((line, index, lines) => line !== '' || lines[index - 1] !== '').join('\n').trim();
    return { subject, body };
  }

  // Reads one prepared message back: text, sender and the block.
  function parseFeedbackMessage(raw = '') {
    const body = String(raw).replace(/\r\n/g, '\n');
    const blockMatch = body.match(/\[RK-NAVRH v1 (\{[^\]\n]*\})\]/);
    if (!blockMatch) return null;
    let block;
    try { block = JSON.parse(blockMatch[1]); } catch (_) { return null; }
    const subjectLine = body.match(/^(?:Předmět|Subject):\s*(.+)$/m)?.[1]?.trim() || '';
    const start = body.search(/^(?!Komu:|Předmět:|Subject:|To:|From:|Date:)/m);
    const content = body.slice(Math.max(0, start)).split(/\n\nOd: /)[0].replace(/^\s*\n/, '').trim();
    const name = body.match(/^Od: (.+)$/m)?.[1]?.trim() || '';
    return {
      kind: block.k || 'doplneni',
      subject: block.s || '',
      date: block.d || '',
      text: content === '(sem napište opravu nebo vzpomínku)' ? '' : content,
      name: name === '(vaše jméno)' ? '' : name,
      topic: subjectLine.replace(/^Rodová kronika – /, ''),
    };
  }
  function feedbackLinks(email, message) {
    const query = (pairs) => pairs.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&');
    return {
      mailto: `mailto:${encodeURIComponent(email).replace('%40', '@')}?${query([['subject', message.subject], ['body', message.body]])}`,
      gmail: `https://mail.google.com/mail/?${query([['view', 'cm'], ['fs', '1'], ['to', email], ['su', message.subject], ['body', message.body]])}`,
      copy: `Komu: ${email}\nPředmět: ${message.subject}\n\n${message.body}`,
    };
  }
  // Unique, human-readable label per person for the searchable picker.
  function personPickerLabels(people = [], relationships = []) {
    const names = new Map(people.map((person) => [person.id, person.displayName]));
    const context = (person) => {
      const parent = relationships.find((link) => link.type === 'parent-child' && link.to === person.id && names.has(link.from));
      if (parent) return `rodič: ${names.get(parent.from)}`;
      const partner = relationships.find((link) => link.type === 'spouse' && (link.from === person.id || link.to === person.id));
      const partnerId = partner && (partner.from === person.id ? partner.to : partner.from);
      return names.has(partnerId) ? `partner: ${names.get(partnerId)}` : person.id;
    };
    const base = people.map((person) => RKPresentation.personChoiceLabel(person));
    const counts = base.reduce((map, label) => map.set(label, (map.get(label) || 0) + 1), new Map());
    const labels = people.map((person, index) => counts.get(base[index]) > 1 ? `${base[index]} · ${context(person)}` : base[index]);
    const finalCounts = labels.reduce((map, label) => map.set(label, (map.get(label) || 0) + 1), new Map());
    return new Map(people.map((person, index) => [person.id, finalCounts.get(labels[index]) > 1 ? `${labels[index]} · ${person.id}` : labels[index]]));
  }
  function personPicker({ id, attribute, people = [], relationships = [], selectedId = '', label = 'Osoba', placeholder = 'Začněte psát jméno…' }) {
    const labels = personPickerLabels(people, relationships);
    const sorted = [...people].sort((a, b) => a.displayName.localeCompare(b.displayName, 'cs'));
    return `<label class="person-picker">${escapeHtml(label)}<input type="search" ${attribute} data-person-picker list="${escapeHtml(id)}-options" value="${escapeHtml(labels.get(selectedId) || '')}" placeholder="${escapeHtml(placeholder)}" autocomplete="off" spellcheck="false"><datalist id="${escapeHtml(id)}-options">${sorted.map((person) => `<option value="${escapeHtml(labels.get(person.id))}"></option>`).join('')}</datalist></label>`;
  }
  function resolvePersonPick(people = [], text = '', relationships = []) {
    const wanted = String(text).trim();
    if (!wanted) return null;
    for (const [personId, label] of personPickerLabels(people, relationships)) if (label === wanted) return personId;
    const byName = people.filter((person) => person.displayName === wanted);
    return byName.length === 1 ? byName[0].id : null;
  }
  const MARK_ICONS = {
    photo: '<path d="M2 4.5h2.2L5.4 3h3.2l1.2 1.5H12v6.5H2z"/><circle cx="7" cy="7.6" r="1.9"/>',
    audio: '<path d="M2.5 5.5h2L7.5 3v8l-3-2.5h-2z"/><path d="M9.3 5.2a2.6 2.6 0 0 1 0 3.6M10.8 3.8a4.6 4.6 0 0 1 0 6.4"/>',
    memory: '<path d="M2.5 3h9v6.2H6.4L3.8 11.2V9.2H2.5z"/>',
  };

  function renderMarks(marks = []) {
    if (!marks.length) return '';
    return `<span class="tree-node-marks">${marks.map((mark) => `<svg class="tree-mark tree-mark-${mark.kind}" viewBox="0 0 14 14" width="14" height="14" aria-hidden="true" focusable="false"><title>${escapeHtml(mark.label)}</title>${MARK_ICONS[mark.kind] || ''}</svg>`).join('')}</span>`;
  }

  // Shared card body for both tree modes: the maiden name gets its own line
  // instead of being cut off; marks tell what the profile holds.
  function cardBody(person, { number = null, role = '', marks = [] } = {}) {
    const name = RKPresentation.splitDisplayName(person.displayName || person.id);
    return `<span class="tree-node-head">${number ? `<span class="tree-node-number" aria-hidden="true">${number}</span>` : ''}<span class="tree-node-name">${escapeHtml(name.main)}</span></span>${name.extra ? `<span class="tree-node-extra">${escapeHtml(name.extra)}</span>` : ''}<span class="tree-node-meta"><small class="tree-node-dates">${escapeHtml(RKPresentation.lifeYears(person))}</small>${role ? `<em class="tree-node-role">${escapeHtml(role)}</em>` : ''}${renderMarks(marks)}</span>`;
  }

  function cardLabel(person, { number = null, role = '', marks = [] } = {}) {
    return [number ? `číslo ${number}` : '', role, person.displayName, RKPresentation.lifeYears(person), marks.map((mark) => mark.label).join(', ')].filter(Boolean).join(' · ');
  }

  return { escapeHtml, cardBody, cardLabel, renderMarks, evidenceSummary, sectionHeader, filterBar, activeFilterChips, emptyState, entityLink, feedbackForm, feedbackMessage, parseFeedbackMessage, feedbackLinks, personPicker, personPickerLabels, resolvePersonPick, FEEDBACK_KINDS };
});
