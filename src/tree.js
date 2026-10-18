(function registerTree(root, factory) {
  const model = typeof module === 'object' && module.exports ? require('./model.js') : root.RKModel;
  const components = typeof module === 'object' && module.exports ? require('./components.js') : root.RKComponents;
  const presentation = typeof module === 'object' && module.exports ? require('./presentation.js') : root.RKPresentation;
  const fullTree = typeof module === 'object' && module.exports ? require('./full-tree.js') : root.RKFullTree;
  const api = factory(model, components, presentation, fullTree);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.RKTree = api;
})(globalThis, function createTree(RKModel, RKComponents, RKPresentation, RKFullTree) {
  'use strict';

  function escapeHtml(value = '') {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  const DEFAULT_GENERATION_LIMIT = 'all';
  const MIN_TREE_SCALE = 5;
  const MAX_TREE_SCALE = 200;
  const NODE_WIDTH = 196;
  const NODE_HEIGHT = 104;
  const GAP_X = 34;
  const GAP_Y = 72;
  const MARGIN = 42;
  // The pedigree reads left to right like the printed charts: the person on
  // the left, each generation of ancestors one column further right.
  const PEDIGREE_NODE_WIDTH = 248;
  const PEDIGREE_NODE_HEIGHT = 100;
  const PEDIGREE_COLUMN_GAP = 64;
  const PEDIGREE_ROW_GAP = 14;
  // Unknown parents are shown as empty slots up to the great-grandparents.
  const UNKNOWN_SLOT_GENERATIONS = 3;

  function normalizeGenerationLimit(value) {
    if (value === 'all' || value === null || value === undefined || value === '') return 'all';
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return DEFAULT_GENERATION_LIMIT;
    return Math.min(12, Math.max(1, Math.floor(parsed)));
  }

  function normalizeTreeScale(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 100;
    return Math.min(MAX_TREE_SCALE, Math.max(MIN_TREE_SCALE, Math.round(parsed)));
  }

  function sexBranch(person) {
    if (person?.sex === 'male') return 'paternal';
    if (person?.sex === 'female') return 'maternal';
    return 'unknown';
  }

  function relativeRole(depth, sex) {
    if (depth === 0) return 'zvolená osoba';
    return RKPresentation.ancestorLabel(depth, sex);
  }

  function familyRole(role) {
    return { parent: 'rodič', sibling: 'sourozenec', partner: 'partner', child: 'dítě', focus: 'zvolená osoba' }[role] || role;
  }

  function assignParentSlots(parents) {
    if (parents.length <= 1) {
      return parents.map((parent) => parent.person.sex === 'male' ? 0 : parent.person.sex === 'female' ? 1 : 0.5);
    }
    const slots = Array(parents.length).fill(null);
    const available = () => {
      const used = new Set(slots.filter((value) => value !== null));
      return slots.map((_, index) => index).filter((index) => !used.has(index));
    };
    parents.forEach((parent, index) => {
      if (parent.person.sex === 'male') {
        const free = available();
        slots[index] = free.shift() ?? index;
      }
    });
    parents.forEach((parent, index) => {
      if (parent.person.sex === 'female') {
        const free = available();
        slots[index] = free.pop() ?? index;
      }
    });
    parents.forEach((parent, index) => {
      if (slots[index] === null) slots[index] = available()[0] ?? index;
    });
    return slots.map((slot) => slot / (parents.length - 1));
  }

  function createDirectModel(data, focusId) {
    const peopleById = new Map((data.people || []).map((person) => [person.id, person]));
    const focus = peopleById.get(focusId);
    if (!focus) return { focusId, mode: 'direct', nodes: [], edges: [] };
    const { numberOf } = RKModel.getAhnentafel(data, focusId);
    const evidence = RKPresentation.linkEvidenceIndex(data);
    const parentLinksByChild = new Map();
    for (const relationship of data.relationships || []) {
      if (relationship.type !== 'parent-child' || !peopleById.has(relationship.from) || !peopleById.has(relationship.to)) continue;
      if (!parentLinksByChild.has(relationship.to)) parentLinksByChild.set(relationship.to, []);
      parentLinksByChild.get(relationship.to).push({ relationship, person: peopleById.get(relationship.from) });
    }
    const nodesById = new Map();
    const edgesById = new Map();
    const focusNode = {
      id: focus.id,
      label: focus.displayName,
      person: focus,
      generation: 0,
      depth: 0,
      role: 'focus',
      relativeRole: relativeRole(0, focus.sex),
      branch: 'focus',
      branches: ['focus'],
      sidePath: [],
      number: 1,
      marks: RKPresentation.personMarks(data, focus.id),
    };
    nodesById.set(focus.id, focusNode);
    const queue = [focusNode];
    while (queue.length) {
      const childNode = queue.shift();
      const parents = parentLinksByChild.get(childNode.id) || [];
      const slots = assignParentSlots(parents);
      parents.forEach(({ relationship, person }, index) => {
        const generation = childNode.generation + 1;
        const candidateBranch = childNode.generation === 0
          ? sexBranch(person)
          : childNode.branch === 'shared' ? 'shared' : childNode.branch;
        let node = nodesById.get(person.id);
        if (!node) {
          node = {
            id: person.id,
            label: person.displayName,
            person,
            generation,
            depth: generation,
            role: 'ancestor',
            relativeRole: relativeRole(generation, person.sex),
            branch: candidateBranch,
            branches: [candidateBranch],
            sidePath: [...childNode.sidePath, slots[index]],
            number: numberOf.get(person.id) || null,
            marks: RKPresentation.personMarks(data, person.id),
          };
          nodesById.set(person.id, node);
          queue.push(node);
        } else {
          if (!node.branches.includes(candidateBranch)) node.branches.push(candidateBranch);
          if (node.branches.length > 1) node.branch = 'shared';
          if (generation < node.generation) {
            node.generation = generation;
            node.depth = generation;
            node.relativeRole = relativeRole(generation, person.sex);
          }
        }
        const edgeId = relationship.id || `${relationship.from}:${relationship.to}:${relationship.type}`;
        if (!edgesById.has(edgeId)) edgesById.set(edgeId, { ...relationship, id: edgeId, branch: candidateBranch, from: person.id, to: childNode.id, evidence: evidence.get(`${person.id}>${childNode.id}`) || 'unknown' });
      });
    }
    const nodes = [...nodesById.values()];
    const visible = new Set(nodes.map((node) => node.id));
    return { focusId, mode: 'direct', nodes, edges: [...edgesById.values()].filter((edge) => visible.has(edge.from) && visible.has(edge.to)) };
  }

  function createExtendedModel(data, focusId) {
    const family = RKModel.getFamily(data, focusId, { extended: true });
    const node = (person, generation, role) => ({ id: person.id, label: person.displayName, person, generation, depth: generation, role, relativeRole: familyRole(role), branch: 'extended', branches: ['extended'], sidePath: [] });
    const nodes = [
      ...family.parents.map((person) => node(person, 0, 'parent')),
      ...family.siblings.map((person) => node(person, 1, 'sibling')),
      ...(family.focus ? [node(family.focus, 1, 'focus')] : []),
      ...family.partners.map((person) => node(person, 1, 'partner')),
      ...family.children.map((person) => node(person, 2, 'child')),
    ];
    const uniqueNodes = [...new Map(nodes.map((node) => [node.id, node])).values()];
    const visible = new Set(uniqueNodes.map((node) => node.id));
    const edges = data.relationships.filter((relationship) => visible.has(relationship.from) && visible.has(relationship.to));
    return { focusId, mode: 'extended', nodes: uniqueNodes, edges };
  }

  function createTreeModel(data, focusId, mode = 'direct') {
    return mode === 'extended' ? createExtendedModel(data, focusId) : createDirectModel(data, focusId);
  }

  // Empty slots for a missing father or mother of the person and of the
  // nearest ancestors, so the pedigree shows where the record ends. A lone
  // parent of unknown sex leaves the other role undecided and gets no slot.
  function getUnknownSlots(model, generationLimit = 'all') {
    if (model.mode !== 'direct') return { slots: [], edges: [] };
    const limit = generationLimit === 'all' ? Infinity : generationLimit;
    const parentsOf = new Map();
    for (const edge of model.edges) {
      if (edge.type !== 'parent-child') continue;
      parentsOf.set(edge.to, [...(parentsOf.get(edge.to) || []), model.nodes.find((node) => node.id === edge.from)].filter(Boolean));
    }
    const slots = [];
    const edges = [];
    for (const child of model.nodes) {
      const generation = child.generation + 1;
      if (generation > UNKNOWN_SLOT_GENERATIONS || generation >= limit) continue;
      const parents = parentsOf.get(child.id) || [];
      if (parents.length >= 2 || parents.some((parent) => !['male', 'female'].includes(parent.person.sex))) continue;
      for (const [sex, role, label] of [['male', 'father', 'Neznámý otec'], ['female', 'mother', 'Neznámá matka']]) {
        if (parents.some((parent) => parent.person.sex === sex)) continue;
        const id = `unknown-parent:${child.id}:${role}`;
        const branch = child.generation === 0 ? sexBranch({ sex }) : child.branch;
        slots.push({ id, label, placeholder: true, person: { id, displayName: label, sex }, generation, depth: generation, role: 'unknown', relativeRole: relativeRole(generation, sex), branch, branches: [branch], sidePath: [...child.sidePath, sex === 'male' ? 0 : 1], number: child.number ? child.number * 2 + (sex === 'female' ? 1 : 0) : null, marks: [] });
        edges.push({ id: `${id}>${child.id}`, type: 'parent-child', from: id, to: child.id, branch, placeholder: true, evidence: 'none' });
      }
    }
    return { slots, edges };
  }

  function treeEdgeId(edge) {
    return edge.id || `${edge.from}:${edge.to}:${edge.type}`;
  }

  function getTreeHighlight(model, selectedId) {
    if (!selectedId || model.mode !== 'direct') return null;
    const modelNodeIds = new Set(model.nodes.map((node) => node.id));
    if (!modelNodeIds.has(selectedId) || !modelNodeIds.has(model.focusId)) return null;

    const parentsByChild = new Map();
    const childrenByParent = new Map();
    for (const edge of model.edges) {
      if (edge.type !== 'parent-child' || !modelNodeIds.has(edge.from) || !modelNodeIds.has(edge.to)) continue;
      if (!parentsByChild.has(edge.to)) parentsByChild.set(edge.to, []);
      parentsByChild.get(edge.to).push(edge);
      if (!childrenByParent.has(edge.from)) childrenByParent.set(edge.from, []);
      childrenByParent.get(edge.from).push(edge);
    }

    const focusAncestors = new Set([model.focusId]);
    const focusQueue = [model.focusId];
    while (focusQueue.length) {
      const childId = focusQueue.shift();
      for (const edge of parentsByChild.get(childId) || []) {
        if (focusAncestors.has(edge.from)) continue;
        focusAncestors.add(edge.from);
        focusQueue.push(edge.from);
      }
    }
    if (!focusAncestors.has(selectedId)) return null;

    const pathNodeIds = new Set([selectedId]);
    const pathEdgeIds = new Set();
    const pathQueue = [selectedId];
    while (pathQueue.length) {
      const parentId = pathQueue.shift();
      for (const edge of childrenByParent.get(parentId) || []) {
        if (!focusAncestors.has(edge.to)) continue;
        pathEdgeIds.add(treeEdgeId(edge));
        if (pathNodeIds.has(edge.to)) continue;
        pathNodeIds.add(edge.to);
        pathQueue.push(edge.to);
      }
    }
    if (!pathNodeIds.has(model.focusId)) return null;

    const ancestorNodeIds = new Set([selectedId]);
    const ancestorEdgeIds = new Set();
    const ancestorQueue = [selectedId];
    const visitedAncestors = new Set();
    while (ancestorQueue.length) {
      const childId = ancestorQueue.shift();
      if (visitedAncestors.has(childId)) continue;
      visitedAncestors.add(childId);
      for (const edge of parentsByChild.get(childId) || []) {
        ancestorNodeIds.add(edge.from);
        ancestorEdgeIds.add(treeEdgeId(edge));
        ancestorQueue.push(edge.from);
      }
    }

    return {
      selectedId,
      nodeIds: new Set([...pathNodeIds, ...ancestorNodeIds]),
      edgeIds: new Set([...pathEdgeIds, ...ancestorEdgeIds]),
    };
  }

  // Positions along the axis across generations (x for the vertical extended
  // view's historic layout, y for the horizontal pedigree): parents centred on
  // their child, subtrees packed by contour so no row overlaps.
  function tidyDirectPositions(model, size = NODE_WIDTH, gap = GAP_X) {
    const step = size + gap;
    const nodeById = new Map(model.nodes.map((node) => [node.id, node]));
    const parentsByChild = new Map();
    for (const edge of model.edges) {
      if (edge.type !== 'parent-child') continue;
      if (!parentsByChild.has(edge.to)) parentsByChild.set(edge.to, []);
      const parent = nodeById.get(edge.from);
      if (parent) parentsByChild.get(edge.to).push(parent);
    }
    const cache = new Map();
    const visiting = new Set();

    function mergeContour(contours, depth, min, max) {
      if (!contours[depth]) contours[depth] = [min, max];
      else {
        contours[depth][0] = Math.min(contours[depth][0], min);
        contours[depth][1] = Math.max(contours[depth][1], max);
      }
    }

    function subtree(node) {
      if (cache.has(node.id)) return cache.get(node.id);
      if (visiting.has(node.id)) return { items: [{ node, depth: 0, center: 0 }], contours: [[0, 0]] };
      visiting.add(node.id);
      const parents = (parentsByChild.get(node.id) || []).slice().sort((a, b) => (
        (a.sidePath?.at(-1) ?? 0.5) - (b.sidePath?.at(-1) ?? 0.5) || a.id.localeCompare(b.id)
      ));
      const parentSubtrees = parents.map((parent) => subtree(parent));
      const shifts = parentSubtrees.map(() => 0);

      if (parentSubtrees.length === 1) {
        const parent = parents[0];
        shifts[0] = parent.person.sex === 'male' ? -step / 2 : parent.person.sex === 'female' ? step / 2 : 0;
      } else if (parentSubtrees.length === 2) {
        let separation = step;
        const leftContours = parentSubtrees[0].contours;
        const rightContours = parentSubtrees[1].contours;
        for (let depth = 0; depth < Math.max(leftContours.length, rightContours.length); depth += 1) {
          const left = leftContours[depth];
          const right = rightContours[depth];
          if (left && right) separation = Math.max(separation, left[1] + step - right[0]);
        }
        shifts[0] = -separation / 2;
        shifts[1] = separation / 2;
      } else if (parentSubtrees.length > 2) {
        const initial = (parentSubtrees.length - 1) * step / 2;
        for (let index = 0; index < parentSubtrees.length; index += 1) shifts[index] = index * step - initial;
        for (let index = 1; index < parentSubtrees.length; index += 1) {
          for (let depth = 0; depth < Math.max(parentSubtrees[index - 1].contours.length, parentSubtrees[index].contours.length); depth += 1) {
            const previous = parentSubtrees[index - 1].contours[depth];
            const current = parentSubtrees[index].contours[depth];
            if (previous && current) shifts[index] = Math.max(shifts[index], shifts[index - 1] + previous[1] + step - current[0]);
          }
        }
      }

      const items = [{ node, depth: 0, center: 0 }];
      const contours = [[0, 0]];
      parentSubtrees.forEach((parentTree, index) => {
        const shift = shifts[index];
        parentTree.items.forEach((item) => items.push({ node: item.node, depth: item.depth + 1, center: item.center + shift }));
        parentTree.contours.forEach((contour, depth) => mergeContour(contours, depth + 1, contour[0] + shift, contour[1] + shift));
      });
      const result = { items, contours };
      cache.set(node.id, result);
      visiting.delete(node.id);
      return result;
    }

    const focus = nodeById.get(model.focusId) || model.nodes.find((node) => node.generation === 0);
    if (!focus) return new Map();
    const itemsById = new Map();
    for (const item of subtree(focus).items) if (!itemsById.has(item.node.id)) itemsById.set(item.node.id, item);
    const centers = [...itemsById.values()].map((item) => item.center);
    const minLeft = Math.min(...centers.map((center) => center - size / 2));
    const shiftX = MARGIN - minLeft;
    return new Map([...itemsById.entries()].map(([id, item]) => [id, item.center + shiftX]));
  }

  function layoutPedigree(model) {
    const generations = [...new Set(model.nodes.map((node) => node.generation))].sort((a, b) => a - b);
    const maxGeneration = Math.max(...generations, 0);
    const centers = tidyDirectPositions(model, PEDIGREE_NODE_HEIGHT, PEDIGREE_ROW_GAP);
    const placed = [];
    for (const generation of generations) {
      const column = model.nodes
        .filter((node) => node.generation === generation)
        .map((node, index) => ({ node, index, center: centers.get(node.id) ?? 0 }))
        .sort((a, b) => a.center - b.center || a.index - b.index);
      let previousY = -Infinity;
      for (const { node, center } of column) {
        const y = Math.max(center - PEDIGREE_NODE_HEIGHT / 2, previousY + PEDIGREE_NODE_HEIGHT + PEDIGREE_ROW_GAP);
        placed.push({ ...node, x: MARGIN + generation * (PEDIGREE_NODE_WIDTH + PEDIGREE_COLUMN_GAP), y, width: PEDIGREE_NODE_WIDTH, height: PEDIGREE_NODE_HEIGHT });
        previousY = y;
      }
    }
    const minY = Math.min(...placed.map((node) => node.y));
    const shiftY = MARGIN - minY;
    const laidOutNodes = placed.map((node) => ({ ...node, y: node.y + shiftY }));
    const width = Math.max(760, MARGIN * 2 + (maxGeneration + 1) * PEDIGREE_NODE_WIDTH + maxGeneration * PEDIGREE_COLUMN_GAP);
    const height = Math.max(420, ...laidOutNodes.map((node) => node.y + node.height + MARGIN));
    const nodeMap = new Map(laidOutNodes.map((node) => [node.id, node]));
    const edges = model.edges.map((edge) => ({ ...edge, fromNode: nodeMap.get(edge.from), toNode: nodeMap.get(edge.to) })).filter((edge) => edge.fromNode && edge.toNode);
    return {
      ...model,
      orientation: 'horizontal',
      nodes: laidOutNodes.filter((node) => !node.placeholder),
      slots: laidOutNodes.filter((node) => node.placeholder),
      edges: edges.filter((edge) => !edge.placeholder),
      slotEdges: edges.filter((edge) => edge.placeholder),
      rowGap: PEDIGREE_ROW_GAP,
      width,
      height,
    };
  }

  function layoutTree(model) {
    if (!model.nodes.length) return { ...model, nodes: [], edges: [], width: 760, height: 420 };
    if (model.mode === 'direct') return layoutPedigree(model);
    const generations = [...new Set(model.nodes.map((node) => node.generation))].sort((a, b) => a - b);
    const maxGeneration = Math.max(...generations, 0);
    const directCenters = model.mode === 'direct' ? tidyDirectPositions(model) : null;
    const desired = model.nodes.map((node, index) => ({
      ...node,
      _index: index,
      desiredX: model.mode === 'direct' ? directCenters.get(node.id) : index,
    }));
    const minDesired = Math.min(...desired.map((node) => node.desiredX));
    const normalized = desired.map((node) => ({ ...node, desiredX: node.desiredX - minDesired + MARGIN }));
    const placed = [];

    for (const generation of generations) {
      const peers = normalized
        .filter((node) => node.generation === generation)
        .sort((a, b) => a.desiredX - b.desiredX || a._index - b._index);
      let previousX = -Infinity;
      peers.forEach((node) => {
        const x = Math.max(node.desiredX, previousX + NODE_WIDTH + GAP_X);
        const rowPosition = model.mode === 'direct' ? maxGeneration - generation : generation;
        placed.push({
          ...node,
          x,
          y: MARGIN + rowPosition * (NODE_HEIGHT + GAP_Y),
          width: NODE_WIDTH,
          height: NODE_HEIGHT,
        });
        previousX = x;
      });
    }

    const minX = Math.min(...placed.map((node) => node.x));
    const shiftX = minX < MARGIN ? MARGIN - minX : 0;
    const laidOutNodes = placed.map(({ desiredX, _index, ...node }) => ({ ...node, x: node.x + shiftX }));
    const width = Math.max(760, ...laidOutNodes.map((node) => node.x + node.width + MARGIN));
    const height = Math.max(420, (maxGeneration + 1) * NODE_HEIGHT + maxGeneration * GAP_Y + MARGIN * 2);
    const nodeMap = new Map(laidOutNodes.map((node) => [node.id, node]));
    const edges = model.edges.map((edge) => ({ ...edge, fromNode: nodeMap.get(edge.from), toNode: nodeMap.get(edge.to) })).filter((edge) => edge.fromNode && edge.toNode);
    return { ...model, nodes: laidOutNodes, edges, width, height };
  }

  function getTreeAnchorPosition(layout, anchorId, scalePercent = 100) {
    const node = layout?.nodes?.find((item) => item.id === anchorId) || layout?.nodes?.find((item) => item.role === 'focus');
    if (!node) return null;
    const scale = normalizeTreeScale(scalePercent) / 100;
    return {
      id: node.id,
      x: (node.x + node.width / 2) * scale,
      y: (node.y + node.height / 2) * scale,
      width: node.width * scale,
      height: node.height * scale,
    };
  }

  function edgePath(edge) {
    const from = edge.fromNode;
    const to = edge.toNode;
    if (edge.type === 'parent-child' && from.x > to.x) {
      const startY = from.y + from.height / 2;
      const endY = to.y + to.height / 2;
      const middleX = (from.x + to.x + to.width) / 2;
      return `M ${from.x} ${startY} C ${middleX} ${startY}, ${middleX} ${endY}, ${to.x + to.width} ${endY}`;
    }
    if (edge.type !== 'parent-child' || from.y === to.y) {
      const fromRight = from.x <= to.x;
      const startX = fromRight ? from.x + from.width : from.x;
      const endX = fromRight ? to.x : to.x + to.width;
      return `M ${startX} ${from.y + from.height / 2} L ${endX} ${to.y + to.height / 2}`;
    }
    const fromAbove = from.y < to.y;
    const fromX = from.x + from.width / 2;
    const toX = to.x + to.width / 2;
    const fromY = fromAbove ? from.y + from.height : from.y;
    const toY = fromAbove ? to.y : to.y + to.height;
    const middleY = (fromY + toY) / 2;
    return `M ${fromX} ${fromY} C ${fromX} ${middleY}, ${toX} ${middleY}, ${toX} ${toY}`;
  }

  function lifeDates(person) {
    return RKPresentation.lifeYears(person);
  }

  const { cardBody, cardLabel, renderMarks } = RKComponents;

  const EVIDENCE_LEGEND = [
    ['verified', 'Ověřeno'],
    ['supported', 'Podpořeno prameny'],
    ['family-record', 'Rodinné vyprávění'],
    ['hypothesis', 'Hypotéza'],
    ['unknown', 'Jistota neuvedena'],
  ];

  function renderEvidenceLegend() {
    return `<div class="tree-evidence-legend" aria-label="Jistota vazeb mezi rodiči a dětmi"><span class="tree-evidence-legend-title">Čáry:</span>${EVIDENCE_LEGEND.map(([status, label]) => `<span><svg viewBox="0 0 34 10" width="34" height="10" aria-hidden="true" focusable="false"><path class="tree-edge edge-evidence-${status}" d="M 1 5 H 33"/>${status === 'hypothesis' ? '<text x="17" y="4" text-anchor="middle" class="tree-edge-question-text">?</text>' : ''}</svg>${label}</span>`).join('')}</div>`;
  }

  function nodeBranchClass(node) {
    if (node.branch === 'paternal') return 'tree-branch-paternal';
    if (node.branch === 'maternal') return 'tree-branch-maternal';
    if (node.branch === 'shared') return 'tree-branch-shared';
    if (node.branch === 'unknown') return 'tree-branch-unknown';
    return 'tree-branch-extended';
  }

  function branchNodeOrder(a, b) {
    if (a.generation !== b.generation) return a.generation - b.generation;
    const aPath = (a.sidePath || []).join('.');
    const bPath = (b.sidePath || []).join('.');
    return aPath.localeCompare(bPath) || a.id.localeCompare(b.id);
  }

  function selectionClasses(selection, id) {
    if (!selection) return '';
    return `${selection.nodeIds.has(id) ? ' is-tree-highlighted' : ' is-tree-dimmed'}${selection.selectedId === id ? ' is-tree-selected' : ''}`;
  }

  function renderMobileBranch(nodes, branch, label, selection) {
    const branchNodes = nodes
      .filter((node) => node.branch === branch || node.branch === 'shared' && branch !== 'unknown')
      .sort(branchNodeOrder);
    if (!branchNodes.length) return '';
    return `<details class="tree-mobile-branch tree-mobile-branch-${branch}" open><summary>${label}<span class="tree-mobile-branch-count">${branchNodes.length}</span></summary><div class="tree-mobile-branch-list">${branchNodes.map((node) => `<button class="tree-mobile-card ${nodeBranchClass(node)}${selectionClasses(selection, node.id)}" type="button" data-person-id="${escapeHtml(node.id)}" aria-pressed="${selection?.selectedId === node.id ? 'true' : 'false'}" aria-label="${escapeHtml(cardLabel(node.person, { number: node.number, role: node.relativeRole, marks: node.marks }))}"><span class="tree-mobile-card-name">${node.number ? `<span class="tree-node-number" aria-hidden="true">${node.number}</span> ` : ''}${escapeHtml(node.label)}</span><small>${escapeHtml(lifeDates(node.person))}</small><em>${escapeHtml(node.relativeRole)}</em>${renderMarks(node.marks)}</button>`).join('')}</div></details>`;
  }

  function renderMobileBranches(model, selection) {
    if (model.mode !== 'direct') return '';
    const ancestors = model.nodes.filter((node) => node.generation > 0);
    const sections = [
      renderMobileBranch(ancestors, 'paternal', 'Otcovská větev', selection),
      renderMobileBranch(ancestors, 'maternal', 'Mateřská větev', selection),
      renderMobileBranch(ancestors, 'unknown', 'Neurčená větev', selection),
    ].filter(Boolean);
    const focus = model.nodes.find((node) => node.role === 'focus');
    if (!focus) return '';
    const focusCard = `<button class="tree-mobile-focus tree-node-self tree-branch-extended${selectionClasses(selection, focus.id)}" type="button" data-person-id="${escapeHtml(focus.id)}" aria-pressed="${selection?.selectedId === focus.id ? 'true' : 'false'}" aria-label="${escapeHtml(`${focus.relativeRole}: ${focus.label}`)}"><span class="tree-mobile-card-name">${escapeHtml(focus.label)}</span><small>${escapeHtml(lifeDates(focus.person))}</small><em>${escapeHtml(focus.relativeRole)}</em></button>`;
    const content = sections.length ? sections.join('') : '<p class="tree-mobile-empty">Rodiče zatím nejsou v projektu uvedeni.</p>';
    return `<div class="tree-mobile-branches" aria-label="Samostatné větve vývodu"><div class="tree-mobile-focus-wrap">${focusCard}</div>${content}</div>`;
  }

  function renderFamilyTree(data, focusId, mode = 'direct', generationLimit = DEFAULT_GENERATION_LIMIT, scalePercent = 100, selectedPersonId = null) {
    const fullModel = createTreeModel(data, focusId, mode);
    const limit = normalizeGenerationLimit(generationLimit);
    const scale = normalizeTreeScale(scalePercent);
    const visibleModel = mode === 'direct' && limit !== 'all'
      ? (() => {
        const visibleIds = new Set(fullModel.nodes.filter((node) => node.generation < limit).map((node) => node.id));
        return {
          ...fullModel,
          nodes: fullModel.nodes.filter((node) => visibleIds.has(node.id)),
          edges: fullModel.edges.filter((edge) => visibleIds.has(edge.from) && visibleIds.has(edge.to)),
        };
      })()
      : fullModel;
    const selectedNode = visibleModel.nodes.find((node) => node.id === selectedPersonId);
    const selection = selectedNode ? (mode === 'direct' ? getTreeHighlight(visibleModel, selectedPersonId) : { selectedId: selectedPersonId, nodeIds: new Set([selectedPersonId]), edgeIds: new Set() }) : null;
    const unknown = getUnknownSlots(visibleModel, limit);
    const layout = layoutTree({ ...visibleModel, nodes: [...visibleModel.nodes, ...unknown.slots], edges: [...visibleModel.edges, ...unknown.edges] });
    const hasOlderGenerations = mode === 'direct' && limit !== 'all' && fullModel.nodes.some((node) => node.generation >= limit);
    const mobileBranches = renderMobileBranches(visibleModel, selection);
    // Branch names sit on the parents' cards, so they always match the drawing.
    const branchNames = { paternal: 'Otcovská větev', maternal: 'Mateřská větev', unknown: 'Neurčená větev' };
    const branchLabels = mode === 'direct' ? [...layout.nodes, ...(layout.slots || [])].filter((node) => node.generation === 1 && branchNames[node.branch])
      .map((node) => `<text class="tree-branch-label tree-branch-label-${node.branch}" x="${node.x}" y="${node.y - 9}">${branchNames[node.branch]}</text>`).join('') : '';
    const edgeMarkup = (edge) => {
      const status = edge.evidence || 'unknown';
      const statusLabel = RKPresentation.linkEvidenceLabels[status] || '';
      const question = status === 'hypothesis' && layout.orientation === 'horizontal'
        ? `<g class="tree-edge-question" aria-hidden="true"><circle cx="${(edge.fromNode.x + edge.toNode.x + edge.toNode.width) / 2}" cy="${(edge.fromNode.y + edge.fromNode.height / 2 + edge.toNode.y + edge.toNode.height / 2) / 2}" r="9"></circle><text class="tree-edge-question-text" x="${(edge.fromNode.x + edge.toNode.x + edge.toNode.width) / 2}" y="${(edge.fromNode.y + edge.fromNode.height / 2 + edge.toNode.y + edge.toNode.height / 2) / 2 + 4}" text-anchor="middle">?</text></g>`
        : '';
      return `<path class="tree-edge edge-${escapeHtml(edge.type)} edge-branch-${escapeHtml(edge.branch || 'extended')} edge-evidence-${escapeHtml(status)}${selection ? selection.edgeIds.has(treeEdgeId(edge)) ? ' is-tree-highlighted' : ' is-tree-dimmed' : ''}" d="${edgePath(edge)}">${statusLabel ? `<title>${escapeHtml(statusLabel)}</title>` : ''}</path>${question}`;
    };
    const scaledWidth = Math.round(layout.width * scale / 100);
    const scaledHeight = Math.round(layout.height * scale / 100);
    const anchor = getTreeAnchorPosition(layout, selectedPersonId || focusId, scale);
    return `${mobileBranches}<div class="tree-scroll tree-scroll-${mode}" tabindex="0" aria-label="Posuvný rodokmen" data-tree-anchor-id="${escapeHtml(anchor?.id || focusId)}" data-tree-anchor-x="${anchor?.x || 0}" data-tree-anchor-y="${anchor?.y || 0}" data-tree-anchor-width="${anchor?.width || 0}" data-tree-anchor-height="${anchor?.height || 0}" data-tree-content-width="${scaledWidth}" data-tree-content-height="${scaledHeight}">
      <svg class="family-tree" data-generation-limit="${limit}" data-tree-scale="${scale}" viewBox="0 0 ${layout.width} ${layout.height}" width="${scaledWidth}" height="${scaledHeight}" role="group" aria-labelledby="tree-svg-title tree-svg-desc">
        <title id="tree-svg-title">${mode === 'direct' ? 'Vývod předků' : 'Rodinné okolí zvolené osoby'}</title>
        <desc id="tree-svg-desc">${mode === 'direct' ? 'Zvolená osoba je vlevo, předkové po generacích vpravo, otec vždy nad matkou. Čísla odpovídají tištěné knize. Styl čáry ukazuje, jak jistá je vazba. Kliknutím na osobu otevřete její profil a zvýrazníte cestu k evidovaným předkům.' : 'Kliknutím na osobu otevřete její profil.'}${hasOlderGenerations ? ' Starší generace zobrazíte zvýšením rozsahu.' : ''}</desc>
        <g class="tree-edges">${(layout.slotEdges || []).map((edge) => `<path class="tree-edge edge-placeholder" d="${edgePath(edge)}"></path>`).join('')}${layout.edges.map(edgeMarkup).join('')}</g>
        <g class="tree-labels" aria-hidden="true">${branchLabels}</g>
        <g class="tree-nodes">${layout.nodes.map((node) => `<foreignObject x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}"><button xmlns="http://www.w3.org/1999/xhtml" class="tree-node tree-node-${escapeHtml(node.person.lineage || 'unknown')} ${nodeBranchClass(node)}${node.role === 'focus' ? ' is-focus' : ''}${selectionClasses(selection, node.id)}" type="button" data-person-id="${escapeHtml(node.id)}" aria-pressed="${selection?.selectedId === node.id ? 'true' : 'false'}" aria-label="${escapeHtml(cardLabel(node.person, { number: node.number, role: node.relativeRole, marks: node.marks }))}" title="${escapeHtml(node.label)}">${cardBody(node.person, { number: node.number, role: node.relativeRole, marks: node.marks })}</button></foreignObject>`).join('')}${(layout.slots || []).map((slot) => `<foreignObject x="${slot.x}" y="${slot.y}" width="${slot.width}" height="${slot.height}"><div xmlns="http://www.w3.org/1999/xhtml" class="tree-node tree-node-placeholder ${nodeBranchClass(slot)}" role="note" aria-label="${escapeHtml(`${slot.number ? `číslo ${slot.number} · ` : ''}${slot.label} – zatím nedohledáno`)}"><span class="tree-node-head">${slot.number ? `<span class="tree-node-number" aria-hidden="true">${slot.number}</span>` : ''}<span class="tree-node-name">${escapeHtml(slot.label)}</span></span><span class="tree-node-meta"><small class="tree-node-dates">zatím nedohledáno</small><em class="tree-node-role">${escapeHtml(slot.relativeRole)}</em></span></div></foreignObject>`).join('')}</g>
      </svg><div class="tree-scroll-anchor-spacer" aria-hidden="true"></div>
    </div>`;
  }

  function renderTreeView(data, state) {
    const focusId = state.focusPersonId || data.meta.defaultPersonId;
    const focus = RKModel.getPerson(data, focusId) || RKModel.getPerson(data, data.meta.defaultPersonId);
    const mode = state.treeMode === 'full' ? 'full' : 'direct';
    const generationLimit = normalizeGenerationLimit(state.treeGenerationLimit ?? state.treeGenerations ?? DEFAULT_GENERATION_LIMIT);
    const scale = normalizeTreeScale(state.treeScale);
    const people = [...data.people].sort((a, b) => a.displayName.localeCompare(b.displayName, 'cs'));
    const generationOptions = [`<option value="all"${generationLimit === 'all' ? ' selected' : ''}>Všechny zapsané</option>`, ...[2, 3, 4, 5, 6, 7, 8].map((count) => `<option value="${count}"${count === generationLimit ? ' selected' : ''}>${count} generace</option>`)].join('');
    const parentSides = mode === 'full' ? RKFullTree.getParentSides(data, focus.id) : null;
    const sideActions = parentSides ? [['paternal', 'Strana otce', 'Otec'], ['maternal', 'Strana matky', 'Matka']].map(([side, label, parent]) => {
      const available = parentSides[side].length > 0;
      const names = parentSides[side].map((id) => RKModel.getPerson(data, id)?.displayName).join(', ');
      return `<button type="button" data-full-tree-action="${side}" aria-pressed="false"${available ? '' : ' disabled'} title="${escapeHtml(available ? `Rozbalit větev: ${names}` : `${parent} není v zapsaných rodičích určený`)}">${label}</button>`;
    }).join('') : '';
    const legend = mode === 'direct'
      ? '<span class="legend-paternal">Otcovská větev</span><span class="legend-maternal">Mateřská větev</span><span class="legend-unknown">Neurčená větev</span>'
      : '<span class="legend-direct">Přímá linie</span><span class="legend-collateral">Vedlejší větev</span><span class="legend-affinal">Partnerství</span>';
    return `<section class="view tree-view tree-view-${mode}" aria-labelledby="tree-title">
      <div class="view-header"><div><h1 id="tree-title">Rodokmen</h1><p>Vztahy a generace · zaměřeno na <strong>${escapeHtml(focus.displayName)}</strong></p></div></div>
      <div class="tree-toolbar tree-toolbar-${mode}">
        ${RKComponents.personPicker({ id: 'tree-focus', attribute: 'data-focus-person', people, relationships: data.relationships, selectedId: focus.id, label: 'Zvolená osoba' })}
        <div class="tree-mode-controls" role="group" aria-label="Způsob zobrazení rodokmenu"><button type="button" data-tree-mode="direct" aria-pressed="${mode === 'direct' ? 'true' : 'false'}">Vývod předků</button>${globalThis.RK_EDITION === 'light' ? '<span class="muted tree-mode-note">Celý rodokmen je v plném vydání.</span>' : `<button type="button" data-tree-mode="full" aria-pressed="${mode === 'full' ? 'true' : 'false'}">Celý rodokmen</button>`}</div>
        ${mode === 'direct' ? `<label>Generace<select data-tree-generations>${generationOptions}</select></label>` : ''}
        <div class="tree-scale-controls" aria-label="Měřítko rodokmenu"><button type="button" data-tree-zoom="out" aria-label="Oddálit rodokmen">−</button><output data-tree-scale>${scale} %</output><button type="button" data-tree-zoom="in" aria-label="Přiblížit rodokmen">+</button><button type="button" data-tree-zoom="fit" aria-label="Přizpůsobit rodokmen">Přizpůsobit</button><button type="button" data-tree-zoom="reset" aria-label="Obnovit měřítko rodokmenu">100 %</button><button type="button" class="print-action tree-print" data-print>Vytisknout</button></div>
        ${mode === 'full' ? `<div class="full-tree-actions" role="group" aria-label="Rozsah rozbalení rodokmenu">${sideActions}<button type="button" data-full-tree-action="expand-all">Rozbalit vše</button><button type="button" data-full-tree-action="reset">Sbalit vedlejší větve</button></div>` : ''}
        <div class="tree-legend" aria-label="Legenda barev karet">${legend}</div>
        ${renderEvidenceLegend()}
      </div>
      <details class="tree-help"><summary>Jak rodokmen ovládat</summary><p>${mode === 'direct' ? 'Zvolená osoba je vlevo, předkové po generacích vpravo; otec je vždy nad matkou. Číslo v rohu karty je stejné jako v tištěné knize (otec má dvojnásobek čísla dítěte, matka o jedno víc). Plná čára je ověřená vazba, čárkovaná podpořená prameny, čerchovaná podle rodinného vyprávění a tečkovaná s otazníkem hypotéza. Prázdná karta „Neznámý otec / Neznámá matka“ ukazuje, kde zápisy zatím končí. Kliknutím na osobu otevřeš její profil a zvýrazníš cestu k evidovaným předkům. Posun: táhni levým tlačítkem po volné ploše, případně použij prostřední tlačítko nebo kolečko. Ctrl + kolečko: měřítko. Vztahy zůstávají podle evidovaných vazeb.' : 'Rozbaluj rodiny směrem k předkům nebo potomkům. Kliknutím na osobu otevřeš její profil; spojení vychází pouze ze zapsaných vztahů. Posun: táhni po volné ploše a měřítko upravíš ovladači nebo Ctrl + kolečkem.'}</p></details>
      ${mode === 'full' ? '<div class="tree-scroll tree-scroll-full" tabindex="0" aria-label="Posuvný úplný rodokmen"><div class="full-tree-viewport" data-full-tree-viewport></div></div>' : renderFamilyTree(data, focus.id, mode, generationLimit, scale, state.treeSelectedPersonId)}
    </section>`;
  }

  return { createTreeModel, getTreeHighlight, getUnknownSlots, layoutTree, getTreeAnchorPosition, renderFamilyTree, renderTreeView, relativeRole, lifeDates, cardBody, cardLabel, renderMarks, renderEvidenceLegend, normalizeGenerationLimit, normalizeTreeScale };
});
