(function registerFullTree(root, factory) {
  const presentation = typeof module === 'object' && module.exports ? require('./presentation.js') : root.RKPresentation;
  const components = typeof module === 'object' && module.exports ? require('./components.js') : root.RKComponents;
  const api = factory(presentation, components);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.RKFullTree = api;
})(globalThis, function createFullTree(RKPresentation, RKComponents) {
  'use strict';

  const RELATION_TYPES = new Set(['parent-child', 'spouse', 'sibling']);

  function stableKey(prefix, ids) {
    return `${prefix}:${ids.slice().sort().map((id) => encodeURIComponent(id)).join('|')}`;
  }

  function buildGraph(data = {}, focusId) {
    const people = (Array.isArray(data.people) ? data.people : []).filter((person) => person && typeof person.id === 'string')
      .map((person) => ({ ...person }));
    const peopleById = new Map(people.map((person) => [person.id, person]));
    const relationships = (Array.isArray(data.relationships) ? data.relationships : []).filter((edge) => edge
      && RELATION_TYPES.has(edge.type) && peopleById.has(edge.from) && peopleById.has(edge.to))
      .map((edge, index) => ({ ...edge, id: typeof edge.id === 'string' && edge.id ? edge.id : `relationship-${index}` }));
    const parentIdsByChild = new Map();
    const childrenByParent = new Map();
    const siblingIdsByPerson = new Map();
    for (const edge of relationships) {
      if (edge.type === 'parent-child') {
        if (!parentIdsByChild.has(edge.to)) parentIdsByChild.set(edge.to, new Set());
        parentIdsByChild.get(edge.to).add(edge.from);
        if (!childrenByParent.has(edge.from)) childrenByParent.set(edge.from, new Set());
        childrenByParent.get(edge.from).add(edge.to);
      } else if (edge.type === 'sibling') {
        if (!siblingIdsByPerson.has(edge.from)) siblingIdsByPerson.set(edge.from, new Set());
        if (!siblingIdsByPerson.has(edge.to)) siblingIdsByPerson.set(edge.to, new Set());
        siblingIdsByPerson.get(edge.from).add(edge.to);
        siblingIdsByPerson.get(edge.to).add(edge.from);
      }
    }

    const familyChildrenByParents = new Map();
    for (const child of people) {
      const parents = [...(parentIdsByChild.get(child.id) || [])].sort();
      if (!parents.length) continue;
      const key = JSON.stringify(parents);
      if (!familyChildrenByParents.has(key)) familyChildrenByParents.set(key, { parents, children: [] });
      familyChildrenByParents.get(key).children.push(child.id);
    }
    const families = [...familyChildrenByParents.values()].map(({ parents, children }) => ({
      id: stableKey('family', parents),
      kind: 'parents',
      parentIds: parents,
      childIds: children,
      personIds: [...new Set([...parents, ...children])],
    }));

    const siblingFamilies = new Map();
    function getSiblingFamily(pair) {
      const ids = [...pair].sort();
      const id = stableKey('sibling', ids);
      if (!siblingFamilies.has(id)) {
        const family = { id, kind: 'siblings', parentIds: [], childIds: [], personIds: ids, relationshipIds: [], sharedParentIds: [] };
        siblingFamilies.set(id, family);
        families.push(family);
      }
      return siblingFamilies.get(id);
    }

    // One pair-family groups all shared-parent evidence for that pair and
    // keeps half-siblings directly expandable without transitive closure.
    for (const [parentId, childIds] of childrenByParent) {
      const siblingIds = [...childIds];
      for (let left = 0; left < siblingIds.length; left += 1) {
        for (let right = left + 1; right < siblingIds.length; right += 1) {
          const pair = [siblingIds[left], siblingIds[right]];
          const family = getSiblingFamily(pair);
          family.sharedParentIds.push(parentId);
        }
      }
    }

    for (const edge of relationships) {
      if (edge.type === 'sibling') getSiblingFamily([edge.from, edge.to]).relationshipIds.push(edge.id);
      else if (edge.type === 'spouse') families.push({
        id: stableKey('spouse', [edge.id]), kind: 'spouses', parentIds: [], childIds: [], personIds: [edge.from, edge.to], relationshipId: edge.id,
      });
    }

    const adjacency = new Map(people.map((person) => [person.id, new Set()]));
    for (const edge of relationships) {
      adjacency.get(edge.from).add(edge.to);
      adjacency.get(edge.to).add(edge.from);
    }
    const componentByPerson = new Map();
    let componentIndex = 0;
    for (const person of people) {
      if (componentByPerson.has(person.id)) continue;
      const queue = [person.id];
      componentByPerson.set(person.id, componentIndex);
      while (queue.length) {
        const current = queue.pop();
        for (const neighbor of adjacency.get(current)) {
          if (componentByPerson.has(neighbor)) continue;
          componentByPerson.set(neighbor, componentIndex);
          queue.push(neighbor);
        }
      }
      componentIndex += 1;
    }

    const core = new Set();
    const focus = peopleById.has(focusId) ? focusId : people[0]?.id;
    function addAncestors(seed) {
      const queue = [{ id: seed, depth: 0 }];
      while (queue.length) {
        const { id: child, depth } = queue.shift();
        if (core.has(child)) continue;
        core.add(child);
        if (depth < 2) for (const parent of parentIdsByChild.get(child) || []) queue.push({ id: parent, depth: depth + 1 });
      }
    }
    if (focus) addAncestors(focus);

    const siblingByPerson = new Map(people.map((person) => [person.id, new Set(siblingIdsByPerson.get(person.id) || [])]));
    const childrenByParentWithPeople = new Map();
    for (const [child, parents] of parentIdsByChild) {
      for (const parent of parents) {
        if (!childrenByParentWithPeople.has(parent)) childrenByParentWithPeople.set(parent, []);
        childrenByParentWithPeople.get(parent).push(child);
      }
    }
    for (const children of childrenByParentWithPeople.values()) {
      for (const child of children) for (const sibling of children) if (sibling !== child) siblingByPerson.get(child).add(sibling);
    }
    // Siblings of the focus and its known ancestors belong to the starting
    // context. The snapshot is deliberately taken before adding descendants.
    for (const current of [...core]) for (const sibling of siblingByPerson.get(current) || []) core.add(sibling);
    if (focus) {
      const focusChildren = childrenByParent.get(focus) || new Set();
      for (const child of focusChildren) {
        core.add(child);
        for (const parent of parentIdsByChild.get(child) || []) core.add(parent);
      }
      for (const edge of relationships) {
        if (edge.type === 'spouse' && (edge.from === focus || edge.to === focus)) core.add(edge.from === focus ? edge.to : edge.from);
      }
    }
    const componentPeople = new Map();
    for (const person of people) {
      const component = componentByPerson.get(person.id);
      if (!componentPeople.has(component)) componentPeople.set(component, []);
      componentPeople.get(component).push(person);
    }
    const seenComponents = new Set([...core].map((id) => componentByPerson.get(id)));
    for (const [component, members] of componentPeople) {
      if (seenComponents.has(component)) continue;
      const roots = members.filter((person) => !(parentIdsByChild.get(person.id)?.size));
      core.add((roots[0] || members[0]).id);
      seenComponents.add(component);
    }

    return {
      focusId: focus || null,
      people,
      peopleById,
      relationships,
      families,
      parentIdsByChild,
      childrenByParent,
      componentByPerson,
      basePersonIds: [...core],
    };
  }

  function isExpanded(expanded, key) {
    if (expanded instanceof Set) return expanded.has(key);
    if (Array.isArray(expanded)) return expanded.includes(key);
    return Boolean(expanded && expanded[key]);
  }

  function getVisibleGraph(graph, state = {}) {
    if (!graph) return { people: [], relationships: [], families: [], controls: [], visiblePersonIds: new Set() };
    const expanded = state.expandAll ? getAllExpansionKeys(graph) : state.expanded || {};
    const visible = new Set(state.expandAll ? graph.people.map((person) => person.id) : graph.basePersonIds);
    let changed = true;
    while (changed) {
      changed = false;
      const add = (id) => {
        if (visible.has(id)) return;
        visible.add(id);
        changed = true;
      };
      for (const family of graph.families) {
        if (family.kind === 'siblings' || family.kind === 'spouses') {
          const direction = family.kind === 'siblings' ? 'siblings' : 'spouses';
          if (isExpanded(expanded, `${family.id}:${direction}`) && family.personIds.some((id) => visible.has(id))) family.personIds.forEach(add);
          continue;
        }
        if (isExpanded(expanded, `${family.id}:parents`) && family.childIds.some((id) => visible.has(id))) family.parentIds.forEach(add);
        if (isExpanded(expanded, `${family.id}:children`) && family.parentIds.some((id) => visible.has(id))) {
          family.childIds.forEach(add);
          // These are the exact co-parents recorded for this parent-set group.
          family.parentIds.forEach(add);
        }
      }
    }
    const people = graph.people.filter((person) => visible.has(person.id));
    const relationships = graph.relationships.filter((edge) => visible.has(edge.from) && visible.has(edge.to));
    const families = graph.families.filter((family) => family.personIds.some((id) => visible.has(id)));
    const controls = [];
    {
      for (const family of families) {
        if (family.kind === 'siblings' || family.kind === 'spouses') {
          const hidden = family.personIds.filter((id) => !visible.has(id));
          const direction = family.kind === 'siblings' ? 'siblings' : 'spouses';
          const key = `${family.id}:${direction}`;
          const open = isExpanded(expanded, key);
          if (hidden.length || open) controls.push({ familyId: family.id, direction, key, count: open ? family.personIds.length : hidden.length, expanded: open, personIds: family.personIds });
          continue;
        }
        const hiddenParents = family.parentIds.filter((id) => !visible.has(id));
        const parentsOpen = isExpanded(expanded, `${family.id}:parents`);
        if (family.childIds.some((id) => visible.has(id)) && (hiddenParents.length || parentsOpen)) controls.push({
          familyId: family.id, direction: 'parents', key: `${family.id}:parents`, count: parentsOpen ? family.parentIds.length : hiddenParents.length, expanded: parentsOpen, personIds: family.parentIds,
        });
        const hiddenChildren = family.childIds.filter((id) => !visible.has(id));
        const childrenOpen = isExpanded(expanded, `${family.id}:children`);
        if (family.parentIds.some((id) => visible.has(id)) && (hiddenChildren.length || childrenOpen)) controls.push({
          familyId: family.id, direction: 'children', key: `${family.id}:children`, count: childrenOpen ? family.childIds.length : hiddenChildren.length, expanded: childrenOpen, personIds: family.childIds,
        });
      }
    }
    return { people, relationships, families, controls, visiblePersonIds: visible, componentByPerson: graph.componentByPerson, focusId: graph.focusId };
  }

  function getParentSides(data, focusId = data?.focusId) {
    const people = data?.peopleById || new Map((data?.people || []).map((person) => [person.id, person]));
    const sides = { paternal: [], maternal: [] };
    for (const edge of data?.relationships || []) {
      if (edge.type !== 'parent-child' || edge.to !== focusId || !people.has(edge.from)) continue;
      const sex = people.get(edge.from).sex;
      const side = sex === 'male' ? 'paternal' : sex === 'female' ? 'maternal' : null;
      if (side && !sides[side].includes(edge.from)) sides[side].push(edge.from);
    }
    sides.paternal.sort(); sides.maternal.sort();
    return sides;
  }

  function getSideExpansionKeys(graph, side) {
    const roots = getParentSides(graph)[side];
    if (!roots?.length) return null;
    const ancestors = new Set();
    const upstream = [...roots];
    while (upstream.length) {
      const id = upstream.pop();
      if (ancestors.has(id)) continue;
      ancestors.add(id);
      upstream.push(...(graph.parentIdsByChild.get(id) || []));
    }
    const recordedSiblings = new Map();
    for (const edge of graph.relationships) {
      if (edge.type !== 'sibling') continue;
      for (const [from, to] of [[edge.from, edge.to], [edge.to, edge.from]]) {
        if (!recordedSiblings.has(from)) recordedSiblings.set(from, new Set());
        recordedSiblings.get(from).add(to);
      }
    }
    // Only the chosen parent's ancestry is followed upwards. Descendants
    // and explicitly recorded siblings form its collateral branches;
    // partners and exact co-parents are included as family context, without
    // following their separate origins or assigning them invented parents.
    const relatives = new Set();
    const downstream = [...ancestors];
    while (downstream.length) {
      const id = downstream.pop();
      if (relatives.has(id)) continue;
      relatives.add(id);
      downstream.push(...(graph.childrenByParent.get(id) || []));
      for (const sibling of recordedSiblings.get(id) || []) {
        const sharedParents = [...(graph.parentIdsByChild.get(id) || [])].filter((parent) => graph.parentIdsByChild.get(sibling)?.has(parent));
        if (sharedParents.length && !sharedParents.some((parent) => ancestors.has(parent) || relatives.has(parent))) continue;
        downstream.push(sibling);
      }
    }
    return collectExpansionKeys(graph, (family, direction) => {
      if (direction === 'parents') return family.childIds.some((id) => ancestors.has(id));
      if (direction === 'children') return family.parentIds.some((id) => relatives.has(id));
      if (direction === 'spouses') return family.personIds.some((id) => relatives.has(id));
      return family.personIds.every((id) => relatives.has(id));
    });
  }

  function collectExpansionKeys(graph, includeDirection = () => true) {
    const keys = [];
    const visible = new Set(graph?.basePersonIds || []);
    let changed = true;
    while (changed) {
      changed = false;
      for (const family of graph?.families || []) {
        const directions = family.kind === 'parents'
          ? [{ name: 'children', from: family.parentIds, to: [...family.childIds, ...family.parentIds] }, { name: 'parents', from: family.childIds, to: family.parentIds }]
          : [{ name: family.kind === 'spouses' ? 'spouses' : 'siblings', from: family.personIds, to: family.personIds }];
        for (const direction of directions) {
          if (!includeDirection(family, direction.name)) continue;
          if (!direction.from.some((id) => visible.has(id)) || !direction.to.some((id) => !visible.has(id))) continue;
          keys.push(`${family.id}:${direction.name}`);
          direction.to.forEach((id) => visible.add(id));
          changed = true;
        }
      }
    }
    return keys;
  }

  function getAllExpansionKeys(graph) { return collectExpansionKeys(graph); }

  function escapeHtml(value = '') {
    return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  }

  function personNodeId(id) { return `person-${encodeURIComponent(id)}`; }
  function getElkConstructor(options = {}) {
    if (options.ELK) return options.ELK;
    if (globalThis.ELK) return globalThis.ELK;
    if (typeof require === 'function') return require('./vendor/elk.bundled.js');
    return null;
  }

  function getGenerationRanks(visibleGraph) {
    const ids = (visibleGraph.people || []).map((person) => person.id);
    if (!ids.length) return new Map();
    const parent = new Map(ids.map((id) => [id, id]));
    const find = (id) => {
      let root = id;
      while (parent.get(root) !== root) root = parent.get(root);
      while (parent.get(id) !== id) { const next = parent.get(id); parent.set(id, root); id = next; }
      return root;
    };
    const union = (a, b) => { if (parent.has(a) && parent.has(b)) parent.set(find(b), find(a)); };
    for (const edge of visibleGraph.relationships || []) if (edge.type === 'spouse' || edge.type === 'sibling') union(edge.from, edge.to);
    for (const family of visibleGraph.families || []) {
      const sameGenerationIds = family.kind === 'parents' ? family.parentIds : family.kind === 'siblings' ? family.personIds : [];
      for (const id of sameGenerationIds.slice(1)) union(sameGenerationIds[0], id);
    }
    const groups = new Map(ids.map((id) => [find(id), new Set()]));
    const outgoing = new Map([...groups.keys()].map((id) => [id, new Set()]));
    const indegree = new Map([...groups.keys()].map((id) => [id, 0]));
    for (const edge of visibleGraph.relationships || []) {
      if (edge.type !== 'parent-child') continue;
      const from = find(edge.from); const to = find(edge.to);
      if (from === to) return null;
      if (!outgoing.get(from).has(to)) { outgoing.get(from).add(to); indegree.set(to, indegree.get(to) + 1); }
    }
    const queue = [...indegree].filter(([, degree]) => degree === 0).map(([id]) => id);
    const ranks = new Map([...groups.keys()].map((id) => [id, 0]));
    let visited = 0;
    while (queue.length) {
      const current = queue.shift(); visited += 1;
      for (const child of outgoing.get(current)) {
        ranks.set(child, Math.max(ranks.get(child), ranks.get(current) + 1));
        indegree.set(child, indegree.get(child) - 1);
        if (indegree.get(child) === 0) queue.push(child);
      }
    }
    if (visited !== groups.size) return null;
    // Longest-path layering leaves the shorter ancestral side several rows
    // above its peers. Propagate exact generation distances in both directions
    // from the focus, retaining the acyclic fallback for conflicting records.
    const adjacent = new Map([...groups.keys()].map((id) => [id, []]));
    for (const [from, children] of outgoing) for (const to of children) {
      adjacent.get(from).push({ id: to, delta: 1 });
      adjacent.get(to).push({ id: from, delta: -1 });
    }
    const exact = new Map();
    const focusGroup = parent.has(visibleGraph.focusId) ? find(visibleGraph.focusId) : find(ids[0]);
    const seeds = [focusGroup, ...groups.keys()];
    for (const seed of seeds) {
      if (exact.has(seed)) continue;
      const component = new Map([[seed, 0]]); const pending = [seed]; let conflict = false;
      while (pending.length) {
        const current = pending.shift();
        for (const edge of adjacent.get(current) || []) {
          const value = component.get(current) + edge.delta;
          if (component.has(edge.id)) { if (component.get(edge.id) !== value) conflict = true; continue; }
          component.set(edge.id, value); pending.push(edge.id);
        }
      }
      const minimum = Math.min(...component.values());
      for (const [id, value] of component) exact.set(id, conflict ? ranks.get(id) : value - minimum);
    }
    return new Map(ids.map((id) => [id, exact.get(find(id))]));
  }

  function placeBranchControls(layout, controls, scale = 100) {
    const factor = Math.min(200, Math.max(5, Number(scale) || 100)) / 100;
    if (factor < 0.35) return [];
    const width = Math.max(22, 36 * factor);
    const height = Math.max(20, 28 * factor);
    const personNodes = new Map((layout.children || []).filter((node) => node.id.startsWith('person-'))
      .map((node) => [decodeURIComponent(node.id.slice('person-'.length)), node]));
    const cardRects = [...personNodes.values()].map((node) => ({
      x: node.x * factor, y: node.y * factor, width: node.width * factor, height: node.height * factor,
    }));
    const occupied = [];
    const intersects = (a, b) => a.x < b.x + b.width + 4 && a.x + a.width + 4 > b.x && a.y < b.y + b.height + 4 && a.y + a.height + 4 > b.y;
    const familyById = layout.familiesById || new Map();
    const placed = [];
    for (const control of controls || []) {
      const family = familyById.get(control.familyId);
      if (!family) continue;
      const anchorIds = control.direction === 'parents' ? family.childIds
        : control.direction === 'children' ? family.parentIds : family.personIds;
      const members = anchorIds.map((id) => personNodes.get(id)).filter(Boolean);
      if (!members.length) continue;
      const centers = members.map((node) => ({ x: (node.x + node.width / 2) * factor, y: (node.y + node.height / 2) * factor }));
      let anchorX = centers.reduce((sum, point) => sum + point.x, 0) / centers.length;
      let anchorY = centers.reduce((sum, point) => sum + point.y, 0) / centers.length;
      if (family.kind === 'parents' && control.direction === 'children') {
        anchorY = (Math.max(...members.map((node) => node.y + node.height)) + 30) * factor;
      } else if (family.kind === 'parents' && control.direction === 'parents') {
        anchorY = (Math.min(...members.map((node) => node.y)) - 30) * factor;
      } else {
        const owner = members[0];
        anchorX = (owner.x + owner.width - (control.direction === 'spouses' ? 28 : owner.width - 28)) * factor;
        anchorY = (owner.y + owner.height + 30) * factor;
      }
      const anchorPersonId = anchorIds.find((id) => personNodes.has(id)) || '';
      const candidates = [0, width + 4, -width - 4].map((offset) => ({ x: Math.max(0, anchorX + offset - width / 2), y: Math.max(0, anchorY - height / 2), width, height }));
      const choice = candidates.find((candidate) => !cardRects.some((rect) => intersects(candidate, rect))
        && !occupied.some((rect) => intersects(candidate, rect))) || candidates[0];
      occupied.push(choice);
      placed.push({ ...control, ...choice, anchorX, anchorY, anchorPersonId, compact: true });
    }
    return placed;
  }

  function branchOverlayHeight(layout, controls, scale = 100) {
    const positions = placeBranchControls(layout, controls, scale);
    return positions.length ? Math.max(...positions.map((control) => control.y + control.height)) : 0;
  }

  function branchOverlayWidth(layout, controls, scale = 100) {
    const positions = placeBranchControls(layout, controls, scale);
    return positions.length ? Math.max(...positions.map((control) => control.x + control.width)) : 0;
  }

  function fitScaleForLayout(layout, controls, availableWidth, availableHeight) {
    const width = Math.max(1, Number(layout.width) || 1);
    const height = Math.max(1, Number(layout.height) || 1);
    const maxScale = Math.min(100, Math.max(5, Math.floor(Math.min(availableWidth / width, availableHeight / height) * 100)));
    for (let scale = maxScale; scale >= 5; scale -= 1) {
      const renderedHeight = Math.max(Math.ceil(height * scale / 100), branchOverlayHeight(layout, controls, scale));
      if (renderedHeight <= availableHeight && Math.max(Math.ceil(width * scale / 100), branchOverlayWidth(layout, controls, scale)) <= availableWidth) return scale;
    }
    return 5;
  }

  function insertLocalNodes(layout, visibleGraph, previousLayout, options) {
    const gap = Number(options.nodeSpacing) || 48;
    const previous = new Map((previousLayout.children || []).map((node) => [node.id, node]));
    const placed = new Map();
    const pending = [];
    const neighbours = new Map(layout.children.map((node) => [node.id, new Set()]));
    const partners = new Map(layout.children.map((node) => [node.id, new Set()]));
    const people = new Map((visibleGraph.people || []).map((person) => [personNodeId(person.id), person]));
    const sexOrder = (node) => ({ male: 0, female: 2 }[people.get(node.id)?.sex] ?? 1);
    function connect(a, b, partner = false) {
      const from = personNodeId(a); const to = personNodeId(b);
      if (!neighbours.has(from) || !neighbours.has(to)) return;
      neighbours.get(from).add(to); neighbours.get(to).add(from);
      if (partner) { partners.get(from).add(to); partners.get(to).add(from); }
    }
    for (const edge of visibleGraph.relationships || []) connect(edge.from, edge.to, edge.type === 'spouse');
    for (const family of visibleGraph.families || []) {
      const ids = family.kind === 'parents' ? family.parentIds : family.personIds;
      for (let left = 0; left < ids.length; left += 1) for (let right = left + 1; right < ids.length; right += 1) connect(ids[left], ids[right], family.kind === 'parents');
    }
    for (const node of layout.children) {
      const saved = previous.get(node.id);
      if (saved) { node.x = saved.x; if (!options.previousLayout.componentOffsets?.size) node.y = saved.y; placed.set(node.id, node); }
      else pending.push(node);
    }
    while (pending.length) {
      const hints = pending.map((node) => {
        const adjacent = [...neighbours.get(node.id)].map((id) => placed.get(id)).filter(Boolean);
        if (!adjacent.length) return { node, neighbours: [] };
        const knownPartners = [...partners.get(node.id)].map((id) => placed.get(id)).filter((other) => other?.y === node.y);
        const sameRow = adjacent.filter((other) => other.y === node.y);
        const selected = knownPartners.length ? knownPartners : sameRow.length ? sameRow : adjacent;
        return { node, neighbours: selected, sameRow: sameRow.length > 0,
          couple: knownPartners.length > 0,
          key: `${node.y}:${selected.map((other) => other.id).sort().join('|')}` };
      });
      const hint = hints.find((item) => item.neighbours.length);
      if (!hint) {
        const node = pending.shift();
        node.x = Math.max(48, ...[...placed.values()].map((other) => other.x + other.width + gap));
        placed.set(node.id, node);
        continue;
      }
      const batch = hints.filter((item) => item.key === hint.key).map((item) => item.node);
      if (batch.length === 2 && partners.get(batch[0].id).has(batch[1].id)) batch.sort((a, b) => sexOrder(a) - sexOrder(b));
      const batchGaps = batch.slice(1).map((node, index) => partners.get(node.id).has(batch[index].id) ? 24 : gap);
      const width = batch.reduce((sum, node) => sum + node.width, 0) + batchGaps.reduce((sum, value) => sum + value, 0);
      const centre = hint.neighbours.reduce((sum, node) => sum + node.x + node.width / 2, 0) / hint.neighbours.length;
      const cached = batch.map((node) => options.positionCache?.get(node.id));
      const canReuse = cached.every((node, index) => node && node.y === batch[index].y);
      const beforePartner = hint.couple && batch.every((node) => sexOrder(node) === 0) && hint.neighbours.every((node) => sexOrder(node) === 2);
      const start = canReuse ? Math.min(...cached.map((node) => node.x))
        : beforePartner ? Math.min(...hint.neighbours.map((node) => node.x)) - 24 - width
        : hint.sameRow ? Math.max(...hint.neighbours.map((node) => node.x + node.width)) + (hint.couple ? 24 : gap) : centre - width / 2;
      const end = start + width;
      const row = [...placed.values()].filter((node) => node.y === hint.node.y);
      const rowIds = new Set(row.map((node) => node.id));
      const seen = new Set();
      const units = [];
      for (const node of row) {
        if (seen.has(node.id)) continue;
        const members = []; const queue = [node.id]; seen.add(node.id);
        while (queue.length) {
          const id = queue.pop(); members.push(placed.get(id));
          for (const partner of partners.get(id)) if (rowIds.has(partner) && !seen.has(partner)) { seen.add(partner); queue.push(partner); }
        }
        const x = Math.min(...members.map((item) => item.x));
        units.push({ x, width: Math.max(...members.map((item) => item.x + item.width)) - x, members });
      }
      const left = units.filter((node) => node.x + node.width / 2 <= (start + end) / 2).sort((a, b) => b.x - a.x);
      const right = units.filter((node) => node.x + node.width / 2 > (start + end) / 2).sort((a, b) => a.x - b.x);
      let boundary = start - (hint.couple && !beforePartner ? 24 : gap);
      for (const unit of left) {
        const nextX = Math.min(unit.x, boundary - unit.width);
        for (const node of unit.members) node.x += nextX - unit.x;
        boundary = nextX - gap;
      }
      boundary = end + (beforePartner ? 24 : gap);
      for (const unit of right) {
        const nextX = Math.max(unit.x, boundary);
        for (const node of unit.members) node.x += nextX - unit.x;
        boundary = nextX + unit.width + gap;
      }
      let x = start;
      for (const [index, node] of batch.entries()) {
        node.x = x; x += node.width + (batchGaps[index] || 0);
        placed.set(node.id, node);
        pending.splice(pending.indexOf(node), 1);
      }
    }
    // Keep leftward insertions inside the canvas; the viewport restores its
    // touched family after this common translation.
    const shift = Math.max(0, 48 - Math.min(48, ...layout.children.map((node) => node.x)));
    const shiftY = Math.max(0, 40 - Math.min(40, ...layout.children.map((node) => node.y)));
    for (const node of layout.children) { node.x += shift; node.y += shiftY; }
    for (const offset of layout.componentOffsets?.values() || []) { offset.x += shift; offset.y += shiftY; }
    layout.width = Math.max(1, ...layout.children.map((node) => node.x + node.width + 48));
    layout.height = Math.max(1, ...layout.children.map((node) => node.y + node.height + 48));
  }

  function getRevealScroll(layout, anchorId, addedNodeIds, camera) {
    const nodes = new Map((layout.children || []).map((node) => [node.id, node]));
    const anchor = nodes.get(personNodeId(anchorId));
    const added = addedNodeIds.map((id) => nodes.get(id)).filter(Boolean);
    if (!anchor || !added.length) return { left: camera.left, top: camera.top };
    const factor = camera.scale / 100;
    function bounds(targets) {
      return { left: Math.min(...targets.map((node) => node.x)) * factor + (camera.originX || 0),
        top: Math.min(...targets.map((node) => node.y)) * factor,
        right: Math.max(...targets.map((node) => node.x + node.width)) * factor + (camera.originX || 0),
        bottom: Math.max(...targets.map((node) => node.y + node.height)) * factor };
    }
    let box = bounds([anchor, ...added]);
    if (box.right - box.left > camera.width - 48 || box.bottom - box.top > camera.height - 48) {
      const nextGeneration = added.filter((node) => node.y !== anchor.y);
      const nearest = (nextGeneration.length ? nextGeneration : added).slice().sort((a, b) =>
        Math.hypot(a.x - anchor.x, a.y - anchor.y) - Math.hypot(b.x - anchor.x, b.y - anchor.y))[0];
      box = bounds([anchor, nearest]);
    }
    function move(start, end, current, available) {
      if (end - start > available - 48) return Math.max(0, (start + end - available) / 2);
      if (start < current + 24) return Math.max(0, start - 24);
      if (end > current + available - 24) return Math.max(0, end - available + 24);
      return current;
    }
    return { left: move(box.left, box.right, camera.left, camera.width), top: move(box.top, box.bottom, camera.top, camera.height) };
  }

  function separateComponents(layout, visibleGraph) {
    if (!layout.componentOffsets?.size || !visibleGraph.componentByPerson) return;
    const groups = new Map();
    for (const node of layout.children) {
      const componentId = visibleGraph.componentByPerson.get(decodeURIComponent(node.id.slice(7)));
      if (!groups.has(componentId)) groups.set(componentId, []);
      groups.get(componentId).push(node);
    }
    const focusComponent = visibleGraph.componentByPerson.get(visibleGraph.focusId);
    const ordered = [...groups].sort(([a], [b]) => a === focusComponent ? -1 : b === focusComponent ? 1
      : (layout.componentOffsets.get(a)?.y || 0) - (layout.componentOffsets.get(b)?.y || 0) || a - b);
    const placed = [];
    for (const [id, nodes] of ordered) {
      const box = { left: Math.min(...nodes.map((node) => node.x)), right: Math.max(...nodes.map((node) => node.x + node.width)),
        top: Math.min(...nodes.map((node) => node.y)), bottom: Math.max(...nodes.map((node) => node.y + node.height)) };
      let collision;
      while ((collision = placed.find((other) => box.left < other.right + 32 && box.right + 32 > other.left
        && box.top < other.bottom + 32 && box.bottom + 32 > other.top))) {
        const shift = collision.bottom + 96 - box.top;
        nodes.forEach((node) => { node.y += shift; });
        box.top += shift; box.bottom += shift;
        const offset = layout.componentOffsets.get(id);
        if (offset) offset.y += shift;
      }
      placed.push(box);
    }
    layout.width = Math.max(1, ...layout.children.map((node) => node.x + node.width + 48));
    layout.height = Math.max(1, ...layout.children.map((node) => node.y + node.height + 48));
  }

  async function layoutFamilyUnits(graph, visibleGraph, ranks, elk, options) {
    const nodes = new Map(graph.children.map((node) => [node.id, node]));
    const roots = new Map(graph.children.map((node) => [node.id, node.id]));
    function find(id) {
      let root = id;
      while (roots.get(root) !== root) root = roots.get(root);
      return root;
    }
    function unite(a, b) {
      const from = personNodeId(a); const to = personNodeId(b);
      if (roots.has(from) && roots.has(to)) roots.set(find(to), find(from));
    }
    for (const edge of visibleGraph.relationships || []) if (edge.type === 'spouse') unite(edge.from, edge.to);
    for (const family of visibleGraph.families || []) if (family.kind === 'parents') {
      for (const id of family.parentIds.slice(1)) unite(family.parentIds[0], id);
    }
    const members = new Map();
    for (const node of graph.children) {
      const unitId = find(node.id);
      if (!members.has(unitId)) members.set(unitId, []);
      members.get(unitId).push(node);
    }
    const peopleById = new Map((visibleGraph.people || []).map((person) => [person.id, person]));
    const sexOrder = (node) => ({ male: 0, female: 2 }[peopleById.get(decodeURIComponent(node.id.slice(7)))?.sex] ?? 1);
    for (const items of members.values()) if (items.length === 2) items.sort((a, b) => sexOrder(a) - sexOrder(b));
    const coupleGap = 24;
    const unitNodes = [...members].map(([id, items]) => ({ id,
      width: items.reduce((sum, node) => sum + node.width, 0) + coupleGap * (items.length - 1),
      height: Math.max(...items.map((node) => node.height)) }));
    const unitEdges = new Map();
    for (const edge of graph.edges) {
      const from = find(edge.sources[0]); const to = find(edge.targets[0]);
      if (from !== to) unitEdges.set(`${from}:${to}`, { id: `unit-${edge.id}`, sources: [from], targets: [to] });
    }
    const components = new Map();
    for (const unit of unitNodes) {
      const personId = decodeURIComponent(members.get(unit.id)[0].id.slice(7));
      const componentId = visibleGraph.componentByPerson?.get(personId) ?? 0;
      if (!components.has(componentId)) components.set(componentId, []);
      components.get(componentId).push(unit);
    }
    const focusComponent = visibleGraph.componentByPerson?.get(visibleGraph.focusId) ?? [...components.keys()][0];
    const componentOrder = [...components.keys()].sort((a, b) => a === focusComponent ? -1 : b === focusComponent ? 1 : a - b);
    const componentOffsets = new Map();
    let mainWidth = 1200; let mainHeight = 0; let cursorX = 0; let cursorY = 0; let rowHeight = 0;
    for (const componentId of componentOrder) {
      const componentUnits = components.get(componentId);
      const ids = new Set(componentUnits.map((unit) => unit.id));
      const result = componentUnits.length === 1
        ? { children: componentUnits.map((unit) => ({ ...unit, x: 48, y: 40 })) }
        : await elk.layout({ ...graph, children: componentUnits, edges: [...unitEdges.values()].filter((edge) => ids.has(edge.sources[0]) && ids.has(edge.targets[0])) });
      if (options.isCancelled?.()) break;
      const knownRanks = componentUnits.flatMap((unit) => members.get(unit.id).map((node) => ranks?.get(decodeURIComponent(node.id.slice(7))))).filter((rank) => rank !== undefined);
      const rankBase = knownRanks.length ? Math.min(...knownRanks) : 0;
      const rankSlots = [...new Set(knownRanks)].sort((a, b) => a - b);
      const rows = new Map();
      for (const unit of result.children || []) {
        const first = members.get(unit.id)?.[0];
        if (!first) continue;
        const rank = ranks?.get(decodeURIComponent(first.id.slice(7)));
        if (rank !== undefined) unit.y = 40 + rankSlots.indexOf(rank) * (104 + (Number(options.layerSpacing) || 88));
        if (!rows.has(unit.y)) rows.set(unit.y, []);
        rows.get(unit.y).push(unit);
      }
      for (const row of rows.values()) {
        row.sort((a, b) => a.x - b.x || a.id.localeCompare(b.id));
      }
      const gap = Number(options.nodeSpacing) || 48;
      const rowWidth = (row) => row.reduce((sum, unit) => sum + unit.width, 0) + gap * Math.max(0, row.length - 1);
      const widest = Math.max(1, ...[...rows.values()].map(rowWidth));
      for (const row of rows.values()) {
        let x = 48 + (widest - rowWidth(row)) / 2;
        for (const unit of row) { unit.x = x; x += unit.width + gap; }
      }
      const unitById = new Map((result.children || []).map((unit) => [unit.id, unit]));
      function pack(row, related) {
        let prefix = 0;
        const positions = [];
        const blocks = [];
        row.forEach((unit, index) => {
          const relatives = related(unit).map((id) => unitById.get(id)).filter(Boolean);
          const target = relatives.length ? relatives.reduce((sum, other) => sum + other.x + other.width / 2, 0) / relatives.length - unit.width / 2 : unit.x;
          positions.push(prefix);
          blocks.push({ start: index, end: index, weight: relatives.length ? 4 : 1, value: target - prefix });
          while (blocks.length > 1 && blocks.at(-2).value > blocks.at(-1).value) {
            const right = blocks.pop(); const left = blocks.pop();
            blocks.push({ start: left.start, end: right.end, weight: left.weight + right.weight,
              value: (left.value * left.weight + right.value * right.weight) / (left.weight + right.weight) });
          }
          prefix += unit.width + gap;
        });
        for (const block of blocks) for (let index = block.start; index <= block.end; index += 1) row[index].x = positions[index] + block.value;
      }
      const orderedRows = [...rows].sort(([a], [b]) => a - b);
      for (const [, row] of orderedRows.slice().reverse()) pack(row, (unit) => [...unitEdges.values()].filter((edge) => edge.sources[0] === unit.id).map((edge) => edge.targets[0]));
      for (const [, row] of orderedRows) pack(row, (unit) => [...unitEdges.values()].filter((edge) => edge.targets[0] === unit.id).map((edge) => edge.sources[0]));
      const translate = 48 - Math.min(48, ...(result.children || []).map((unit) => unit.x));
      for (const unit of result.children || []) unit.x += translate;
      const componentWidth = Math.max(1, ...(result.children || []).map((unit) => unit.x + unit.width + 48));
      const componentHeight = Math.max(1, ...(result.children || []).map((unit) => unit.y + unit.height + 48));
      if (componentId === focusComponent) { mainWidth = Math.max(1200, componentWidth); mainHeight = componentHeight; }
      else {
        if (!cursorY) cursorY = mainHeight + 128;
        if (cursorX && cursorX + componentWidth > mainWidth) { cursorX = 0; cursorY += rowHeight + 64; rowHeight = 0; }
      }
      const offset = { x: componentId === focusComponent ? 0 : cursorX, y: componentId === focusComponent ? 0 : cursorY, rankBase, rankSlots };
      componentOffsets.set(componentId, offset);
      for (const unit of result.children || []) {
        let x = unit.x + offset.x;
        for (const node of members.get(unit.id) || []) { node.x = x; node.y = unit.y + offset.y; x += node.width + coupleGap; }
      }
      if (componentId !== focusComponent) { cursorX += componentWidth + 64; rowHeight = Math.max(rowHeight, componentHeight); }
    }
    // A deferred/cancelled test runtime may return no unit positions. Keep a
    // finite result while the controller checks its cancellation token.
    for (const node of nodes.values()) { node.x ??= 48; node.y ??= 40; }
    return { ...graph, children: [...nodes.values()], componentOffsets,
      width: Math.max(1, ...[...nodes.values()].map((node) => node.x + node.width + 48)),
      height: Math.max(1, ...[...nodes.values()].map((node) => node.y + node.height + 48)) };
  }

  async function layoutGraph(visibleGraph, options = {}) {
    const ELK = getElkConstructor(options);
    if (!ELK) throw new Error('The local ELK layout runtime is unavailable.');
    const elk = typeof ELK === 'function' ? new ELK() : ELK;
    const peopleById = options.peopleById || new Map((visibleGraph.people || []).map((person) => [person.id, person]));
    const visibleIds = visibleGraph.visiblePersonIds || new Set((visibleGraph.people || []).map((person) => person.id));
    const generationRanks = options.generationRanks || getGenerationRanks(visibleGraph);
    const children = (visibleGraph.people || []).map((person) => ({
      id: personNodeId(person.id),
      width: options.personWidth || 206,
      height: options.personHeight || 104,
      labels: [{ text: person.displayName || person.id }],
    }));
    const edges = [];
    const edgeTypes = new Map();
    function addEdge(id, source, target, type) {
      if (!source || !target || source === target || edgeTypes.has(id)) return;
      edges.push({ id, sources: [source], targets: [target] });
      edgeTypes.set(id, type);
    }
    for (const relationship of visibleGraph.relationships || []) if (relationship.type === 'parent-child'
      && visibleIds.has(relationship.from) && visibleIds.has(relationship.to)) {
      addEdge(relationship.id, personNodeId(relationship.from), personNodeId(relationship.to), 'parent');
    }
    const graph = {
      id: 'full-family-tree',
      layoutOptions: {
        'elk.algorithm': 'layered',
        'elk.direction': 'DOWN',
        'elk.edgeRouting': 'ORTHOGONAL',
        'elk.spacing.nodeNode': String(options.nodeSpacing || 48),
        'elk.layered.spacing.nodeNodeBetweenLayers': String(options.layerSpacing || 88),
        'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
        'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
        'elk.padding': '[top=40,left=48,bottom=48,right=48]',
      },
      children,
      edges,
    };
    const hasPrevious = options.previousLayout?.children?.length > 0;
    const layout = hasPrevious ? { ...graph, width: 1, height: 1,
      componentOffsets: new Map([...(options.previousLayout.componentOffsets || [])].map(([id, offset]) => [id, { ...offset }])) }
      : await layoutFamilyUnits(graph, visibleGraph, generationRanks, elk, options);
    if (generationRanks && hasPrevious) {
      const spacing = Number(options.layerSpacing || 88);
      for (const [componentId, offset] of layout.componentOffsets || []) {
        const visibleRanks = layout.children.filter((node) => visibleGraph.componentByPerson?.get(decodeURIComponent(node.id.slice(7))) === componentId)
          .map((node) => generationRanks.get(decodeURIComponent(node.id.slice(7)))).filter((rank) => rank !== undefined);
        offset.rankSlots = [...new Set(visibleRanks)].sort((a, b) => a - b);
      }
      const byRank = new Map();
      for (const node of layout.children || []) {
        const id = decodeURIComponent(node.id.slice('person-'.length));
        const rank = generationRanks.get(id) || 0;
        if (!byRank.has(rank)) byRank.set(rank, []);
        byRank.get(rank).push(node);
      }
      for (const [rank, row] of byRank) {
        row.sort((a, b) => a.x - b.x || a.id.localeCompare(b.id));
        let right = 48;
        for (const node of row) {
          node.x = Math.max(Number(node.x) || 0, right);
          const offset = layout.componentOffsets?.get(visibleGraph.componentByPerson?.get(decodeURIComponent(node.id.slice(7))));
          node.y = (offset?.y || 0) + 40 + (offset?.rankSlots ? offset.rankSlots.indexOf(rank) : rank) * (104 + spacing);
          right = node.x + node.width + (Number(options.nodeSpacing) || 48);
        }
        layout.width = Math.max(Number(layout.width) || 0, right + 48);
      }
      layout.height = Math.max(Number(layout.height) || 0, ...[...byRank.keys()].map((rank) => 40 + rank * (104 + spacing) + 104 + 48));
    }
    if (hasPrevious) {
      if (!generationRanks) {
        const previous = new Map(options.previousLayout.children.map((node) => [node.id, node]));
        for (const node of layout.children) node.y = previous.get(node.id)?.y || 40;
      }
      insertLocalNodes(layout, visibleGraph, options.previousLayout, options);
      separateComponents(layout, visibleGraph);
    }
    {
      const nodesById = new Map(layout.children.map((node) => [node.id, node]));
      for (const edge of layout.edges || []) {
        const source = nodesById.get(edge.sources?.[0]);
        const target = nodesById.get(edge.targets?.[0]);
        if (!source || !target) continue;
        const startPoint = { x: source.x + source.width / 2, y: source.y + source.height };
        const endPoint = { x: target.x + target.width / 2, y: target.y };
        const middleY = Math.round((startPoint.y + endPoint.y) / 2);
        edge.sections = [{ startPoint, bendPoints: [{ x: startPoint.x, y: middleY }, { x: endPoint.x, y: middleY }], endPoint }];
      }
    }
    layout.edgeTypes = edgeTypes;
    layout.relationshipEdges = (visibleGraph.relationships || []).filter((relationship) => relationship.type !== 'parent-child'
      && visibleIds.has(relationship.from) && visibleIds.has(relationship.to));
    layout.familiesById = new Map((visibleGraph.families || []).map((family) => [family.id, family]));
    layout.peopleById = peopleById;
    return layout;
  }

  function renderLayout(layout, visibleGraph, peopleById = layout.peopleById, options = {}) {
    if (!(visibleGraph.people || []).length) return '<p class="full-tree-empty" role="status">Zatím tu nejsou žádné osoby k zobrazení.</p>';
    const width = Math.max(1, Number(layout.width) || 1);
    const height = Math.max(1, Number(layout.height) || 1);
    const scale = Math.min(200, Math.max(5, Number(options.scale) || 100));
    const focusId = options.focusId || '';
    const selectedId = options.selectedId || '';
    const personNodes = new Map((layout.children || []).filter((node) => node.id.startsWith('person-'))
      .map((node) => [decodeURIComponent(node.id.slice('person-'.length)), node]));
    const nodeMarkup = (layout.children || []).map((node) => {
      const id = decodeURIComponent(node.id.slice('person-'.length));
      const person = peopleById?.get?.(id) || (visibleGraph.people || []).find((record) => record.id === id) || {};
      const lineage = ['self', 'direct', 'collateral', 'affinal'].includes(person.lineage) ? person.lineage : 'unknown';
      const classes = ['tree-node', `tree-node-${lineage}`, id === focusId ? 'is-focus' : '', id === selectedId ? 'is-tree-selected' : ''].filter(Boolean).join(' ');
      const card = { marks: options.marksFor?.(id) || [] };
      const record = { ...person, id, displayName: person.displayName || id };
      return `<foreignObject data-full-tree-person-node="${escapeHtml(id)}" x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}"><button xmlns="http://www.w3.org/1999/xhtml" class="${classes}" type="button" data-full-tree-person="${escapeHtml(id)}" aria-pressed="${id === selectedId ? 'true' : 'false'}" aria-label="${escapeHtml(RKComponents.cardLabel(record, card))}" title="${escapeHtml(record.displayName)}">${RKComponents.cardBody(record, card)}</button></foreignObject>`;
    }).join('');
    const routeRows = new Map();
    const routes = new Map();
    for (const family of visibleGraph.families || []) {
      if (family.kind !== 'parents') continue;
      const parents = family.parentIds.map((id) => personNodes.get(id)).filter(Boolean);
      const children = family.childIds.map((id) => personNodes.get(id)).filter(Boolean);
      if (!parents.length || !children.length) continue;
      const bottom = Math.max(...parents.map((node) => node.y + node.height));
      const joinX = parents.reduce((sum, node) => sum + node.x + node.width / 2, 0) / parents.length;
      const xs = [joinX, ...children.map((node) => node.x + node.width / 2)];
      if (!routeRows.has(bottom)) routeRows.set(bottom, []);
      routeRows.get(bottom).push({ familyId: family.id, left: Math.min(...xs), right: Math.max(...xs), children });
    }
    for (const [bottom, row] of routeRows) {
      row.sort((a, b) => a.left - b.left || a.right - b.right);
      const laneEnds = [];
      for (const route of row) {
        let lane = laneEnds.findIndex((right) => right + 8 < route.left);
        if (lane < 0) lane = laneEnds.length;
        route.lane = lane; laneEnds[lane] = route.right;
      }
      for (const route of row) routes.set(route.familyId, Math.min(bottom + (laneEnds.length === 1 ? 44 : 24 + route.lane * 36 / (laneEnds.length - 1)), Math.min(...route.children.map((node) => node.y)) - 24));
    }
    const edgeMarkup = (visibleGraph.families || []).filter((family) => family.kind === 'parents').map((family) => {
      const parents = family.parentIds.map((id) => personNodes.get(id)).filter(Boolean);
      const children = family.childIds.map((id) => personNodes.get(id)).filter(Boolean);
      if (!parents.length && !children.length) return '';
      const paths = [];
      const drops = [];
      if (parents.length) {
        const centres = parents.map((node) => node.x + node.width / 2);
        const bottom = Math.max(...parents.map((node) => node.y + node.height));
        const joinY = bottom + (parents.length > 1 ? 12 : 0);
        const joinX = centres.reduce((sum, x) => sum + x, 0) / centres.length;
        if (parents.length > 1) {
          paths.push(`M ${Math.min(...centres)} ${joinY} H ${Math.max(...centres)}`);
          parents.forEach((node) => paths.push(`M ${node.x + node.width / 2} ${node.y + node.height} V ${joinY}`));
        }
        const branchY = children.length ? routes.get(family.id) : bottom + 30;
        paths.push(`M ${joinX} ${joinY} V ${branchY}`);
        if (children.length) {
          const xs = [...children.map((node) => node.x + node.width / 2), joinX];
          paths.push(`M ${Math.min(...xs)} ${branchY} H ${Math.max(...xs)}`);
          // Each child's own line shows how certain its weakest parent link is.
          children.forEach((node) => {
            const childId = decodeURIComponent(node.id.slice('person-'.length));
            const status = options.linkEvidence ? RKPresentation.weakestEvidence(family.parentIds.map((parentId) => options.linkEvidence.get(`${parentId}>${childId}`) || 'unknown')) : 'unknown';
            drops.push(`<path class="full-tree-edge-casing" d="M ${node.x + node.width / 2} ${branchY} V ${node.y}" aria-hidden="true"></path><path class="full-tree-edge full-tree-edge-child tree-edge edge-evidence-${status}" d="M ${node.x + node.width / 2} ${branchY} V ${node.y}"><title>${escapeHtml(RKPresentation.linkEvidenceLabels[status] || '')}</title></path>`);
          });
        }
      } else {
        const xs = children.map((node) => node.x + node.width / 2);
        const y = Math.min(...children.map((node) => node.y)) - 30;
        paths.push(`M ${Math.min(...xs)} ${y} H ${Math.max(...xs)}`);
        children.forEach((node) => paths.push(`M ${node.x + node.width / 2} ${y} V ${node.y}`));
      }
      return `<path class="full-tree-edge-casing" d="${paths.join(' ')}" aria-hidden="true"></path><path class="full-tree-edge full-tree-edge-parent" data-full-tree-parent-family="${escapeHtml(family.id)}" data-branch-y="${routes.get(family.id) ?? ''}" d="${paths.join(' ')}" aria-hidden="true"></path>${drops.join('')}`;
    }).join('');
    const relationshipMarkup = (layout.relationshipEdges || []).map((relationship) => {
      const from = personNodes.get(relationship.from);
      const to = personNodes.get(relationship.to);
      if (!from || !to) return '';
      if (relationship.type === 'sibling' && (visibleGraph.families || []).some((family) => family.kind === 'parents'
        && family.childIds.includes(relationship.from) && family.childIds.includes(relationship.to))) return '';
      if (relationship.type === 'spouse' && from.y === to.y) {
        const left = from.x < to.x ? from : to; const right = left === from ? to : from;
        const adjacent = right.x - (left.x + left.width) <= 52;
        const y = left.y + left.height / 2;
        const d = adjacent ? `M ${left.x + left.width} ${y} H ${right.x}`
          : `M ${left.x + left.width / 2} ${left.y + left.height} V ${left.y + left.height + 10} H ${right.x + right.width / 2} V ${right.y + right.height}`;
        return `<path class="full-tree-edge full-tree-edge-spouse" d="${d}" aria-hidden="true"></path>`;
      }
      const startX = from.x + from.width / 2;
      const startY = from.y + from.height / 2;
      const endX = to.x + to.width / 2;
      const endY = to.y + to.height / 2;
      const bend = Math.max(24, Math.abs(endX - startX) / 3);
      const sign = endX >= startX ? 1 : -1;
      const d = `M ${startX} ${startY} C ${startX + bend * sign} ${startY - 20}, ${endX - bend * sign} ${endY - 20}, ${endX} ${endY}`;
      return `<path class="full-tree-edge full-tree-edge-${relationship.type}" d="${d}" aria-hidden="true"></path>`;
    }).join('');
    const controls = placeBranchControls(layout, visibleGraph.controls, scale);
    const branchMarkup = controls.map((control) => {
      const family = layout.familiesById?.get(control.familyId) || (visibleGraph.families || []).find((item) => item.id === control.familyId);
      if (!family) return '';
      const label = control.direction === 'children' ? 'Děti' : control.direction === 'parents' ? 'Předci' : control.direction === 'spouses' ? 'Partneři' : 'Sourozenci';
      const verb = control.expanded ? 'Sbalit' : 'Rozbalit';
      const names = family.personIds.map((id) => layout.peopleById.get(id)?.displayName || id).join(', ');
      const buttonText = control.expanded ? '−' : `+${control.count}`;
      const description = `${verb}: ${label.toLowerCase()} (${control.count}) · ${names}`;
      return `<button type="button" class="full-tree-branch-button is-compact" data-full-tree-branch data-full-tree-family="${escapeHtml(family.id)}" data-full-tree-direction="${control.direction}" data-full-tree-anchor-person="${escapeHtml(control.anchorPersonId)}" aria-expanded="${control.expanded ? 'true' : 'false'}" aria-label="${escapeHtml(description)}" title="${escapeHtml(description)}" style="left:${control.x}px;top:${control.y}px;width:${control.width}px;height:${control.height}px;font-size:${Math.max(10, 11 * scale / 100)}px">${escapeHtml(buttonText)}</button>`;
    }).join('');
    const scaledWidth = Math.ceil(width * scale / 100);
    const scaledHeight = Math.ceil(height * scale / 100);
    const branchPositions = placeBranchControls(layout, visibleGraph.controls, scale);
    const stageWidth = Math.max(scaledWidth, ...branchPositions.map((control) => control.x + control.width));
    const stageHeight = Math.max(scaledHeight, ...branchPositions.map((control) => control.y + control.height));
    const focusComponent = visibleGraph.componentByPerson?.get(visibleGraph.focusId);
    const otherComponents = [...(layout.componentOffsets || [])].filter(([id]) => id !== focusComponent).map(([, offset]) => offset);
    const componentLabel = otherComponents.length ? `<text class="full-tree-component-label" x="48" y="${Math.min(...otherComponents.map((offset) => offset.y)) + 10}">Další větve</text>` : '';
    return `<div class="full-tree-stage" style="width:${stageWidth}px;height:${stageHeight}px;min-width:100%"><svg class="family-tree full-family-tree" viewBox="0 0 ${width} ${height}" width="${scaledWidth}" height="${scaledHeight}" role="group" aria-label="Celý rodokmen" data-full-tree-scale="${scale}"><g class="full-tree-edges">${edgeMarkup}${relationshipMarkup}</g><g class="full-tree-nodes">${nodeMarkup}</g>${componentLabel}</svg><div class="full-tree-branch-overlay" style="left:calc(50% - ${scaledWidth / 2}px);top:0;width:${stageWidth}px;height:${stageHeight}px" aria-label="Rozbalení rodin">${branchMarkup}</div></div>`;
  }

  // Below this scale an automatically fitted tree would be too small to read.
  const MIN_READABLE_FIT = 55;

  function mount(container, data, options = {}) {
    const graph = buildGraph(data, options.focusId);
    const generationRanks = getGenerationRanks(getVisibleGraph(graph, { expandAll: true }));
    const snapshot = options.snapshot || {};
    const positionCache = new Map((snapshot.positionCache || snapshot.positions || []).map((node) => [node.id, { ...node }]));
    let expanded = new Set(Array.isArray(snapshot.expanded) ? snapshot.expanded : []);
    let allExpanded = snapshot.expandAll === true;
    let parentSide = getParentSides(graph)[snapshot.parentSide]?.length ? snapshot.parentSide : null;
    let scale = Math.min(200, Math.max(5, Number(snapshot.scale) || 100));
    let layout = Array.isArray(snapshot.positions) && snapshot.positions.length ? { children: snapshot.positions.map((node) => ({ ...node })), componentOffsets: new Map(snapshot.componentOffsets || []) } : null;
    let selectedId = null;
    let requestId = 0;
    let destroyed = false;
    let resizeObserver = null;
    const viewport = container?.querySelector?.('[data-full-tree-viewport]') || container;
    const scrollHost = container?.closest?.('.tree-scroll') || viewport;
    const linkEvidence = RKPresentation.linkEvidenceIndex(data);
    const marksCache = new Map();
    const marksFor = (id) => {
      if (!marksCache.has(id)) marksCache.set(id, RKPresentation.personMarks(data, id));
      return marksCache.get(id);
    };
    const renderOptions = () => ({ focusId: graph.focusId, selectedId, scale, linkEvidence, marksFor });
    const ready = render({ initial: true });

    function getCurrentSnapshot() {
      return { expanded: [...expanded], expandAll: allExpanded, parentSide, scale, left: Number(scrollHost?.scrollLeft || 0), top: Number(scrollHost?.scrollTop || 0),
        positions: (layout?.children || []).map(({ id, x, y, width, height }) => ({ id, x, y, width, height })),
        positionCache: [...positionCache.values()].map((node) => ({ ...node })),
        componentOffsets: [...(layout?.componentOffsets || [])].map(([id, offset]) => [id, { ...offset }]) };
    }

    function setParentSide(side) {
      parentSide = side;
      options.onParentSideChange?.(side);
    }

    function getAnchor(personId) {
      const selectorId = globalThis.CSS?.escape ? globalThis.CSS.escape(personId) : encodeURIComponent(personId);
      const element = personId ? viewport?.querySelector?.(`[data-full-tree-person-node="${selectorId}"]`) : null;
      if (!element || !scrollHost?.getBoundingClientRect) return null;
      const rect = element.getBoundingClientRect();
      const hostRect = scrollHost.getBoundingClientRect();
      return { personId, x: rect.left + rect.width / 2 - hostRect.left, y: rect.top + rect.height / 2 - hostRect.top };
    }

    function restoreAnchor(anchor) {
      if (!anchor || !scrollHost) return;
      const current = getAnchor(anchor.personId);
      if (!current) return;
      scrollHost.scrollLeft += current.x - anchor.x;
      scrollHost.scrollTop += current.y - anchor.y;
    }

    async function render({ initial = false, anchor = null, reveal = false, fresh = false } = {}) {
      if (destroyed || !viewport) return null;
      const token = ++requestId;
      const visible = getVisibleGraph(graph, { expanded, expandAll: allExpanded });
      const previousIds = new Set((layout?.children || []).map((node) => node.id));
      viewport.setAttribute?.('aria-busy', 'true');
      try {
        const nextLayout = await layoutGraph(visible, { peopleById: graph.peopleById, ELK: options.ELK, generationRanks, previousLayout: fresh ? null : layout, positionCache,
          isCancelled: () => destroyed || token !== requestId });
        if (destroyed || token !== requestId) return null;
        layout = nextLayout;
        for (const { id, x, y, width, height } of layout.children || []) positionCache.set(id, { id, x, y, width, height });
        viewport.innerHTML = renderLayout(layout, visible, graph.peopleById, renderOptions());
        viewport.setAttribute?.('aria-busy', 'false');
        if (anchor) {
          restoreAnchor(anchor);
          if (reveal) {
            const svgRect = viewport.querySelector('.full-family-tree')?.getBoundingClientRect?.();
            const hostRect = scrollHost.getBoundingClientRect?.();
            const camera = getRevealScroll(layout, anchor.personId, layout.children.filter((node) => !previousIds.has(node.id)).map((node) => node.id),
              { left: scrollHost.scrollLeft, top: scrollHost.scrollTop, width: scrollHost.clientWidth, height: scrollHost.clientHeight, scale,
                originX: svgRect && hostRect ? svgRect.left - hostRect.left + scrollHost.scrollLeft : 0 });
            scrollHost.scrollLeft = camera.left;
            scrollHost.scrollTop = camera.top;
          }
        }
        else if (initial && Number.isFinite(Number(snapshot.left))) {
          scrollHost.scrollLeft = Number(snapshot.left) || 0;
          scrollHost.scrollTop = Number(snapshot.top) || 0;
        } else if (initial && focusFitScale() >= MIN_READABLE_FIT) {
          // The opening family fits readably: show all of it, the person included.
          fit();
        } else if (initial) {
          const focus = getAnchor(graph.focusId);
          if (focus) {
            const componentId = graph.componentByPerson.get(graph.focusId);
            const nodes = layout.children.filter((node) => graph.componentByPerson.get(decodeURIComponent(node.id.slice(7))) === componentId);
            const left = Math.min(...nodes.map((node) => node.x)); const right = Math.max(...nodes.map((node) => node.x + node.width));
            const top = Math.min(...nodes.map((node) => node.y)); const bottom = Math.max(...nodes.map((node) => node.y + node.height));
            const focusNode = nodes.find((node) => node.id === personNodeId(graph.focusId));
            const originX = scrollHost.scrollLeft + focus.x - (focusNode.x + focusNode.width / 2) * scale / 100;
            const targetX = (right - left + 48) * scale / 100 <= scrollHost.clientWidth ? originX + (left + right) / 2 * scale / 100 : scrollHost.scrollLeft + focus.x;
            const targetY = (bottom - top + 48) * scale / 100 <= scrollHost.clientHeight ? (top + bottom) / 2 * scale / 100 : scrollHost.scrollTop + focus.y;
            scrollHost.scrollLeft = Math.max(0, targetX - scrollHost.clientWidth / 2);
            scrollHost.scrollTop = Math.max(0, targetY - scrollHost.clientHeight / 2);
          }
        }
        return layout;
      } catch (error) {
        if (!destroyed && token === requestId) {
          viewport.setAttribute?.('aria-busy', 'false');
          viewport.innerHTML = '<p class="full-tree-error" role="status">Rodokmen se nepodařilo rozložit. Zkuste zobrazení znovu přizpůsobit.</p>';
        }
        throw error;
      }
    }

    function focusBounds() {
      const componentId = graph.componentByPerson.get(graph.focusId);
      const focusNodes = (layout?.children || []).filter((node) => graph.componentByPerson.get(decodeURIComponent(node.id.slice(7))) === componentId);
      const targets = focusNodes.length ? focusNodes : layout?.children || [];
      if (!targets.length) return null;
      return { left: Math.min(...targets.map((node) => node.x)), right: Math.max(...targets.map((node) => node.x + node.width)),
        top: Math.min(...targets.map((node) => node.y)), bottom: Math.max(...targets.map((node) => node.y + node.height)) };
    }

    function focusFitScale() {
      const bounds = focusBounds();
      if (!bounds || !scrollHost?.clientWidth || !scrollHost?.clientHeight) return 0;
      return Math.min(100, Math.floor(Math.min(scrollHost.clientWidth / (bounds.right - bounds.left + 96), scrollHost.clientHeight / (bounds.bottom - bounds.top + 96)) * 100));
    }

    function fit() {
      if (!layout || !scrollHost) return;
      const availableWidth = Math.max(1, Number(scrollHost.clientWidth) || 1);
      const availableHeight = Math.max(1, Number(scrollHost.clientHeight) || 1);
      const bounds = focusBounds();
      if (!bounds) return;
      const { left, right, top, bottom } = bounds;
      scale = Math.min(100, Math.max(5, Math.floor(Math.min(availableWidth / (right - left + 96), availableHeight / (bottom - top + 96)) * 100)));
      viewport.innerHTML = renderLayout(layout, getVisibleGraph(graph, { expanded, expandAll: allExpanded }), graph.peopleById, renderOptions());
      const svgRect = viewport.querySelector('.full-family-tree')?.getBoundingClientRect?.();
      const hostRect = scrollHost.getBoundingClientRect?.();
      const originX = svgRect && hostRect ? svgRect.left - hostRect.left + scrollHost.scrollLeft : 0;
      scrollHost.scrollLeft = Math.max(0, (left + right) / 2 * scale / 100 + originX - availableWidth / 2);
      scrollHost.scrollTop = Math.max(0, (top + bottom) / 2 * scale / 100 - availableHeight / 2);
      options.onScaleChange?.(scale);
    }

    function setScale(nextScale) {
      const current = getCurrentSnapshot();
      const centerX = current.left + (scrollHost.clientWidth || 0) / 2;
      const centerY = current.top + (scrollHost.clientHeight || 0) / 2;
      const ratio = Math.min(200, Math.max(5, nextScale)) / scale;
      scale = Math.min(200, Math.max(5, nextScale));
      if (layout) viewport.innerHTML = renderLayout(layout, getVisibleGraph(graph, { expanded, expandAll: allExpanded }), graph.peopleById, renderOptions());
      scrollHost.scrollLeft = Math.max(0, centerX * ratio - (scrollHost.clientWidth || 0) / 2);
      scrollHost.scrollTop = Math.max(0, centerY * ratio - (scrollHost.clientHeight || 0) / 2);
      options.onScaleChange?.(scale);
    }

    function onClick(event) {
      const branch = event.target?.closest?.('[data-full-tree-branch]');
      if (branch) {
        event.preventDefault();
        const family = graph.families.find((item) => item.id === branch.dataset.fullTreeFamily);
        const ids = family?.personIds || [];
        const touchedAnchorId = branch.dataset.fullTreeAnchorPerson || ids.find((id) => layout?.children?.some((node) => node.id === personNodeId(id)));
        const anchor = getAnchor(touchedAnchorId);
        if (allExpanded) {
          expanded = new Set(getAllExpansionKeys(graph));
          allExpanded = false;
        }
        const key = `${branch.dataset.fullTreeFamily}:${branch.dataset.fullTreeDirection}`;
        const closing = expanded.has(key);
        setParentSide(null);
        if (expanded.has(key)) expanded.delete(key); else expanded.add(key);
        allExpanded = false;
        void render({ anchor, reveal: true, fresh: closing && expanded.size === 0 }).then(() => {
          const nextControl = [...(viewport.querySelectorAll?.('[data-full-tree-branch]') || [])]
            .find((item) => item.dataset.fullTreeFamily === branch.dataset.fullTreeFamily && item.dataset.fullTreeDirection === branch.dataset.fullTreeDirection);
          const target = nextControl || scrollHost;
          try { target?.focus?.({ preventScroll: true }); } catch (_) { target?.focus?.(); }
        });
        return;
      }
      const person = event.target?.closest?.('[data-full-tree-person]');
      if (!person) return;
      selectedId = person.dataset.fullTreePerson;
      for (const button of viewport.querySelectorAll('[data-full-tree-person]')) {
        const selected = button.dataset.fullTreePerson === selectedId;
        button.setAttribute('aria-pressed', String(selected));
        button.classList.toggle('is-tree-selected', selected);
      }
      options.onSelectPerson?.(selectedId);
    }

    viewport?.addEventListener?.('click', onClick);
    if (typeof ResizeObserver === 'function' && viewport) {
      resizeObserver = new ResizeObserver(() => { if (layout && !destroyed) options.onScaleChange?.(scale); });
      resizeObserver.observe(scrollHost);
    }

    return {
      ready,
      snapshot: getCurrentSnapshot,
      zoom(kind) {
        if (kind === 'fit') return fit();
        if (kind === 'reset') return setScale(100);
        return setScale(scale + (kind === 'in' ? 10 : -10));
      },
      fit,
      toggleFamily(familyId, direction) {
        const key = `${familyId}:${direction}`;
        const closing = expanded.has(key);
        setParentSide(null);
        if (expanded.has(key)) expanded.delete(key); else expanded.add(key);
        return render({ fresh: closing && expanded.size === 0 });
      },
      expandSide(side) {
        const keys = getSideExpansionKeys(graph, side);
        if (!keys) return Promise.resolve(false);
        expanded = new Set(keys); allExpanded = false; positionCache.clear();
        setParentSide(side);
        return render({ anchor: getAnchor(graph.focusId), fresh: true });
      },
      expandAll() { setParentSide(null); expanded = new Set(getAllExpansionKeys(graph)); allExpanded = false; return render({ anchor: getAnchor(graph.focusId), fresh: true }); },
      reset() { setParentSide(null); allExpanded = false; expanded = new Set(); positionCache.clear(); return render({ anchor: getAnchor(graph.focusId), fresh: true }); },
      selectPerson(id) {
        if (!graph.peopleById.has(id)) return false;
        selectedId = id;
        for (const button of viewport.querySelectorAll('[data-full-tree-person]')) {
          const selected = button.dataset.fullTreePerson === id;
          button.setAttribute('aria-pressed', String(selected));
          button.classList.toggle('is-tree-selected', selected);
        }
        return true;
      },
      destroy() {
        destroyed = true;
        requestId += 1;
        viewport?.removeEventListener?.('click', onClick);
        resizeObserver?.disconnect?.();
      },
    };
  }

  return { buildGraph, getVisibleGraph, getAllExpansionKeys, getParentSides, getSideExpansionKeys, getGenerationRanks, layoutGraph, getRevealScroll, placeBranchControls, branchOverlayHeight, branchOverlayWidth, fitScaleForLayout, renderLayout, mount };
});
