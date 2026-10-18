(function registerStory(root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const load = (path, name) => (isNode ? require(path) : root[name]);
  const api = factory(load('./model.js', 'RKModel'), load('./presentation.js', 'RKPresentation'), load('./history.js', 'RKHistory'));
  if (isNode) module.exports = api;
  root.RKStory = api;
})(globalThis, function createStory(model, presentation, history) {
  'use strict';

  // A short life story written from the data: birth and parents, work and
  // homes, marriages and children, a little of the history the person lived
  // through, a quote from an interview, death. Certainty is carried by the
  // wording ("podle rodinného vyprávění", "možná – zatím neověřeno") and gaps
  // are said out loud ("Jméno jeho otce zatím neznáme."). Place names stay in
  // the nominative (in brackets) so no Czech declension has to be guessed.

  const STRENGTH = { hypothesis: 1, 'family-record': 2, supported: 3, verified: 4 };
  const OWN_EVENT_TYPES = new Set(['employment', 'public-office', 'migration', 'census', 'property']);
  const HISTORY_CATEGORIES = new Set(['war', 'politics', 'state', 'disaster', 'epidemic', 'society', 'economy']);

  const sexWord = (person, male, female, neutral) => (person?.sex === 'male' ? male : person?.sex === 'female' ? female : neutral);
  const yearOf = (entry) => Number(String(entry?.date || entry?.dateText || '').match(/(?<!\d)(1\d{3}|20\d{2})(?!\d)/)?.[1]) || null;
  const clean = (text) => String(text || '').replace(/\s+/g, ' ').trim();

  function placeLabel(data, placeId, placeText) {
    const name = (data.places || []).find((place) => place.id === placeId)?.name;
    return clean(placeText || name || '');
  }

  function linkEvidence(data, link) {
    if (!link) return null;
    if (link.evidence) return link.evidence;
    let best = null;
    for (const claim of data.claims || []) {
      if (claim.subjectType === 'relationship' && claim.subjectId === link.id && (!best || STRENGTH[claim.evidence] > STRENGTH[best])) best = claim.evidence;
    }
    return best;
  }

  // "Otcem byl X." with the certainty in words.
  function parentSentence(data, person, parent, link, role) {
    const evidence = linkEvidence(data, link);
    const roleWord = role === 'father' ? 'otcem' : role === 'mother' ? 'matkou' : 'rodičem';
    const pronoun = sexWord(person, 'Jeho', 'Jejím', 'Jeho či jejím');
    const verb = parent.sex === 'female' ? 'byla' : 'byl';
    const extra = parent.occupations?.length ? `, ${parent.occupations[0]}` : '';
    if (evidence === 'hypothesis') return `${pronoun} ${roleWord} ${verb} možná ${parent.displayName}${extra} – zatím neověřeno.`;
    if (evidence === 'family-record') return `Podle rodinného vyprávění ${verb} ${pronoun.toLowerCase()} ${roleWord} ${parent.displayName}${extra}.`;
    return `${pronoun} ${roleWord} ${verb} ${parent.displayName}${extra}.`;
  }

  function hedge(evidence, text) {
    if (evidence === 'hypothesis') return `${text} (možná – zatím neověřeno)`;
    if (evidence === 'family-record') return `${text} (podle rodinného vyprávění)`;
    return text;
  }

  // "1927" alone reads better as "Roku 1927".
  const when = (text) => (/^\d{4}$/.test(clean(text)) ? `Roku ${clean(text)}` : clean(text));

  function childrenWord(count) {
    return presentation.plural(count, 'dítě', 'děti', 'dětí');
  }

  function lifeStory(data, personId, options = {}) {
    const person = (data.people || []).find((item) => item.id === personId);
    if (!person) return [];
    const now = options.now || new Date();
    const paragraphs = [];
    const name = person.displayName;
    const family = model.getFamily(data, personId, { extended: true });
    const links = data.relationships || [];
    const parentLink = (parentId) => links.find((link) => link.type === 'parent-child' && link.from === parentId && link.to === personId);

    // 1. Birth and parents.
    const birth = [];
    const birthPlace = placeLabel(data, person.birth?.placeId, person.birth?.placeText);
    if (person.birth?.dateText || person.birth?.date) {
      birth.push(`${name} ${sexWord(person, 'se narodil', 'se narodila', 'se narodil(a)')} ${clean(person.birth.dateText || person.birth.date)}${birthPlace ? ` (${birthPlace})` : ''}.`);
    } else {
      birth.push(`Kdy ${sexWord(person, 'se narodil', 'se narodila', 'se narodil(a)')} ${name}, zatím nevíme${birthPlace ? `; jako místo narození se uvádí ${birthPlace}` : ''}.`);
    }
    const father = family.parents.find((parent) => parent.sex === 'male');
    const mother = family.parents.find((parent) => parent.sex === 'female');
    if (father) birth.push(parentSentence(data, person, father, parentLink(father.id), 'father'));
    else birth.push(`Jméno ${sexWord(person, 'jeho', 'jejího', 'jeho či jejího')} otce zatím neznáme.`);
    if (mother) birth.push(parentSentence(data, person, mother, parentLink(mother.id), 'mother'));
    else birth.push(`Jméno ${sexWord(person, 'jeho', 'její', 'jeho či její')} matky zatím neznáme.`);
    for (const parent of family.parents.filter((item) => item !== father && item !== mother)) birth.push(parentSentence(data, person, parent, parentLink(parent.id), 'parent'));
    if (family.siblings.length) {
      const names = family.siblings.slice(0, 6).map((sibling) => sibling.displayName).join(', ');
      birth.push(`${sexWord(person, 'Měl', 'Měla', 'Měl(a)')} ${presentation.plural(family.siblings.length, 'sourozence', 'sourozence', 'sourozenců')}: ${names}${family.siblings.length > 6 ? ' a další' : ''}.`);
    }
    paragraphs.push({ kind: 'birth', text: birth.join(' ') });

    // 2. Work, homes and own events.
    const life = [];
    if (person.occupations?.length) life.push(`${sexWord(person, 'Pracoval', 'Pracovala', 'Pracoval(a)')} jako ${person.occupations.join(', ')}.`);
    if (person.residences?.length) life.push(`${sexWord(person, 'Žil', 'Žila', 'Žil(a)')} v těchto místech: ${person.residences.join('; ')}.`);
    const ownEvents = (data.events || []).filter((event) => (event.personIds || [])[0] === personId && OWN_EVENT_TYPES.has(event.type))
      .sort((a, b) => (yearOf(a) || 0) - (yearOf(b) || 0));
    for (const event of ownEvents.slice(0, 5)) {
      const place = placeLabel(data, event.placeId, event.placeText);
      life.push(hedge(event.evidence, `${clean(event.dateText || event.date || '')}${event.dateText || event.date ? ': ' : ''}${clean(event.title)}${place && !event.title.includes(place) ? ` (${place})` : ''}`) + '.');
    }
    if (life.length) paragraphs.push({ kind: 'life', text: life.join(' ') });

    // 3. Marriages and children.
    const familyText = [];
    const marriages = (data.events || []).filter((event) => event.type === 'marriage' && (event.personIds || []).includes(personId))
      .sort((a, b) => (yearOf(a) || 0) - (yearOf(b) || 0));
    const partners = [...family.partners, ...(family.coParents || [])].filter((partner, index, all) => all.findIndex((item) => item.id === partner.id) === index);
    for (const marriage of marriages) {
      const partnerId = (marriage.personIds || []).find((id) => id !== personId && partners.some((partner) => partner.id === id));
      const partner = partners.find((item) => item.id === partnerId);
      const place = placeLabel(data, marriage.placeId, marriage.placeText);
      const date = when(marriage.dateText || marriage.date || '');
      const partnerText = partner ? ` ${person.sex === 'female' ? 'Manželem se stal' : person.sex === 'male' ? 'Manželkou se stala' : 'Partnerem se stal(a)'} ${partner.displayName}.` : '';
      familyText.push(hedge(marriage.evidence, `${date ? `${date} ` : ''}${sexWord(person, 'uzavřel', 'uzavřela', 'uzavřel(a)')} sňatek${place ? ` (${place})` : ''}`).replace(/^./, (letter) => letter.toUpperCase()) + `.${partnerText}`);
    }
    if (!marriages.length && partners.length) {
      familyText.push(`${person.sex === 'female' ? 'Jejím partnerem byl' : person.sex === 'male' ? 'Jeho partnerkou byla' : 'Partnerem byl(a)'} ${partners.map((partner) => partner.displayName).join(' a ')}.`);
    }
    if (family.children.length) {
      familyText.push(`${sexWord(person, 'Měl', 'Měla', 'Měl(a)')} ${childrenWord(family.children.length)}: ${family.children.map((child) => child.displayName).join(', ')}.`);
    }
    if (familyText.length) paragraphs.push({ kind: 'family', text: familyText.join(' ') });

    // 4. History lived through (at most two larger events).
    const events = options.history?.events || [];
    if (history && events.length) {
      const context = history.lifeContext(person, events, { data, currentYear: now.getFullYear() });
      const chosen = (context.items || []).filter((item) => !item.possible && !item.bornDuring && HISTORY_CATEGORIES.has(item.event.category)).slice(0, 2);
      if (chosen.length) {
        paragraphs.push({ kind: 'history', text: `${sexWord(person, 'Zažil', 'Zažila', 'Zažil(a)')} i velké dějiny: ${chosen.map((item) => `${history.formatEventDate(item.event)} – ${item.event.title} (${history.ageSentence(item, person.sex).replace(/\.$/, '').toLowerCase()})`).join('; ')}.` });
      }
    }

    // 5. Memories and the person's own words.
    const memories = [];
    if (person.familyNotes?.length) memories.push(`Z rodinných vzpomínek: ${clean(person.familyNotes[0])}`);
    const clip = (data.media || []).find((media) => media.kind === 'audio-clip' && (media.personIds || []).includes(personId) && media.quote);
    if (clip) {
      const quote = clean(clip.quote);
      memories.push(`V rozhovoru zaznělo: „${quote.length > 220 ? `${quote.slice(0, 217).replace(/\s+\S*$/, '')}…` : quote}“ (${clip.speaker || 'pamětník'}).`);
    }
    const open = (data.claims || []).filter((claim) => claim.subjectType === 'person' && claim.subjectId === personId && claim.evidence === 'hypothesis').slice(0, 2);
    for (const claim of open) memories.push(`Otevřená otázka: ${clean(claim.text).replace(/\.$/, '')} – zatím neověřeno.`);
    if (memories.length) paragraphs.push({ kind: 'memories', text: memories.join(' ') });

    // 6. Death.
    const deathPlace = placeLabel(data, person.death?.placeId, person.death?.placeText);
    if (person.death?.dateText || person.death?.date) {
      const birthYear = yearOf(person.birth);
      const deathYear = yearOf(person.death);
      const age = birthYear && deathYear ? deathYear - birthYear : null;
      paragraphs.push({ kind: 'death', text: `${sexWord(person, 'Zemřel', 'Zemřela', 'Zemřel(a)')} ${clean(person.death.dateText || person.death.date)}${deathPlace ? ` (${deathPlace})` : ''}${age !== null && age >= 0 ? `, ve věku asi ${presentation.plural(age, 'rok', 'roky', 'let')}` : ''}.` });
    } else if (yearOf(person.birth) && now.getFullYear() - yearOf(person.birth) > 100) {
      paragraphs.push({ kind: 'death', text: `Kdy ${sexWord(person, 'zemřel', 'zemřela', 'zemřel(a)')}, zatím nevíme.` });
    }
    return paragraphs;
  }

  function storyText(data, personId, options) {
    return lifeStory(data, personId, options).map((paragraph) => paragraph.text).join('\n\n');
  }

  return { lifeStory, storyText };
});
