import test from 'node:test';
import assert from 'node:assert/strict';
import { simplifyLine, simplifyGeometry } from '../scripts/lib/simplify-geo.mjs';

test('Douglas–Peucker keeps corners and drops points on a straight edge', () => {
  const line = [[0, 0], [1, 0.001], [2, 0], [2, 2], [0, 2], [0, 0]];
  assert.deepEqual(simplifyLine(line, 0.05), [[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]);
});

test('tiny islands disappear, countries keep their name and shape', () => {
  const geo = { type: 'FeatureCollection', source: { name: 'test' }, features: [
    { type: 'Feature', properties: { name: 'Země', extra: 'x' }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [5, 0], [5, 5], [0, 5], [0, 0]]] } },
    { type: 'Feature', properties: { name: 'Ostrůvek' }, geometry: { type: 'Polygon', coordinates: [[[10, 10], [10.001, 10], [10.001, 10.001], [10, 10]]] } },
  ] };
  const result = simplifyGeometry(geo, { tolerance: 0.05 });
  assert.equal(result.features.length, 1);
  assert.deepEqual(result.features[0].properties, { name: 'Země' });
  assert.equal(result.source.name, 'test');
  assert.deepEqual(result.simplified, { tolerance: 0.05, decimals: 2 });
});
