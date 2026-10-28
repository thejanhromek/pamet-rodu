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

test('MZA crop tool spaces requests and caps concurrency so the server is not flooded', async () => {
  const { createLimiter, mzaConfig } = require('../tools/mza-crop.js');
  const starts = [];
  let running = 0;
  let peak = 0;
  const limiter = createLimiter({ concurrency: 2, minGapMs: 40 });
  await Promise.all(Array.from({ length: 6 }, () => limiter.run(async () => {
    starts.push(Date.now());
    running++;
    peak = Math.max(peak, running);
    await new Promise((resolve) => setTimeout(resolve, 5));
    running--;
  })));
  assert.ok(peak <= 2, `peak concurrency ${peak}`);
  // Tolerance for timer granularity on Windows.
  for (let i = 1; i < starts.length; i++) assert.ok(starts[i] - starts[i - 1] >= 25, `gap ${starts[i] - starts[i - 1]} ms`);

  const defaults = mzaConfig();
  assert.ok(defaults.concurrency <= 2 && defaults.minGapMs >= 300);
  assert.ok(defaults.maxTilesPerCrop <= 60 && defaults.sessionBudget <= 1500);
});

test('MZA crop tool enhancement lifts faded ink against a stained background', () => {
  const { enhanceGray } = require('../tools/mza-crop.js');
  const width = 120, height = 40;
  const values = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const paper = 120 + x; // uneven lighting from left to right
      values[y * width + x] = (x % 20 === 10) ? paper - 25 : paper; // faint ink strokes
    }
  }
  const out = enhanceGray(values, width, height);
  const row = 20 * width;
  // Ink comes out clearly darker than the paper next to it at both ends of the uneven page.
  assert.ok(out[row + 10] + 80 < out[row + 15], `left ink ${out[row + 10]} vs paper ${out[row + 15]}`);
  assert.ok(out[row + 110] + 80 < out[row + 115], `right ink ${out[row + 110]} vs paper ${out[row + 115]}`);
});
