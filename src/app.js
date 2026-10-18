(function registerApp(root, factory) {
  const dependencies = typeof module === 'object' && module.exports
    ? { model: require('./model.js'), views: require('./views.js'), fullTree: require('./full-tree.js'), components: require('./components.js') }
    : { model: root.RKModel, views: root.RKViews, fullTree: root.RKFullTree, components: root.RKComponents };
  const api = factory(dependencies.model, dependencies.views, dependencies.fullTree, dependencies.components);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.RKApp = api;
})(globalThis, function createApp(RKModel, RKViews, RKFullTree, RKComponents) {
  'use strict';

  const hashToView = {
    prehled: 'overview',
    rodokmen: 'tree',
    osoby: 'people',
    'casova-osa': 'timeline',
    mista: 'places',
    pribehy: 'claims',
    nalezy: 'claims',
    prameny: 'sources',
    media: 'media',
  };
  // Research edition only ("Badatelna"); without RKResearchViews these hashes open the overview.
  const RESEARCH_HASHES = { badatelna: 'research', 'zdravi-dat': 'health', prepis: 'transcribe', editor: 'editor', dna: 'dna' };
  const RESEARCH_GROUP = 'badatelna';
  const viewToHash = Object.fromEntries([...Object.entries(hashToView).filter(([hash]) => hash !== 'nalezy'), ...Object.entries(RESEARCH_HASHES)].map(([hash, view]) => [view, hash]));
  const researchViews = () => globalThis.RKResearchViews?.render ? globalThis.RKResearchViews : null;
  const NAV_GROUP_VIEWS = { story: new Set(['places', 'timeline']), evidence: new Set(['sources', 'media']) };
  const NAVIGATION_GROUPS = {
    story: {
      label: 'Místa a čas',
      items: [
        { label: 'Místa', view: 'places', hash: 'mista' },
        { label: 'Časová osa', view: 'timeline', hash: 'casova-osa' },
      ],
    },
    evidence: {
      label: 'Prameny',
      items: [
        { label: 'Všechny prameny', view: 'sources', hash: 'prameny' },
        { label: 'Fotografie a nahrávky', view: 'media', hash: 'media' },
      ],
    },
  };
  const TREE_GENERATIONS_KEY = 'rk-tree-generations';
  const TREE_GENERATIONS_VERSION_KEY = 'rk-tree-generations-version';
  const TREE_GENERATIONS_VERSION = '1.41.0';
  const EGO_PERSON_KEY = 'rk-ego-person';
  const TREE_SCALE_KEY = 'rk-tree-scale';

  function clampTreeGenerations(value, fallback = 'all') {
    if (value === 'all') return 'all';
    const count = Number(value);
    if (!Number.isFinite(count)) return fallback;
    return Math.min(12, Math.max(1, Math.floor(count)));
  }

  function readTreeGenerations(storage, fallback = 'all') {
    if (!storage || typeof storage.getItem !== 'function') return fallback;
    if (storage.getItem(TREE_GENERATIONS_VERSION_KEY) !== TREE_GENERATIONS_VERSION) return fallback;
    const saved = storage.getItem(TREE_GENERATIONS_KEY);
    return saved === null ? fallback : clampTreeGenerations(saved, fallback);
  }

  function clampTreeScale(value, fallback = 100) {
    const scale = Number(value);
    if (!Number.isFinite(scale)) return fallback;
    return Math.min(200, Math.max(10, Math.round(scale)));
  }

  function clampFitTreeScale(value, fallback = 100) {
    const scale = Number(value);
    if (!Number.isFinite(scale)) return fallback;
    return Math.min(200, Math.max(5, Math.floor(scale)));
  }

  function syncTreeScaleOutput(output, scale) {
    if (!output) return;
    output.textContent = `${scale} %`;
  }

  function readTreeScale(storage, fallback = 100) {
    if (!storage || typeof storage.getItem !== 'function') return fallback;
    const saved = storage.getItem(TREE_SCALE_KEY);
    return saved === null ? fallback : clampFitTreeScale(saved, fallback);
  }

  function findVisibleTreePersonButton(container, personId) {
    if (!container || typeof container.querySelectorAll !== 'function') return null;
    const candidates = [...container.querySelectorAll('.tree-view-direct [data-person-id], .tree-view-full [data-full-tree-person]')]
      .filter((button) => button.dataset?.personId === personId || button.dataset?.fullTreePerson === personId);
    const visible = candidates.find((button) => {
      if (typeof button.getClientRects === 'function' && button.getClientRects().length === 0) return false;
      if (typeof globalThis.getComputedStyle !== 'function') return true;
      const style = globalThis.getComputedStyle(button);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });
    return visible || candidates[0] || null;
  }

  function resetWindowScroll(target = globalThis) {
    if (!target) return;
    if (typeof target.scrollTo === 'function') {
      try {
        target.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      } catch (_) {
        target.scrollTo(0, 0);
      }
    } else {
      target.scrollTop = 0;
      target.scrollLeft = 0;
    }
  }

  function positionTreeScroll(treeScroll, options = {}) {
    if (!treeScroll) return { left: 0, top: 0 };
    if (options.preserve && options.position) {
      treeScroll.scrollLeft = options.position.left;
      treeScroll.scrollTop = options.position.top;
      return { left: treeScroll.scrollLeft, top: treeScroll.scrollTop };
    }
    const anchorX = Number(treeScroll.dataset?.treeAnchorX);
    const anchorY = Number(treeScroll.dataset?.treeAnchorY);
    const anchorWidth = Number(treeScroll.dataset?.treeAnchorWidth || 0);
    const anchorHeight = Number(treeScroll.dataset?.treeAnchorHeight || 0);
    const viewportWidth = Number(treeScroll.clientWidth || 0);
    const viewportHeight = Number(treeScroll.clientHeight || 0);
    if (treeScroll.style?.setProperty && viewportHeight > 0) {
      treeScroll.style.setProperty('--tree-anchor-padding', `${Math.ceil(viewportHeight / 2)}px`);
    }
    const maxLeft = Math.max(0, Number(treeScroll.scrollWidth || treeScroll.dataset?.treeContentWidth || 0) - viewportWidth);
    const maxTop = Math.max(0, Number(treeScroll.scrollHeight || treeScroll.dataset?.treeContentHeight || 0) - viewportHeight);
    const desiredLeft = Number.isFinite(anchorX) && viewportWidth > 0 ? anchorX - (viewportWidth / 2) : maxLeft / 2;
    const desiredTop = Number.isFinite(anchorY) && viewportHeight > 0 ? anchorY - (viewportHeight / 2) : maxTop / 2;
    treeScroll.scrollLeft = Math.max(0, Math.min(desiredLeft, maxLeft));
    treeScroll.scrollTop = Math.max(0, Math.min(desiredTop, maxTop));
    return { left: treeScroll.scrollLeft, top: treeScroll.scrollTop };
  }

  function preserveDialogReturnFocus(dialogOpen, currentTrigger, activeElement) {
    return dialogOpen ? currentTrigger : activeElement;
  }

  function activateTreePerson(personId, displayName, dispatch, openPerson) {
    if (!personId || typeof dispatch !== 'function' || typeof openPerson !== 'function') return;
    dispatch({ type: 'SET_TREE_SELECTION', personId }, `Zvýrazněna větev osoby ${displayName}`, { restoreTreeFocus: personId });
    openPerson(personId, { fromTree: true });
  }

  function setTreeFocusFromDetail(personId, displayName, dialogOpen, closeDialog, dispatch) {
    if (!personId || typeof dispatch !== 'function') return;
    if (dialogOpen && typeof closeDialog === 'function') closeDialog();
    dispatch({ type: 'FOCUS_PERSON', personId }, `Rodokmen zaměřen na ${displayName}`, { restoreTreeFocus: personId });
  }

  function shouldShowModal(dialog) {
    return Boolean(dialog && !dialog.open && typeof dialog.showModal === 'function');
  }

  function treeScrollFromTarget(target) {
    if (!target) return null;
    if (typeof target.closest === 'function') return target.closest('.tree-scroll');
    if (typeof target.matches === 'function' && target.matches('.tree-scroll')) return target;
    return null;
  }

  const TREE_INTERACTIVE_SELECTOR = 'button, a, input, select, textarea, option, summary, label, audio[controls], video[controls], [role="button"], [role="link"], [role="checkbox"], [role="combobox"], [role="listbox"], [role="option"], [role="radio"], [role="slider"], [role="switch"], [role="tab"], [role="menuitem"], [contenteditable="true"], [tabindex]:not([tabindex="-1"])';

  function isInteractiveTreeTarget(target, scroll) {
    if (!target || target === scroll) return false;
    if (typeof target.closest === 'function') {
      const interactive = target.closest(TREE_INTERACTIVE_SELECTOR);
      if (!interactive || interactive === scroll) return false;
      return treeScrollFromTarget(interactive) === scroll;
    }
    return typeof target.matches === 'function' && target.matches(TREE_INTERACTIVE_SELECTOR);
  }

  function createTreePanGesture(options = {}) {
    let active = null;
    const onZoom = typeof options.onZoom === 'function' ? options.onZoom : null;

    function eventInput(event) {
      return String(event?.type || '').startsWith('pointer') || event?.pointerId !== undefined ? 'pointer' : 'mouse';
    }

    function isCurrentInput(event) {
      if (!active) return false;
      if (eventInput(event) !== active.input) return false;
      return active.input !== 'pointer' || event.pointerId === undefined || event.pointerId === active.pointerId;
    }

    function onPointerDown(event) {
      if ((event?.button !== 0 && event?.button !== 1) || active) return;
      const scroll = treeScrollFromTarget(event.target);
      if (!scroll) return;
      if (event.button === 0 && isInteractiveTreeTarget(event.target, scroll)) return;
      event.preventDefault?.();
      active = {
        input: eventInput(event),
        pointerId: event.pointerId,
        scroll,
        startX: Number(event.clientX || 0),
        startY: Number(event.clientY || 0),
        startLeft: Number(scroll.scrollLeft || 0),
        startTop: Number(scroll.scrollTop || 0),
      };
      scroll.classList?.add('is-grabbing');
      if (active.input === 'pointer' && Number.isFinite(active.pointerId)) {
        try { scroll.setPointerCapture?.(active.pointerId); } catch (_) { /* optional browser capability */ }
      }
    }

    function onPointerMove(event) {
      if (!isCurrentInput(event)) return;
      event.preventDefault?.();
      active.scroll.scrollLeft = active.startLeft - (Number(event.clientX || 0) - active.startX);
      active.scroll.scrollTop = active.startTop - (Number(event.clientY || 0) - active.startY);
    }

    function onWheel(event) {
      const scroll = treeScrollFromTarget(event?.target);
      if (!scroll) return;
      const deltaX = Number(event.deltaX) || 0;
      const deltaY = Number(event.deltaY) || 0;
      if (event.ctrlKey) {
        event.preventDefault?.();
        const delta = deltaY || deltaX;
        if (delta) onZoom?.(delta < 0 ? 'in' : 'out');
        return;
      }
      scroll.scrollLeft += deltaX + (event.shiftKey ? deltaY : 0);
      if (!event.shiftKey) scroll.scrollTop += deltaY;
      event.preventDefault?.();
    }

    function finish(event) {
      if (!isCurrentInput(event)) return;
      const current = active;
      active = null;
      current.scroll.classList?.remove('is-grabbing');
      if (current.input === 'pointer' && Number.isFinite(current.pointerId)) {
        try { current.scroll.releasePointerCapture?.(current.pointerId); } catch (_) { /* optional browser capability */ }
      }
    }

    function bind(root) {
      if (!root || typeof root.addEventListener !== 'function') return () => {};
      const listeners = [
        ['pointerdown', onPointerDown], ['pointermove', onPointerMove], ['pointerup', finish], ['pointercancel', finish],
        ['mousedown', onPointerDown], ['mousemove', onPointerMove], ['mouseup', finish], ['mouseleave', finish],
        ['wheel', onWheel, { passive: false }],
      ];
      listeners.forEach(([type, listener, options]) => root.addEventListener(type, listener, options));
      return () => listeners.forEach(([type, listener, options]) => root.removeEventListener?.(type, listener, options));
    }

    return {
      bind,
      onPointerDown,
      onPointerMove,
      onPointerUp: finish,
      onPointerCancel: finish,
      onWheel,
      get active() { return Boolean(active); },
    };
  }

  function resolveInteraction(dataset = {}) {
    if (dataset.resetFilters !== undefined) return { kind: 'reset-filters' };
    if (dataset.clearFilter) return { kind: 'clear-filter', name: dataset.clearFilter };
    if (dataset.searchResultId) return { kind: 'detail', type: dataset.searchOpen, id: dataset.searchId || dataset.searchResultId };
    if (dataset.eventId) return { kind: 'detail', type: 'event', id: dataset.eventId };
    return null;
  }

  function resolveClickInteraction(target) {
    const clearFilterChip = target?.closest?.('[data-clear-filter]');
    if (clearFilterChip) return resolveInteraction(clearFilterChip.dataset || {});
    const interactionTarget = target?.closest?.('[data-search-result-id], [data-event-id], [data-reset-filters]');
    return resolveInteraction(interactionTarget?.dataset || {});
  }

  function viewFromHash(hash = '') {
    const key = hash.replace(/^#/, '');
    if (researchViews() && RESEARCH_HASHES[key]) return RESEARCH_HASHES[key];
    return hashToView[key] || 'overview';
  }

  // Adds the "Badatelna" menu to the header of the research edition.
  function installResearchNavigation(navRoot, data) {
    const views = researchViews();
    const primary = navRoot?.querySelector('.nav-primary');
    if (!views || !primary || primary.querySelector(`[data-nav-group="${RESEARCH_GROUP}"]`)) return null;
    const items = views.navigationItems(data);
    NAVIGATION_GROUPS[RESEARCH_GROUP] = { label: 'Badatelna', items };
    NAV_GROUP_VIEWS[RESEARCH_GROUP] = new Set(items.map((item) => item.view));
    const group = document.createElement('div');
    group.className = 'nav-menu-group nav-menu-research';
    group.dataset.navGroup = RESEARCH_GROUP;
    group.innerHTML = `<button class="nav-group-trigger" type="button" data-nav-group-trigger="${RESEARCH_GROUP}" aria-haspopup="menu" aria-expanded="false" aria-controls="nav-menu-${RESEARCH_GROUP}">Badatelna <span class="nav-group-chevron" aria-hidden="true"></span></button><div class="nav-dropdown" id="nav-menu-${RESEARCH_GROUP}" role="menu" aria-label="Badatelna" hidden>${items.map((item) => `<button type="button" role="menuitem" data-view="${item.view}">${item.label}</button>`).join('')}</div>`;
    primary.append(group);
    return group;
  }

  function getNavigationModel() {
    const groups = Object.fromEntries(Object.entries(NAVIGATION_GROUPS).map(([key, group]) => [key, {
      label: group.label,
      items: group.items.map((item) => ({ ...item })),
    }]));
    return {
      primary: [
        { kind: 'link', label: 'Přehled', view: 'overview', hash: 'prehled' },
        { kind: 'link', label: 'Rodokmen', view: 'tree', hash: 'rodokmen' },
        { kind: 'link', label: 'Osoby', view: 'people', hash: 'osoby' },
        { kind: 'link', label: 'Příběhy', view: 'claims', hash: 'pribehy' },
        { kind: 'group', group: 'story', label: NAVIGATION_GROUPS.story.label },
        { kind: 'group', group: 'evidence', label: NAVIGATION_GROUPS.evidence.label },
      ],
      groups,
      secondary: Object.fromEntries(Object.entries(groups).map(([key, group]) => [key, group.items])),
    };
  }

  function createNavigationState() {
    return { openGroup: null, openMode: null };
  }

  function reduceNavigationState(state = createNavigationState(), action = {}) {
    const current = state?.openGroup || null;
    const validGroup = (group) => Object.prototype.hasOwnProperty.call(NAVIGATION_GROUPS, group);
    const close = () => ({ ...state, openGroup: null, openMode: null });
    if (['OPEN', 'HOVER_OPEN'].includes(action.type) && validGroup(action.group)) return { ...state, openGroup: action.group, openMode: 'hover' };
    if (action.type === 'FOCUS_OPEN' && validGroup(action.group)) return { ...state, openGroup: action.group, openMode: 'keyboard' };
    if (action.type === 'TRIGGER_CLICK' && validGroup(action.group)) {
      if (current !== action.group) return { ...state, openGroup: action.group, openMode: 'click' };
      if (state.openMode === 'click') return close();
      return { ...state, openGroup: action.group, openMode: 'click' };
    }
    if (action.type === 'TOGGLE' && validGroup(action.group)) return current === action.group ? close() : { ...state, openGroup: action.group, openMode: 'click' };
    if (action.type === 'POINTER_LEAVE') return current === action.group ? close() : state;
    if (['ESCAPE', 'OUTSIDE_CLICK', 'SELECT_ITEM', 'CLOSE'].includes(action.type)) return close();
    return state;
  }

  function getNavigationActivity(view) {
    return {
      groups: Object.fromEntries(Object.entries(NAVIGATION_GROUPS).map(([key, group]) => [key, {
        active: Boolean(NAV_GROUP_VIEWS[key]?.has(view)),
        items: group.items.map((item) => ({ ...item, active: item.view === view })),
      }])),
    };
  }

  function createInitialState(data, hash = '') {
    return {
      view: viewFromHash(hash),
      focusPersonId: data.meta.defaultPersonId,
      egoPersonId: data.meta.defaultPersonId,
      treeMode: 'direct',
      treeGenerations: 4,
      treeScale: 100,
      treeSelectedPersonId: null,
      query: '',
      filters: {},
      placesMode: 'all',
      timelineMode: 'events',
      migrationPersonId: null,
      detail: null,
      focusTarget: 'view-root',
      scrollResetToken: 0,
    };
  }

  function reduceState(state, action) {
    if (action.type === 'NAVIGATE') {
      return { ...state, view: action.view, query: '', filters: {}, treeSelectedPersonId: null, detail: null, focusTarget: 'view-root', scrollResetToken: (state.scrollResetToken || 0) + 1 };
    }
    if (action.type === 'SET_QUERY') return { ...state, query: action.query };
    if (action.type === 'SET_FILTER') {
      return { ...state, filters: { ...state.filters, [action.name]: action.value } };
    }
    if (action.type === 'RESET_FILTERS') return { ...state, filters: {} };
    if (action.type === 'SET_PLACES_MODE') return { ...state, placesMode: ['migration', 'film'].includes(action.mode) ? action.mode : 'all' };
    if (action.type === 'SET_TIMELINE_MODE') return { ...state, timelineMode: action.mode === 'lives' ? 'lives' : 'events', filters: {} };
    if (action.type === 'SET_MIGRATION_PERSON') return { ...state, migrationPersonId: action.personId || null };
    if (action.type === 'CLEAR_FILTER') {
      const filters = { ...state.filters };
      delete filters[action.name];
      return { ...state, filters };
    }
    if (action.type === 'FOCUS_PERSON') return { ...state, focusPersonId: action.personId, treeSelectedPersonId: null };
    // Choosing "who I am" also centres the tree on that person.
    if (action.type === 'SET_EGO') return { ...state, egoPersonId: action.personId, focusPersonId: action.personId, treeSelectedPersonId: null };
    // The light edition has no full-tree layout engine.
    if (action.type === 'SET_TREE_MODE') return { ...state, treeMode: action.mode === 'full' && globalThis.RK_EDITION !== 'light' ? 'full' : 'direct', treeSelectedPersonId: null };
    if (action.type === 'SET_TREE_GENERATIONS') {
      if (action.count !== 'all' && !Number.isFinite(Number(action.count))) return state;
      return { ...state, treeGenerations: clampTreeGenerations(action.count, state.treeGenerations), treeSelectedPersonId: null };
    }
    if (action.type === 'SET_TREE_SELECTION') return { ...state, treeSelectedPersonId: action.personId || null };
    if (action.type === 'CLEAR_TREE_SELECTION') return { ...state, treeSelectedPersonId: null };
    if (action.type === 'SET_TREE_ZOOM') {
      const current = clampFitTreeScale(state.treeScale);
      const next = action.kind === 'reset'
        ? 100
        : action.kind === 'fit'
          ? clampFitTreeScale(action.scale)
          : clampFitTreeScale(current + (action.kind === 'in' ? 10 : -10));
      return { ...state, treeScale: next };
    }
    return state;
  }

  function init() {
    if (typeof document === 'undefined') return null;
    const data = globalThis.RK_DATA;
    const viewRoot = document.getElementById('view-root');
    const search = document.getElementById('global-search');
    const searchResults = document.getElementById('global-search-results');
    const dialog = document.getElementById('detail-dialog');
    const dialogBody = document.getElementById('detail-body');
    const liveRegion = document.getElementById('live-region');
    const navRoot = document.querySelector('.app-nav');
    installResearchNavigation(navRoot, data);
    const navGroups = navRoot ? [...navRoot.querySelectorAll('.nav-menu-group')] : [];
    let navigationState = createNavigationState();
    let state = createInitialState(data, globalThis.location?.hash || '');
    let dialogReturnFocus = null;
    let mapController = null;
    let migrationTimer = null;
    let filmTimer = null;
    let film = null;
    let fullTreeController = null;
    let researchController = null;
    const treeModeSnapshots = { direct: null, full: null };

    function syncParentSideActions(side) {
      for (const button of viewRoot.querySelectorAll('[data-full-tree-action="paternal"], [data-full-tree-action="maternal"]')) {
        button.setAttribute('aria-pressed', String(button.dataset.fullTreeAction === side));
      }
    }

    function syncNavigationMarkup() {
      navGroups.forEach((group) => {
        const groupKey = group.dataset.navGroup;
        const isOpen = navigationState.openGroup === groupKey;
        const trigger = group.querySelector('[data-nav-group-trigger]');
        const menu = group.querySelector('.nav-dropdown');
        group.classList.toggle('is-open', isOpen);
        trigger?.setAttribute('aria-expanded', String(isOpen));
        if (menu) {
          menu.hidden = !isOpen;
          menu.setAttribute('aria-hidden', String(!isOpen));
        }
      });
    }

    function setNavigationState(action, focusGroup = null) {
      navigationState = reduceNavigationState(navigationState, action);
      syncNavigationMarkup();
      if (focusGroup) {
        navRoot?.querySelector(`[data-nav-group-trigger="${focusGroup}"]`)?.focus?.();
      }
    }

    function menuItems(groupKey) {
      const group = navRoot?.querySelector(`.nav-menu-group[data-nav-group="${groupKey}"]`);
      return group ? [...group.querySelectorAll('.nav-dropdown [role="menuitem"]')] : [];
    }

    function focusMenuItem(groupKey, index) {
      const items = menuItems(groupKey);
      if (!items.length) return;
      items[Math.max(0, Math.min(index, items.length - 1))]?.focus?.();
    }

    navGroups.forEach((group) => {
      const groupKey = group.dataset.navGroup;
      group.addEventListener?.('pointerenter', () => setNavigationState({ type: 'HOVER_OPEN', group: groupKey }));
      group.addEventListener?.('pointerleave', () => setNavigationState({ type: 'POINTER_LEAVE', group: groupKey }));
      group.addEventListener?.('focusout', (event) => {
        if (!group.contains(event.relatedTarget)) setNavigationState({ type: 'POINTER_LEAVE', group: groupKey });
      });
    });
    syncNavigationMarkup();
    const treePanGesture = createTreePanGesture({
      onZoom: (kind) => handleTreeZoom(kind),
    });
    treePanGesture.bind(document);

    try {
      state.treeGenerations = readTreeGenerations(globalThis.localStorage, state.treeGenerations);
      state.treeScale = readTreeScale(globalThis.localStorage, state.treeScale);
      const savedEgo = globalThis.localStorage?.getItem(EGO_PERSON_KEY);
      if (savedEgo && RKModel.getPerson(data, savedEgo)) state = { ...state, egoPersonId: savedEgo, focusPersonId: savedEgo };
    } catch (_) {
      // The artifact remains usable when local storage is unavailable.
    }

    function renderEgoPicker() {
      const host = document.querySelector('[data-ego-host]');
      if (host) host.innerHTML = RKComponents.personPicker({ id: 'ego-person', attribute: 'data-ego-person', people: data.people, relationships: data.relationships, selectedId: state.egoPersonId, label: 'Já jsem' });
    }
    renderEgoPicker();

    // Anchored bubble for a tree card or map point. It closes on Escape, on a
    // click outside, or when its anchor leaves the page (re-render, cluster zoom).
    const bubble = document.getElementById('entity-bubble');
    let bubbleState = null;

    function treePersonAnchor(personId) {
      const id = CSS.escape(personId);
      return [...viewRoot.querySelectorAll(`.tree-view [data-person-id="${id}"], .tree-view [data-full-tree-person="${id}"]`)].find((element) => element.getClientRects().length) || null;
    }

    function positionBubble() {
      if (!bubbleState || !bubble) return;
      const anchor = bubbleState.anchor;
      if (!anchor?.isConnected || !anchor.getClientRects().length) {
        closeBubble({ restoreFocus: false });
        return;
      }
      const gap = 12;
      const margin = 8;
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = document.documentElement.clientHeight;
      if (viewportWidth <= 680) {
        bubble.dataset.side = 'sheet';
        bubble.style.left = '';
        bubble.style.top = '';
        return;
      }
      const target = anchor.getBoundingClientRect();
      const box = bubble.getBoundingClientRect();
      let side = 'right';
      let left = target.right + gap;
      let top = target.top + target.height / 2 - box.height / 2;
      if (left + box.width > viewportWidth - margin) {
        side = 'left';
        left = target.left - gap - box.width;
      }
      if (left < margin) {
        side = target.top > viewportHeight / 2 ? 'above' : 'below';
        left = Math.min(Math.max(margin, target.left + target.width / 2 - box.width / 2), viewportWidth - box.width - margin);
        top = side === 'below' ? target.bottom + gap : target.top - gap - box.height;
      }
      top = Math.min(Math.max(margin, top), Math.max(margin, viewportHeight - box.height - margin));
      bubble.dataset.side = side;
      bubble.style.left = `${Math.round(left)}px`;
      bubble.style.top = `${Math.round(top)}px`;
      const arrowY = Math.min(Math.max(18, target.top + target.height / 2 - top), box.height - 18);
      const arrowX = Math.min(Math.max(18, target.left + target.width / 2 - left), box.width - 18);
      bubble.style.setProperty('--bubble-arrow-y', `${Math.round(arrowY)}px`);
      bubble.style.setProperty('--bubble-arrow-x', `${Math.round(arrowX)}px`);
      // Hide while the anchor is scrolled out of sight instead of floating detached.
      bubble.classList.toggle('is-offscreen', target.bottom < 0 || target.top > viewportHeight || target.right < 0 || target.left > viewportWidth);
    }

    function openBubble(type, id, anchor, options = {}) {
      if (!bubble || !anchor) return false;
      const html = type === 'person'
        ? RKViews.renderPersonBubble(data, id, { egoPersonId: state.egoPersonId, inTree: options.inTree })
        : RKViews.renderPlaceBubble(data, id, { egoPersonId: state.egoPersonId });
      if (!html) return false;
      bubbleState = { type, id, anchor, inTree: Boolean(options.inTree) };
      bubble.innerHTML = `<button type="button" class="bubble-close" data-bubble-close aria-label="Zavřít">×</button><div class="bubble-body">${html}</div>`;
      bubble.hidden = false;
      bubble.style.left = '0px';
      bubble.style.top = '0px';
      positionBubble();
      try { bubble.focus({ preventScroll: true }); } catch (_) { bubble.focus(); }
      const name = type === 'person' ? RKModel.getPerson(data, id)?.displayName : data.places.find((place) => place.id === id)?.name;
      liveRegion.textContent = `Otevřena bublina: ${name || ''}`;
      return true;
    }

    function closeBubble({ restoreFocus = true } = {}) {
      if (!bubbleState || !bubble) return;
      const anchor = bubbleState.anchor;
      // Closing a person's bubble in the full tree also lifts the path highlight.
      if (bubbleState.inTree && state.treeMode === 'full') fullTreeController?.clearSelection?.();
      bubbleState = null;
      bubble.hidden = true;
      bubble.innerHTML = '';
      if (restoreFocus && anchor?.isConnected) {
        try { anchor.focus({ preventScroll: true }); } catch (_) { anchor.focus?.(); }
      }
    }

    function toggleBubble(type, id, anchor, options = {}) {
      if (bubbleState && bubbleState.type === type && bubbleState.id === id && bubbleState.anchor === anchor) {
        closeBubble();
        return;
      }
      if (!openBubble(type, id, anchor, options)) {
        if (type === 'person') openPerson(id, { fromTree: options.inTree });
        else openPlace(id);
      }
    }

    function openTreePersonBubble(personId) {
      toggleBubble('person', personId, treePersonAnchor(personId), { inTree: true });
    }

    document.addEventListener('pointerdown', (event) => {
      if (!bubbleState) return;
      if (bubble.contains(event.target) || bubbleState.anchor?.contains?.(event.target)) return;
      closeBubble({ restoreFocus: false });
    }, true);
    globalThis.addEventListener('scroll', () => { if (bubbleState) globalThis.requestAnimationFrame(positionBubble); }, true);
    globalThis.addEventListener('resize', () => { if (bubbleState) positionBubble(); });

    bubble?.addEventListener('click', (event) => {
      if (event.target.closest('[data-bubble-close]')) {
        closeBubble();
        return;
      }
      const person = event.target.closest('[data-bubble-person]');
      if (person && bubbleState) {
        // Keep the same anchor so the reader can step through relatives in place.
        openBubble('person', person.dataset.bubblePerson, bubbleState.anchor, { inTree: bubbleState.inTree });
        return;
      }
      const feedbackPerson = event.target.closest('[data-bubble-feedback-person]');
      if (feedbackPerson) {
        closeBubble({ restoreFocus: false });
        openPerson(feedbackPerson.dataset.bubbleFeedbackPerson, { openFeedback: true });
        return;
      }
      const openFullPerson = event.target.closest('[data-bubble-open-person]');
      if (openFullPerson) {
        const fromTree = bubbleState?.inTree;
        closeBubble({ restoreFocus: false });
        openPerson(openFullPerson.dataset.bubbleOpenPerson, { fromTree });
        return;
      }
      const openFullPlace = event.target.closest('[data-bubble-open-place]');
      if (openFullPlace) {
        closeBubble({ restoreFocus: false });
        openPlace(openFullPlace.dataset.bubbleOpenPlace);
        return;
      }
      const focusPerson = event.target.closest('[data-bubble-focus-person]');
      if (focusPerson) {
        const personRecord = RKModel.getPerson(data, focusPerson.dataset.bubbleFocusPerson);
        closeBubble({ restoreFocus: false });
        if (personRecord) dispatch({ type: 'FOCUS_PERSON', personId: personRecord.id }, `Rodokmen zaměřen na ${personRecord.displayName}`, { restoreTreeFocus: personRecord.id });
      }
    });

    function renderCurrentView(options = {}) {
      closeBubble({ restoreFocus: false });
      stopMigrationPlayback();
      stopFilm();
      mapController?.destroy();
      mapController = null;
      fullTreeController?.destroy();
      fullTreeController = null;
      researchController?.destroy();
      researchController = null;
      const navigationActivity = getNavigationActivity(state.view);
      const renderers = {
        overview: () => RKViews.renderOverview(data, state),
        people: () => RKViews.renderPeople(data, state),
        tree: () => globalThis.RKTree
          ? globalThis.RKTree.renderTreeView(data, state)
          : RKViews.renderPlaceholder('Rodokmen', 'Vztahy', 'Interaktivní rodinný pohled.'),
        timeline: () => RKViews.renderTimeline
          ? RKViews.renderTimeline(data, state)
          : RKViews.renderPlaceholder('Časová osa', 'Události', 'Životní a historické události.'),
        places: () => RKViews.renderPlaces
          ? RKViews.renderPlaces(data, state)
          : RKViews.renderPlaceholder('Místa', 'Geografie rodu', 'Obce, domy a migrace.'),
        claims: () => RKViews.renderClaims
          ? RKViews.renderClaims(data, state)
          : RKViews.renderPlaceholder('Nálezy', 'Důkazní řetězec', 'Tvrzení propojená se zdroji.'),
        sources: () => RKViews.renderSources
          ? RKViews.renderSources(data, state)
          : RKViews.renderPlaceholder('Prameny', 'Archiv', 'Rodinné zápisky a historické dokumenty.'),
        media: () => RKViews.renderMedia
          ? RKViews.renderMedia(data, state)
          : RKViews.renderPlaceholder('Média', 'Důkazy', 'Vložené fotografie a stránky pramenů.'),
      };
      const research = researchViews();
      if (research) for (const view of Object.values(RESEARCH_HASHES)) renderers[view] = () => research.render(view, data, state);
      viewRoot.classList.toggle('is-entering', Boolean(options.animate));
      viewRoot.innerHTML = (renderers[state.view] || renderers.overview)();
      if (research && Object.values(RESEARCH_HASHES).includes(state.view)) {
        researchController = research.mount(state.view, viewRoot, {
          data,
          state,
          // Re-render in place and give focus back to the control that changed.
          rerender: () => {
            const active = document.activeElement;
            const marker = active && viewRoot.contains(active) ? [...active.attributes].find((attribute) => attribute.name.startsWith('data-rv-')) : null;
            renderCurrentView({ focusHeading: false });
            if (marker) viewRoot.querySelector(`[${marker.name}="${globalThis.CSS?.escape ? CSS.escape(marker.value) : marker.value}"]`)?.focus();
          },
          navigate: (view) => dispatch({ type: 'NAVIGATE', view }, `Otevřen pohled ${research.VIEWS[view]?.label || view}`),
          setFilter: (name, value) => dispatch({ type: 'SET_FILTER', name, value }),
        });
      }
      if (state.view === 'tree' && state.treeMode === 'full' && RKFullTree) {
        const fullHost = viewRoot.querySelector('[data-full-tree-viewport]');
        if (fullHost) {
          fullTreeController = RKFullTree.mount(fullHost, data, {
            focusId: state.focusPersonId || data.meta.defaultPersonId,
            snapshot: options.fullTreeSnapshot || treeModeSnapshots.full,
            onScaleChange: (scale) => {
              syncTreeScaleOutput(viewRoot.querySelector('[data-tree-scale]'), scale);
            },
            onParentSideChange: (side) => syncParentSideActions(side),
            onSelectPerson: (id) => openTreePersonBubble(id),
            onViewChange: () => positionBubble(),
          });
          const mountedController = fullTreeController;
          fullTreeController.ready.then(() => {
            if (fullTreeController !== mountedController) return;
            const output = viewRoot.querySelector('[data-tree-scale]');
            syncTreeScaleOutput(output, mountedController.snapshot().scale);
            treeModeSnapshots.full = mountedController.snapshot();
            syncParentSideActions(mountedController.snapshot().parentSide);
          }).catch(() => {});
        }
      }
      const migrationContainer = viewRoot.querySelector('[data-migration-map]');
      if (migrationContainer && globalThis.RKMap) {
        const personId = migrationContainer.dataset.migrationPerson;
        mapController = globalThis.RKMap.mountMigration(migrationContainer, globalThis.RKMap.buildMigration(data, RKModel.getAncestorDepths(data, personId)), {
          worldGeometry: globalThis.RK_WORLD_OUTLINE,
          onPlaceSelect: (placeId, element) => toggleBubble('place', placeId, element || null),
          onViewChange: () => positionBubble(),
        });
      }
      const filmContainer = viewRoot.querySelector('[data-film-map]');
      if (filmContainer && globalThis.RKMap?.mountFilm) {
        film = globalThis.RKMap.buildFilm(data);
        mapController = globalThis.RKMap.mountFilm(filmContainer, film, {
          worldGeometry: globalThis.RK_WORLD_OUTLINE,
          onPlaceSelect: (placeId, element) => toggleBubble('place', placeId, element || null),
          onViewChange: () => positionBubble(),
        });
        showFilmYear(film.from);
        offerFilmVoice();
      }
      const mapContainer = viewRoot.querySelector('[data-map-view]');
      if (mapContainer && globalThis.RKMap) {
        const mapPlaceIds = (mapContainer.dataset.mapPlaceIds || '').split(',').filter(Boolean).map((id) => decodeURIComponent(id));
        const mapPlaces = mapPlaceIds.map((id) => data.places.find((place) => place.id === id)).filter(Boolean);
        mapController = globalThis.RKMap.mount(mapContainer, mapPlaces, {
          worldGeometry: globalThis.RK_WORLD_OUTLINE,
          // The home region frames the overview and the unfiltered places view; "Všechna místa" still shows every point.
          initialBounds: state.view === 'overview' || !Object.values(state.filters || {}).some(Boolean) ? data.meta?.mapView?.initialBounds : undefined,
          onPlaceSelect: (placeId, element) => toggleBubble('place', placeId, element || null),
          onViewChange: () => positionBubble(),
        });
      }
      document.querySelectorAll('[data-view]').forEach((button) => {
        const active = button.dataset.view === state.view || Boolean(button.dataset.navGroup && NAV_GROUP_VIEWS[button.dataset.navGroup]?.has(state.view));
        button.classList.toggle('is-active', active);
        if (button.closest('.app-nav')) button.setAttribute('aria-current', active ? 'page' : 'false');
      });
      document.querySelectorAll('.app-nav [data-nav-group-trigger]').forEach((trigger) => {
        const groupKey = trigger.dataset.navGroupTrigger;
        const active = navigationActivity.groups[groupKey]?.active === true;
        trigger.classList.toggle('is-active', active);
        trigger.setAttribute('aria-current', active ? 'page' : 'false');
        trigger.closest('.nav-menu-group')?.classList.toggle('is-active', active);
      });
      if (search.value !== state.query) search.value = state.query;
      if (searchResults && RKViews.renderGlobalSearchResults) searchResults.innerHTML = RKViews.renderGlobalSearchResults(data, state.query);
      const nextHash = viewToHash[state.view] || 'prehled';
      if (globalThis.location && globalThis.location.hash !== `#${nextHash}`) {
        globalThis.history?.replaceState(null, '', `#${nextHash}`);
      }
      const viewTitle = state.view === 'overview' ? '' : viewRoot.querySelector('h1')?.textContent?.trim() || '';
      document.title = viewTitle ? `${viewTitle} · Rodová kronika` : 'Rodová kronika';
      const heading = viewRoot.querySelector('h1');
      if (heading) {
        heading.setAttribute('tabindex', '-1');
        if (options.focusHeading !== false) {
          try { heading.focus({ preventScroll: true }); } catch (_) { heading.focus(); }
        }
      }
      if (options.resetWindowScroll) resetWindowScroll(globalThis);
      const treeScroll = viewRoot.querySelector('.tree-scroll-direct, .tree-scroll-full');
      if (treeScroll) {
        positionTreeScroll(treeScroll, { preserve: options.preserveTreeScroll || state.treeMode === 'direct' && Boolean(treeModeSnapshots.direct), position: options.treeScrollPosition || treeModeSnapshots.direct });
      }
    }

    // Migration map: the range, arrows and playback move one generation at a
    // time; the readout and the list below the map follow the same step.
    function showMigrationStep(value) {
      if (!mapController?.setStep) return;
      const step = mapController.setStep(value);
      const range = viewRoot.querySelector('[data-migration-step]');
      const current = viewRoot.querySelector(`[data-migration-generation="${step}"]`);
      const label = current?.dataset.migrationLabel || '';
      if (range) {
        range.value = String(step);
        range.setAttribute('aria-valuetext', label);
      }
      const readout = viewRoot.querySelector('[data-migration-readout]');
      if (readout) readout.textContent = label;
      viewRoot.querySelectorAll('[data-migration-generation]').forEach((section) => section.classList.toggle('is-current', section === current));
    }

    function stopMigrationPlayback() {
      if (migrationTimer) globalThis.clearInterval(migrationTimer);
      migrationTimer = null;
      const play = viewRoot.querySelector('[data-migration-play]');
      if (play) {
        play.setAttribute('aria-pressed', 'false');
        play.textContent = 'Přehrát od nejstarších';
      }
    }

    function toggleMigrationPlayback(button) {
      if (migrationTimer) {
        stopMigrationPlayback();
        return;
      }
      if (!mapController?.setStep) return;
      button.setAttribute('aria-pressed', 'true');
      button.textContent = 'Zastavit';
      showMigrationStep(0);
      migrationTimer = globalThis.setInterval(() => {
        const next = mapController.getStep() + 1;
        if (next >= mapController.stepCount) {
          stopMigrationPlayback();
          return;
        }
        showMigrationStep(next);
      }, 1800);
    }

    // Film rodu: five years per step; the caption (and the optional Czech
    // voice of the browser) tells what happened in them.
    const FILM_STEP = 5;
    function czechVoice() {
      try {
        return globalThis.speechSynthesis?.getVoices?.().find((voice) => /^cs/i.test(voice.lang)) || null;
      } catch (_) {
        return null;
      }
    }
    function offerFilmVoice() {
      const wrap = viewRoot.querySelector('[data-film-voice-wrap]');
      if (!wrap || !globalThis.speechSynthesis) return;
      const update = () => { wrap.hidden = !czechVoice(); };
      update();
      globalThis.speechSynthesis.addEventListener?.('voiceschanged', update, { once: true });
    }
    function speak(text) {
      const voice = czechVoice();
      if (!voice || !viewRoot.querySelector('[data-film-voice]')?.checked) return;
      try {
        globalThis.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.voice = voice;
        utterance.lang = voice.lang;
        globalThis.speechSynthesis.speak(utterance);
      } catch (_) { /* narration is optional */ }
    }
    function showFilmYear(value, { narrate = false } = {}) {
      if (!film || !mapController?.setYear) return;
      const year = mapController.setYear(value, FILM_STEP);
      const range = viewRoot.querySelector('[data-film-year]');
      if (range) {
        range.value = String(year);
        range.setAttribute('aria-valuetext', String(year));
      }
      const readout = viewRoot.querySelector('[data-film-readout]');
      if (readout) readout.textContent = String(year);
      const caption = globalThis.RKFamilyViews?.filmCaption(data, film, year, FILM_STEP);
      const target = viewRoot.querySelector('[data-film-caption]');
      if (caption && target) target.innerHTML = caption.html;
      if (narrate && caption) speak(caption.text);
    }
    function stopFilm() {
      if (filmTimer) globalThis.clearTimeout(filmTimer);
      filmTimer = null;
      try { globalThis.speechSynthesis?.cancel?.(); } catch (_) { /* optional */ }
      const play = viewRoot.querySelector('[data-film-play]');
      if (play) {
        play.setAttribute('aria-pressed', 'false');
        play.textContent = 'Přehrát';
      }
    }
    function toggleFilm(button) {
      if (filmTimer) {
        stopFilm();
        return;
      }
      if (!film || !mapController?.setYear) return;
      button.setAttribute('aria-pressed', 'true');
      button.textContent = 'Zastavit';
      let year = mapController.getYear() >= film.to ? film.from : mapController.getYear();
      const tick = () => {
        showFilmYear(year, { narrate: true });
        if (year >= film.to) {
          filmTimer = null;
          stopFilm();
          return;
        }
        year = Math.min(film.to, year + FILM_STEP);
        const voiceOn = Boolean(viewRoot.querySelector('[data-film-voice]')?.checked && czechVoice());
        const delay = Number(viewRoot.querySelector('[data-film-speed]')?.value) || 1500;
        filmTimer = globalThis.setTimeout(tick, voiceOn ? Math.max(delay, 4500) : delay);
      };
      tick();
    }

    function restoreTreeFocus(personId) {
      const personButton = findVisibleTreePersonButton(viewRoot, personId);
      const target = personButton || viewRoot.querySelector('[data-focus-person]');
      if (!target || typeof target.focus !== 'function') return;
      try {
        target.focus({ preventScroll: true });
      } catch (_) {
        target.focus();
      }
    }

    function captureTreeModeSnapshot() {
      if (state.view !== 'tree') return;
      if (state.treeMode === 'full' && fullTreeController) treeModeSnapshots.full = fullTreeController.snapshot();
      if (state.treeMode === 'direct') {
        const scroll = viewRoot.querySelector('.tree-scroll-direct');
        treeModeSnapshots.direct = { left: Number(scroll?.scrollLeft || 0), top: Number(scroll?.scrollTop || 0), scale: state.treeScale };
      }
    }

    function handleTreeZoom(kind) {
      if (state.view === 'tree' && state.treeMode === 'full' && fullTreeController) {
        fullTreeController.zoom(kind);
        const output = viewRoot.querySelector('[data-tree-scale]');
        syncTreeScaleOutput(output, fullTreeController.snapshot().scale);
        treeModeSnapshots.full = fullTreeController.snapshot();
        return;
      }
      if (kind === 'fit') {
        // "Přizpůsobit" shows the whole pedigree at once, in both directions.
        const treeScroll = viewRoot.querySelector('.tree-scroll-direct');
        const viewBox = treeScroll?.querySelector('svg')?.getAttribute('viewBox')?.split(/\s+/).map(Number);
        const byHeight = viewBox?.[3] > 0 && treeScroll?.clientHeight > 0 ? treeScroll.clientHeight / viewBox[3] : Infinity;
        const fitScale = viewBox?.[2] > 0 && treeScroll?.clientWidth > 0 ? Math.floor(Math.min(treeScroll.clientWidth / viewBox[2], byHeight) * 100) : state.treeScale;
        dispatch({ type: 'SET_TREE_ZOOM', kind: 'fit', scale: fitScale }, '', { preserveTreeScroll: true });
        const fitted = viewRoot.querySelector('.tree-scroll-direct');
        if (fitted) {
          fitted.scrollLeft = 0;
          fitted.scrollTop = 0;
        }
      } else dispatch({ type: 'SET_TREE_ZOOM', kind }, '', { preserveTreeScroll: true });
    }

    // Until the reader picks a zoom level, the pedigree opens scaled to its canvas
    // (never below 70 %, so names stay readable; the rest is reached by scrolling
    // around the person) and the choice is not stored.
    let treeScaleChosen = false;
    try { treeScaleChosen = (globalThis.localStorage?.getItem(TREE_SCALE_KEY) ?? null) !== null; } catch (_) { /* Storage is optional. */ }
    function autoFitTree() {
      if (treeScaleChosen || state.view !== 'tree' || state.treeMode !== 'direct') return;
      const treeScroll = viewRoot.querySelector('.tree-scroll-direct');
      const viewBox = treeScroll?.querySelector('svg')?.getAttribute('viewBox')?.split(/\s+/).map(Number);
      if (!(viewBox?.[2] > 0) || !(treeScroll?.clientWidth > 0)) return;
      const byWidth = treeScroll.clientWidth / viewBox[2];
      // The pedigree grows downwards with every generation: fit its width and
      // let the reader scroll up and down around the person.
      const scale = Math.max(70, Math.min(100, Math.floor(byWidth * 100)));
      if (scale !== state.treeScale) dispatch({ type: 'SET_TREE_ZOOM', kind: 'fit', scale, auto: true });
      // When the whole pedigree fits, show it from the top.
      const fitted = viewRoot.querySelector('.tree-scroll-direct');
      const svg = fitted?.querySelector('svg');
      if (fitted && svg && Number(svg.getAttribute('height')) <= fitted.clientHeight) fitted.scrollTop = 0;
    }
    const AUTO_FIT_ACTIONS = new Set(['NAVIGATE', 'FOCUS_PERSON', 'SET_EGO', 'SET_TREE_GENERATIONS', 'SET_TREE_MODE']);

    function dispatch(action, announcement = '', options = {}) {
      captureTreeModeSnapshot();
      const shouldPreserveTreeScroll = action.type === 'SET_TREE_SELECTION' || action.type === 'CLEAR_TREE_SELECTION' || options.preserveTreeScroll;
      const treeScroll = shouldPreserveTreeScroll ? viewRoot.querySelector('.tree-scroll-direct, .tree-scroll-full') : null;
      const treeScrollPosition = treeScroll ? { left: treeScroll.scrollLeft, top: treeScroll.scrollTop } : null;
      state = reduceState(state, action);
      if (action.type === 'FOCUS_PERSON') {
        treeModeSnapshots.direct = null;
        treeModeSnapshots.full = null;
      }
      if (action.type === 'SET_TREE_MODE' && state.treeMode === 'direct' && Number.isFinite(Number(treeModeSnapshots.direct?.scale))) {
        state.treeScale = treeModeSnapshots.direct.scale;
      }
      try {
        if (action.type === 'SET_TREE_GENERATIONS') {
          globalThis.localStorage?.setItem(TREE_GENERATIONS_KEY, String(state.treeGenerations));
          globalThis.localStorage?.setItem(TREE_GENERATIONS_VERSION_KEY, TREE_GENERATIONS_VERSION);
        }
        if (action.type === 'SET_TREE_ZOOM' && !action.auto) {
          treeScaleChosen = true;
          globalThis.localStorage?.setItem(TREE_SCALE_KEY, String(state.treeScale));
        }
        if (action.type === 'SET_EGO') globalThis.localStorage?.setItem(EGO_PERSON_KEY, state.egoPersonId);
      } catch (_) {
        // Presentation preference persistence is optional.
      }
      if (action.type === 'SET_EGO') renderEgoPicker();
      renderCurrentView({ preserveTreeScroll: shouldPreserveTreeScroll, treeScrollPosition, fullTreeSnapshot: treeModeSnapshots.full, focusHeading: action.type === 'NAVIGATE', resetWindowScroll: action.type === 'NAVIGATE', animate: action.type === 'NAVIGATE' });
      if (options.restoreTreeFocus) restoreTreeFocus(options.restoreTreeFocus);
      if (AUTO_FIT_ACTIONS.has(action.type)) globalThis.requestAnimationFrame?.(autoFitTree);
      if (announcement) liveRegion.textContent = announcement;
    }

    function closeDialog() {
      if (dialog.open && typeof dialog.close === 'function') dialog.close();
      state = { ...state, detail: null };
      const returnFocus = dialogReturnFocus;
      dialogReturnFocus = null;
      try { returnFocus?.focus?.({ preventScroll: true }); } catch (_) { returnFocus?.focus?.(); }
    }

    function openDetail(type, id, renderer, title, announcement) {
      if (typeof renderer !== 'function') return;
      dialogReturnFocus = preserveDialogReturnFocus(Boolean(dialog.open), dialogReturnFocus, document.activeElement);
      dialogBody.innerHTML = renderer(data, id);
      const dialogFrame = dialog.querySelector('.dialog-frame');
      if (dialogFrame) dialogFrame.scrollTop = 0;
      dialog.scrollTop = 0;
      dialog.setAttribute('aria-labelledby', 'detail-dialog-title');
      document.getElementById('detail-dialog-title').textContent = title;
      state = { ...state, detail: { type, id } };
      if (shouldShowModal(dialog)) dialog.showModal();
      const focusTarget = dialog.querySelector('[data-detail-autofocus], [data-close-dialog]') || document.getElementById('detail-dialog-title');
      focusTarget?.setAttribute?.('tabindex', '-1');
      try { focusTarget?.focus?.({ preventScroll: true }); } catch (_) { focusTarget?.focus?.(); }
      liveRegion.textContent = announcement;
    }

    function openPerson(personId, options = {}) {
      const person = RKModel.getPerson(data, personId);
      if (!person) return;
      const renderer = (source, id) => RKViews.renderPersonDetail(source, id, { showTreeFocusAction: Boolean(options.fromTree), egoPersonId: state.egoPersonId, openFeedback: Boolean(options.openFeedback) });
      openDetail('person', personId, renderer, `Profil: ${person.displayName}`, `Otevřen profil: ${person.displayName}`);
      globalThis.RKFamilyViews?.drawRegionThumbs?.(dialogBody, data);
    }

    function sendFeedback(form, channel) {
      if (!form) return;
      const message = RKComponents.feedbackMessage({
        topic: form.dataset.feedbackTopic,
        context: form.dataset.feedbackContext,
        text: form.querySelector('[data-feedback-text]')?.value || '',
        name: form.querySelector('[data-feedback-name]')?.value || '',
        edition: document.documentElement.dataset.artifactVersion || '',
        kind: form.querySelector('[data-feedback-kind]')?.value || '',
        subject: form.dataset.feedbackSubject || '',
      });
      const links = RKComponents.feedbackLinks(form.dataset.feedbackEmail, message);
      const status = form.querySelector('[data-feedback-status]');
      if (channel === 'copy') {
        const done = () => { if (status) status.textContent = `Zpráva je zkopírovaná. Vložte ji do e-mailu (Ctrl+V) a pošlete na ${form.dataset.feedbackEmail}.`; };
        const fallback = () => {
          const area = document.createElement('textarea');
          area.value = links.copy;
          document.body.appendChild(area);
          area.select();
          try { document.execCommand('copy'); done(); } catch (_) { if (status) status.textContent = 'Kopírování se nepodařilo; označte text zprávy a zkopírujte jej ručně.'; }
          area.remove();
        };
        if (navigator.clipboard?.writeText) navigator.clipboard.writeText(links.copy).then(done, fallback);
        else fallback();
        return;
      }
      if (channel === 'gmail') globalThis.open(links.gmail, '_blank', 'noopener');
      else globalThis.location.href = links.mailto;
      if (status) status.textContent = channel === 'gmail'
        ? 'Gmail se otevřel v nové kartě; zprávu tam zkontrolujte a odešlete.'
        : `Pokud se e-mail neotevřel, použijte „Zkopírovat zprávu“ a pošlete ji na ${form.dataset.feedbackEmail}.`;
    }

    function openSource(sourceId) {
      const source = data.sources.find((item) => item.id === sourceId);
      if (!source || !RKViews.renderSourceDetail) return;
      openDetail('source', sourceId, RKViews.renderSourceDetail, `Pramen: ${source.title}`, `Otevřen pramen: ${source.title}`);
      const editor = dialogBody.querySelector('[data-region-editor]');
      if (editor) globalThis.RKResearchViews?.mountRegionEditor?.(dialogBody, data, editor.dataset.regionEditor);
    }

    function openPlace(placeId) {
      const place = data.places.find((item) => item.id === placeId);
      if (!place || !RKViews.renderPlaceDetail) return;
      openDetail('place', placeId, RKViews.renderPlaceDetail, `Místo: ${place.name}`, `Otevřeno místo: ${place.name}`);
    }

    function openEvent(eventId) {
      const event = data.events.find((item) => item.id === eventId);
      if (!event || !RKViews.renderEventDetail) return;
      openDetail('event', eventId, RKViews.renderEventDetail, `Událost: ${event.title}`, `Otevřena událost: ${event.title}`);
    }

    function openClaim(claimId) {
      const claim = data.claims.find((item) => item.id === claimId);
      if (!claim || !RKViews.renderClaimDetail) return;
      openDetail('claim', claimId, RKViews.renderClaimDetail, 'Tvrzení a odůvodnění', 'Otevřeno tvrzení');
    }

    function openMedia(mediaId) {
      const media = data.media.find((item) => item.id === mediaId);
      if (!media || !RKViews.renderMediaDetail) return;
      openDetail('media', mediaId, RKViews.renderMediaDetail, `Médium: ${media.title}`, `Otevřeno médium: ${media.title}`);
      globalThis.RKResearchViews?.mountRegionEditor?.(dialogBody, data, mediaId);
    }

    // "Jak jsou příbuzní?": two pickers, the result updates in place.
    function openKinship(aId, bId) {
      const views = globalThis.RKFamilyViews;
      if (!views) return;
      openDetail('kinship', 'calculator', () => views.renderKinshipCalculator(data, { aId, bId }), 'Jak jsou příbuzní?', 'Otevřeno porovnání příbuzenství');
    }

    function updateKinship() {
      const views = globalThis.RKFamilyViews;
      const calculator = dialogBody.querySelector('[data-kinship-calculator]');
      if (!views || !calculator) return;
      const pick = (selector) => RKComponents.resolvePersonPick(data.people, calculator.querySelector(selector)?.value || '', data.relationships) || '';
      calculator.querySelector('[data-kinship-result]').innerHTML = views.renderKinshipResult(data, pick('[data-kinship-a]'), pick('[data-kinship-b]'));
    }

    function openResearchTask(taskId) {
      const task = data.researchTasks.find((item) => item.id === taskId);
      if (!task || !RKViews.renderResearchTaskDetail) return;
      openDetail('research', taskId, RKViews.renderResearchTaskDetail, `Úkol: ${task.title}`, `Otevřen výzkumný úkol: ${task.title}`);
    }

    document.addEventListener('click', (event) => {
      const clickedGroup = event.target.closest?.('.nav-menu-group');
      if (!clickedGroup && navigationState.openGroup) setNavigationState({ type: 'OUTSIDE_CLICK' });
      const navGroupTrigger = event.target.closest?.('[data-nav-group-trigger]');
      if (navGroupTrigger) {
        setNavigationState({ type: 'TRIGGER_CLICK', group: navGroupTrigger.dataset.navGroupTrigger });
        return;
      }
      const feedbackSend = event.target.closest('[data-feedback-send]');
      if (feedbackSend) {
        sendFeedback(feedbackSend.closest('[data-feedback]'), feedbackSend.dataset.feedbackSend);
        return;
      }
      const answer = event.target.closest('[data-question-answer]');
      if (answer) {
        const form = answer.closest('.person-detail')?.querySelector('details.feedback');
        if (form) {
          form.open = true;
          const text = form.querySelector('[data-feedback-text]');
          if (text) text.value = `Otázka: ${answer.dataset.questionAnswer}\nOdpověď: `;
          text?.focus();
          text?.setSelectionRange?.(text.value.length, text.value.length);
        }
        return;
      }
      const unknownRegion = event.target.closest('[data-region-unknown]');
      if (unknownRegion) {
        const form = unknownRegion.closest('.media-detail, .source-detail')?.querySelector('details.feedback');
        if (form) {
          form.open = true;
          const text = form.querySelector('[data-feedback-text]');
          if (text && !text.value) text.value = `Na fotografii je v označeném místě (${unknownRegion.dataset.regionUnknown}): `;
          text?.focus();
        }
        return;
      }
      const kinshipOpen = event.target.closest('[data-open-kinship]');
      if (kinshipOpen) {
        openKinship(kinshipOpen.dataset.kinshipA || state.egoPersonId, kinshipOpen.dataset.kinshipB || '');
        return;
      }
      const clipWord = event.target.closest('[data-word-time]');
      if (clipWord) {
        const audio = clipWord.closest('[data-audio-clip]')?.querySelector('audio');
        if (audio) {
          audio.currentTime = Number(clipWord.dataset.wordTime) || 0;
          audio.play?.()?.catch?.(() => {});
        }
        return;
      }
      const generalFeedback = event.target.closest('[data-open-feedback]');
      if (generalFeedback) {
        openDetail('feedback', 'general', () => `<div class="feedback-page"><h2>Napsat správci kroniky</h2>${RKComponents.feedbackForm(data, { topic: 'obecná zpráva', context: ['Obecná zpráva ke kronice'] }).replace('<details class="feedback"', '<details class="feedback" open')}</div>`, 'Napsat správci kroniky', 'Otevřen formulář pro zprávu správci');
        return;
      }
      const printButton = event.target.closest('[data-print]');
      if (printButton) {
        // A print started from the profile dialog prints only that profile.
        const fromDialog = Boolean(printButton.closest('dialog'));
        document.documentElement.classList.toggle('print-detail', fromDialog);
        globalThis.addEventListener('afterprint', () => document.documentElement.classList.remove('print-detail'), { once: true });
        globalThis.print?.();
        return;
      }
      const timelineMode = event.target.closest('[data-timeline-mode]');
      if (timelineMode) {
        const mode = timelineMode.dataset.timelineMode;
        dispatch({ type: 'SET_TIMELINE_MODE', mode }, mode === 'lives' ? 'Časová osa ukazuje životy vedle sebe' : 'Časová osa ukazuje události');
        viewRoot.querySelector(`[data-timeline-mode="${mode}"]`)?.focus();
        return;
      }
      const placesMode = event.target.closest('[data-places-mode]');
      if (placesMode) {
        const mode = placesMode.dataset.placesMode;
        dispatch({ type: 'SET_PLACES_MODE', mode }, mode === 'migration' ? 'Mapa ukazuje stěhování rodu po generacích' : mode === 'film' ? 'Mapa ukazuje film rodu po letech' : 'Mapa ukazuje všechna místa');
        viewRoot.querySelector(`[data-places-mode="${mode}"]`)?.focus();
        return;
      }
      const migrationNav = event.target.closest('[data-migration-nav]');
      if (migrationNav && mapController?.setStep) {
        stopMigrationPlayback();
        showMigrationStep(mapController.getStep() + Number(migrationNav.dataset.migrationNav));
        return;
      }
      const filmPlay = event.target.closest('[data-film-play]');
      if (filmPlay) {
        toggleFilm(filmPlay);
        return;
      }
      const migrationPlay = event.target.closest('[data-migration-play]');
      if (migrationPlay) {
        toggleMigrationPlayback(migrationPlay);
        return;
      }
      const treeZoom = event.target.closest('[data-tree-zoom]');
      if (treeZoom) {
        handleTreeZoom(treeZoom.dataset.treeZoom);
        return;
      }
      const treeMode = event.target.closest('[data-tree-mode]');
      if (treeMode) {
        dispatch({ type: 'SET_TREE_MODE', mode: treeMode.dataset.treeMode });
        return;
      }
      const fullTreeAction = event.target.closest('[data-full-tree-action]');
      if (fullTreeAction && fullTreeController) {
        const action = fullTreeAction.dataset.fullTreeAction;
        const activeController = fullTreeController;
        let operation;
        if (action === 'paternal' || action === 'maternal') operation = activeController.expandSide(action);
        else if (action === 'expand-all') operation = activeController.expandAll();
        else if (action === 'reset') operation = activeController.reset();
        else if (action === 'fit') activeController.fit();
        treeModeSnapshots.full = activeController.snapshot();
        void Promise.resolve(operation).then(() => {
          if (fullTreeController !== activeController) return;
          treeModeSnapshots.full = activeController.snapshot();
          syncParentSideActions(treeModeSnapshots.full.parentSide);
          syncTreeScaleOutput(viewRoot.querySelector('[data-tree-scale]'), treeModeSnapshots.full.scale);
        });
        return;
      }
      const nav = event.target.closest('[data-view]');
      if (nav) {
        if (nav.closest('.nav-dropdown')) setNavigationState({ type: 'SELECT_ITEM' });
        dispatch({ type: 'NAVIGATE', view: nav.dataset.view }, `Otevřen pohled ${nav.textContent.trim()}`);
        if (nav.dataset.evidenceFilter) dispatch({ type: 'SET_FILTER', name: 'evidence', value: nav.dataset.evidenceFilter });
        return;
      }
      const interaction = resolveClickInteraction(event.target);
      if (interaction) {
        event.preventDefault();
        if (interaction.kind === 'reset-filters') dispatch({ type: 'RESET_FILTERS' }, 'Filtry zrušeny');
        else if (interaction.kind === 'clear-filter') dispatch({ type: 'CLEAR_FILTER', name: interaction.name }, 'Filtr zrušen');
        else if (interaction.type === 'person') openPerson(interaction.id);
        else if (interaction.type === 'source') openSource(interaction.id);
        else if (interaction.type === 'place') openPlace(interaction.id);
        else if (interaction.type === 'event') openEvent(interaction.id);
        else if (interaction.type === 'claim') openClaim(interaction.id);
        else if (interaction.type === 'media') openMedia(interaction.id);
        else if (interaction.type === 'research') openResearchTask(interaction.id);
        return;
      }
      const setTreeFocus = event.target.closest('[data-tree-set-focus]');
      if (setTreeFocus) {
        const personRecord = RKModel.getPerson(data, setTreeFocus.dataset.treeSetFocus);
        if (personRecord) setTreeFocusFromDetail(personRecord.id, personRecord.displayName, dialog.open, closeDialog, dispatch);
        return;
      }
      const person = event.target.closest('[data-person-id]');
      if (person) {
        if (person.closest('.tree-view')) {
          const personRecord = RKModel.getPerson(data, person.dataset.personId);
          if (personRecord) activateTreePerson(personRecord.id, personRecord.displayName, dispatch, openTreePersonBubble);
        } else {
          openPerson(person.dataset.personId);
        }
        return;
      }
      const source = event.target.closest('[data-source-id]');
      if (source) {
        openSource(source.dataset.sourceId);
        return;
      }
      const place = event.target.closest('[data-place-id]');
      if (place) {
        openPlace(place.dataset.placeId);
        return;
      }
      const media = event.target.closest('[data-media-id]');
      if (media) {
        openMedia(media.dataset.mediaId);
        return;
      }
      const evidence = event.target.closest('[data-evidence-filter]');
      if (evidence) {
        dispatch({ type: 'SET_FILTER', name: 'evidence', value: evidence.dataset.evidenceFilter });
        return;
      }
      const close = event.target.closest('[data-close-dialog]');
      if (close) {
        closeDialog();
      }
    });

    // Interview transcripts follow the recording word by word.
    document.addEventListener('timeupdate', (event) => {
      const audio = event.target;
      const words = audio?.closest?.('[data-audio-clip]')?.querySelectorAll('[data-word-time]');
      if (!words?.length) return;
      let current = null;
      for (const word of words) {
        if (Number(word.dataset.wordTime) <= audio.currentTime) current = word;
        else break;
      }
      for (const word of words) word.classList.toggle('is-current', word === current);
    }, true);

    document.addEventListener('change', (event) => {
      const regionToggle = event.target.closest?.('[data-region-toggle]');
      if (regionToggle) {
        regionToggle.closest('.media-figure')?.classList.toggle('has-regions', regionToggle.checked);
        return;
      }
      if (event.target.closest?.('[data-kinship-a], [data-kinship-b]')) {
        updateKinship();
        return;
      }
      const filter = event.target.closest('[data-filter]');
      if (filter) dispatch({ type: 'SET_FILTER', name: filter.dataset.filter, value: filter.value });
      const treeGenerations = event.target.closest('[data-tree-generations]');
      if (treeGenerations) dispatch({ type: 'SET_TREE_GENERATIONS', count: treeGenerations.value });
      const focusPerson = event.target.closest('[data-focus-person]');
      const focusPersonId = focusPerson && RKComponents.resolvePersonPick(data.people, focusPerson.value, data.relationships);
      if (focusPersonId) dispatch({ type: 'FOCUS_PERSON', personId: focusPersonId }, `Rodokmen zaměřen na ${RKModel.getPerson(data, focusPersonId).displayName}`);
      const migrationPerson = event.target.closest('[data-migration-person]');
      const migrationPersonId = migrationPerson && RKComponents.resolvePersonPick(data.people, migrationPerson.value, data.relationships);
      if (migrationPersonId) {
        dispatch({ type: 'SET_MIGRATION_PERSON', personId: migrationPersonId }, `Mapa ukazuje předky osoby ${RKModel.getPerson(data, migrationPersonId).displayName}`);
        viewRoot.querySelector('[data-migration-person]')?.focus();
      }
      const egoPerson = event.target.closest('[data-ego-person]');
      const egoPersonId = egoPerson && RKComponents.resolvePersonPick(data.people, egoPerson.value, data.relationships);
      if (egoPersonId) {
        const fromOverview = Boolean(egoPerson.closest('[data-overview-ego]'));
        dispatch({ type: 'SET_EGO', personId: egoPersonId }, `Příbuzenské vztahy se nyní počítají vzhledem k osobě ${RKModel.getPerson(data, egoPersonId).displayName}`);
        if (fromOverview) dispatch({ type: 'NAVIGATE', view: 'tree' });
      }
    });

    // Selecting the whole value lets the picker list every person on the next keystroke.
    document.addEventListener('focusin', (event) => {
      const picker = event.target.closest?.('[data-person-picker]');
      if (picker && typeof picker.select === 'function') picker.select();
    });

    document.addEventListener('input', (event) => {
      const filmYear = event.target.closest?.('[data-film-year]');
      if (filmYear) {
        stopFilm();
        showFilmYear(filmYear.value);
        return;
      }
      const migrationStep = event.target.closest?.('[data-migration-step]');
      if (!migrationStep) return;
      stopMigrationPlayback();
      showMigrationStep(migrationStep.value);
    });

    search.addEventListener('input', () => {
      dispatch({ type: 'SET_QUERY', query: search.value });
    });

    document.addEventListener('submit', (event) => {
      const overviewSearch = event.target.closest('[data-overview-search]');
      if (!overviewSearch) return;
      event.preventDefault();
      const proxy = overviewSearch.querySelector('[data-global-search-proxy]');
      if (!proxy) return;
      search.value = proxy.value;
      dispatch({ type: 'SET_QUERY', query: proxy.value }, `Hledání: ${proxy.value}`);
      search.focus();
    });

    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) {
        closeDialog();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && bubbleState && !dialog.open) {
        event.preventDefault();
        closeBubble();
        return;
      }
      if (event.key === 'Escape' && dialog.open) {
        event.preventDefault();
        closeDialog();
        return;
      }
      const navGroupTrigger = event.target.closest?.('[data-nav-group-trigger]');
      const navMenuItem = event.target.closest?.('.nav-dropdown [role="menuitem"]');
      if (navGroupTrigger) {
        const groupKey = navGroupTrigger.dataset.navGroupTrigger;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          setNavigationState({ type: 'TRIGGER_CLICK', group: groupKey });
          return;
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          setNavigationState({ type: 'FOCUS_OPEN', group: groupKey });
          focusMenuItem(groupKey, event.key === 'ArrowDown' ? 0 : menuItems(groupKey).length - 1);
          return;
        }
        if (event.key === 'Escape' && navigationState.openGroup === groupKey) {
          event.preventDefault();
          setNavigationState({ type: 'ESCAPE' }, groupKey);
          return;
        }
      }
      if (navMenuItem) {
        const groupKey = navMenuItem.closest('.nav-menu-group')?.dataset.navGroup;
        const items = menuItems(groupKey);
        const index = items.indexOf(navMenuItem);
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          focusMenuItem(groupKey, (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length);
          return;
        }
        if (event.key === 'Home' || event.key === 'End') {
          event.preventDefault();
          focusMenuItem(groupKey, event.key === 'Home' ? 0 : items.length - 1);
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          setNavigationState({ type: 'ESCAPE' }, groupKey);
          return;
        }
      }
      if (event.key === 'Escape' && navigationState.openGroup) {
        const openGroup = navigationState.openGroup;
        setNavigationState({ type: 'ESCAPE' }, openGroup);
        return;
      }
      if (event.key === '/' && document.activeElement !== search) {
        event.preventDefault();
        search.focus();
      }
    });

    globalThis.addEventListener?.('hashchange', () => {
      const nextView = viewFromHash(globalThis.location.hash);
      if (nextView !== state.view) dispatch({ type: 'NAVIGATE', view: nextView });
    });

    renderCurrentView({ animate: true });
    globalThis.requestAnimationFrame?.(autoFitTree);
    return { getState: () => ({ ...state }), dispatch, openPerson, openSource, openPlace, openEvent, openClaim, openMedia, openResearchTask, closeDialog, destroy() { mapController?.destroy(); fullTreeController?.destroy(); } };
  }

  return { createInitialState, reduceState, viewFromHash, getNavigationModel, createNavigationState, reduceNavigationState, getNavigationActivity, init, findVisibleTreePersonButton, resetWindowScroll, positionTreeScroll, preserveDialogReturnFocus, activateTreePerson, setTreeFocusFromDetail, shouldShowModal, createTreePanGesture, resolveInteraction, resolveClickInteraction, clampTreeGenerations, clampTreeScale, clampFitTreeScale, readTreeGenerations, readTreeScale, syncTreeScaleOutput };
});
