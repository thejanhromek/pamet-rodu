const test = require('node:test');
const assert = require('node:assert/strict');
const { tileGrid } = require('../tools/mza-crop.js');

test('MZA crop tool picks the deepest level within the width budget and the covering tiles', () => {
  const size = { width: 7447, height: 5787, tileSize: 256 };
  const full = tileGrid(size, [0, 0, 1, 1], 1600);
  assert.equal(full.maxLevel, 13);
  assert.equal(full.level, 10);
  assert.ok(full.width <= 1600);

  const row = tileGrid(size, [0.52, 0.2, 0.7, 0.31], 3200);
  assert.equal(row.level, 13);
  assert.deepEqual([row.width, row.height], [Math.ceil(0.7 * 7447) - Math.floor(0.52 * 7447), Math.ceil(0.31 * 5787) - Math.floor(0.2 * 5787)]);
  assert.deepEqual(row.tiles[0], { tx: 15, ty: 4, dx: 15 * 256 - 3872, dy: 4 * 256 - 1157 });
  assert.equal(row.tiles.length, 6 * 4);
});
