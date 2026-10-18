// A lighter world outline for the light edition: every ring is simplified
// with the Ramer–Douglas–Peucker algorithm (`tolerance` in degrees), the
// coordinates are rounded to `decimals` places and rings that collapse below
// a triangle are dropped. Fine for a background map of a family's places.

function perpendicularDistance([x, y], [x1, y1], [x2, y2]) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(x - x1, y - y1);
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}

export function simplifyLine(points, tolerance) {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop();
    let farthest = -1;
    let distance = 0;
    for (let index = start + 1; index < end; index += 1) {
      const current = perpendicularDistance(points[index], points[start], points[end]);
      if (current > distance) { distance = current; farthest = index; }
    }
    if (farthest > 0 && distance > tolerance) {
      keep[farthest] = 1;
      stack.push([start, farthest], [farthest, end]);
    }
  }
  return points.filter((_, index) => keep[index]);
}

export function simplifyGeometry(geojson, { tolerance = 0.08, decimals = 2 } = {}) {
  const factor = 10 ** decimals;
  const round = ([lon, lat]) => [Math.round(lon * factor) / factor, Math.round(lat * factor) / factor];
  const ring = (points) => {
    const out = [];
    for (const point of simplifyLine(points, tolerance).map(round)) {
      const last = out[out.length - 1];
      if (!last || last[0] !== point[0] || last[1] !== point[1]) out.push(point);
    }
    return out.length >= 4 ? out : null;
  };
  const polygon = (rings) => {
    const kept = rings.map(ring);
    return kept[0] ? kept.filter(Boolean) : null;
  };
  const geometry = (value) => {
    if (!value) return value;
    if (value.type === 'Polygon') {
      const coordinates = polygon(value.coordinates);
      return coordinates ? { type: 'Polygon', coordinates } : null;
    }
    if (value.type === 'MultiPolygon') {
      const coordinates = value.coordinates.map(polygon).filter(Boolean);
      return coordinates.length ? { type: 'MultiPolygon', coordinates } : null;
    }
    return value;
  };
  return {
    ...geojson,
    simplified: { tolerance, decimals },
    features: (geojson.features || [])
      .map((feature) => ({ type: 'Feature', properties: { name: feature.properties?.name || '' }, geometry: geometry(feature.geometry) }))
      .filter((feature) => feature.geometry),
  };
}
