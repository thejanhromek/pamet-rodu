(function registerKinship(root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const model = isNode ? require('./model.js') : root.RKModel;
  const api = factory(model);
  if (isNode) module.exports = api;
  root.RKKinship = api;
})(globalThis, function createKinship(model) {
  'use strict';

  // How two people are related, as a chain of people: up from the first to
  // the closest common ancestor (or ancestral couple) and down to the second.
  // Partners are joined at the end or the start of the chain. The wording
  // comes from RKPresentation.relationshipLabel; this module only finds the
  // path and whether the blood relation is full or half.

  function index(data) {
    const parents = new Map();
    const spouses = new Map();
    const add = (map, key, value) => map.set(key, new Set([...(map.get(key) || []), value]));
    for (const link of data.relationships || []) {
      if (link.type === 'parent-child') add(parents, link.to, link.from);
      if (link.type === 'spouse') { add(spouses, link.from, link.to); add(spouses, link.to, link.from); }
    }
    return { parents, spouses };
  }

  // Ancestors with their depth and the child through which they were reached.
  function ancestry(idx, id) {
    const found = new Map([[id, { depth: 0, via: null }]]);
    const queue = [id];
    while (queue.length) {
      const current = queue.shift();
      for (const parent of idx.parents.get(current) || []) {
        if (found.has(parent)) continue;
        found.set(parent, { depth: found.get(current).depth + 1, via: current });
        queue.push(parent);
      }
    }
    return found;
  }

  function chainUp(found, ancestorId) {
    const chain = [];
    for (let id = ancestorId; id !== null; id = found.get(id).via) chain.push(id);
    return chain; // ancestor … start
  }

  function bloodPath(idx, aId, bId) {
    const fromA = ancestry(idx, aId);
    const fromB = ancestry(idx, bId);
    let best = null;
    for (const [ancestorId, { depth: up }] of fromA) {
      if (!fromB.has(ancestorId)) continue;
      const down = fromB.get(ancestorId).depth;
      if (!best || up + down < best.up + best.down || (up + down === best.up + best.down && up < best.up)) best = { ancestorId, up, down };
    }
    if (!best) return null;
    const upChain = chainUp(fromA, best.ancestorId).reverse(); // a … ancestor
    const downChain = chainUp(fromB, best.ancestorId).slice(1); // after ancestor … b
    const path = [...upChain, ...downChain];
    // The partner of the common ancestor who is an ancestor of both at the same
    // depth makes it a full relation (shared couple); otherwise half.
    const partners = [...(idx.parents.get(upChain[upChain.length - 2]) || [])].filter((id) => id !== best.ancestorId);
    const couple = partners.find((id) => fromA.get(id)?.depth === best.up && fromB.get(id)?.depth === best.down);
    const collateral = best.up > 0 && best.down > 0;
    return {
      up: best.up, down: best.down, path,
      commonAncestorIds: couple ? [best.ancestorId, couple] : [best.ancestorId],
      half: collateral && !couple && (idx.parents.get(upChain[upChain.length - 2]) || new Set()).size > 1 && (idx.parents.get(downChain[0]) || new Set()).size > 1,
    };
  }

  function kinshipPath(data, aId, bId) {
    if (!aId || !bId) return null;
    const relationship = model.getRelationship(data, aId, bId);
    if (relationship.kind === 'self') return { relationship, path: [aId], commonAncestorIds: [], half: false };
    const idx = index(data);
    if (relationship.kind === 'blood') return { relationship, ...bloodPath(idx, aId, bId) };
    if (relationship.kind === 'spouse') return { relationship, path: [aId, bId], commonAncestorIds: [], half: false, partnerSteps: [[aId, bId]] };
    if (relationship.kind === 'relative-partner') {
      const blood = bloodPath(idx, aId, relationship.relativeId);
      return { relationship, path: [...blood.path, bId], commonAncestorIds: blood.commonAncestorIds, half: blood.half, partnerSteps: [[relationship.relativeId, bId]] };
    }
    if (relationship.kind === 'partner-relative') {
      const blood = bloodPath(idx, relationship.partnerId, bId);
      return { relationship, path: [aId, ...blood.path], commonAncestorIds: blood.commonAncestorIds, half: blood.half, partnerSteps: [[aId, relationship.partnerId]] };
    }
    return { relationship, path: [], commonAncestorIds: [], half: false };
  }

  return { kinshipPath };
});
