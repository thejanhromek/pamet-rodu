const test = require('node:test');
const assert = require('node:assert/strict');
const RKMap = require('../src/map.js');

test('map places are copied from arbitrary datasets and only finite geographic coordinates are mapped', () => {
  const input = [
    { id: 'alpha', name: 'Alpha', lat: 51, lon: 0 },
    { id: 'beta', name: 'Beta', country: 'Australia', lat: -33.8, lon: 151.2 },
    { id: 'missing', name: 'No coordinates' },
    { id: 'bad', name: 'Invalid', lat: 500, lon: Infinity },
  ];
  const mapped = RKMap.getMapPlaces(input);
  assert.deepEqual(mapped.map(({ id }) => id), ['alpha', 'beta']);
  assert.notEqual(mapped[0], input[0]);
  assert.deepEqual(input[0], { id: 'alpha', name: 'Alpha', lat: 51, lon: 0 });
});

test('map bounds are finite for empty and single-point datasets', () => {
  assert.equal(RKMap.getMapBounds([]), null);
  assert.deepEqual(RKMap.getMapBounds([{ id: 'south', lat: -41, lon: -73 }]), {
    south: -41, north: -41, west: -73, east: -73,
  });
});

test('map bounds use the shortest longitude arc across the dateline', () => {
  const bounds = RKMap.getMapBounds([
    { id: 'west-of-date-line', lat: -12, lon: 179.4 },
    { id: 'east-of-date-line', lat: 7, lon: -179.2 },
  ]);
  assert.equal(bounds.south, -12);
  assert.equal(bounds.north, 7);
  assert.ok(bounds.east - bounds.west < 2);
  assert.ok(bounds.west > 170);
  assert.ok(bounds.east > 180);
});

test('map marker longitudes stay inside fitted bounds despite floating point boundary noise', () => {
  const places = [
    { id: 'west', lat: -34.6, lon: -58.4 },
    { id: 'east', lat: 35.7, lon: 139.7 },
    { id: 'middle', lat: 48.86, lon: 2.35 },
  ];
  const bounds = RKMap.getMapBounds(places);
  const normalized = places.map(({ lon }) => RKMap.normalizedLongitude(lon, bounds.west));
  normalized.forEach((lon, index) => {
    assert.ok(Math.abs(lon - places[index].lon) < 1e-9);
    assert.ok(lon >= bounds.west && lon <= bounds.east);
  });
});

test('world outlines wrap into a dateline-crossing fitted longitude window', () => {
  const geometry = {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: {
      type: 'Polygon', coordinates: [[[-179, 10], [-170, 10], [-170, 20], [-179, 20], [-179, 10]]],
    } }],
  };
  const bounds = RKMap.getMapBounds([
    { id: 'west', lat: 10, lon: 179 },
    { id: 'east', lat: 20, lon: -179 },
  ]);
  const wrapped = RKMap.wrapWorldGeometry(geometry, bounds);
  assert.deepEqual(wrapped.features[0], geometry.features[0], 'The original world remains available for pan and zoom');
  const translated = wrapped.features.find((feature) => feature.geometry.coordinates[0][0][0] > 180);
  assert.ok(translated, 'The adjacent world copy must cover points beyond the dateline');
  const longitudes = translated.geometry.coordinates[0].map(([lon]) => lon);
  assert.deepEqual(longitudes, [181, 190, 190, 181, 181]);
  assert.ok(longitudes.every((lon) => lon >= bounds.west && lon <= bounds.east + 11));
});

test('world outline wrapping shifts each polygon intact across the selected west boundary', () => {
  const geometry = {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: {
      type: 'MultiPolygon', coordinates: [
        [[[178, 0], [179.7, 0], [179.7, 1], [178, 1], [178, 0]]],
        [[[-179.7, 0.2], [-179.2, 0.2], [-179.2, 0.8], [-179.7, 0.8], [-179.7, 0.2]]],
      ],
    } }],
  };
  const bounds = RKMap.getMapBounds([
    { id: 'west', lat: 0, lon: 179 },
    { id: 'east', lat: 1, lon: -179 },
  ]);
  const wrapped = RKMap.wrapWorldGeometry(geometry, bounds);
  assert.deepEqual(wrapped.features[0], geometry.features[0]);
  assert.equal(wrapped.features.length, 2, 'Both sides of a polygon intersecting the selected longitude arc must remain available');
  const polygons = wrapped.features[0].geometry.coordinates;
  polygons.forEach((polygon, index) => {
    const ring = polygon[0];
    const original = geometry.features[0].geometry.coordinates[index][0];
    const shift = ring[0][0] - original[0][0];
    ring.forEach(([lon], point) => assert.ok(Math.abs(lon - original[point][0] - shift) < 1e-9));
    for (let point = 1; point < ring.length; point += 1) {
      assert.ok(Math.abs(ring[point][0] - ring[point - 1][0]) < 2);
    }
  });
  const adjacent = wrapped.features[1].geometry.coordinates;
  assert.equal(adjacent[1][0][0][0], 180.3);
  adjacent.forEach((polygon, index) => {
    polygon[0].forEach(([lon], point) => assert.ok(Math.abs(lon - geometry.features[0].geometry.coordinates[index][0][point][0] - 360) < 1e-9));
  });
});

test('identical coordinate records remain distinct selectable map places', () => {
  const mapped = RKMap.getMapPlaces([
    { id: 'a', name: 'A', lat: 10, lon: 20 },
    { id: 'b', name: 'B', lat: 10, lon: 20 },
  ]);
  assert.deepEqual(mapped.map(({ id }) => id), ['a', 'b']);
});

test('overview camera uses a valid preferred view, leaves plain wheel to the page, and reset fits every place', () => {
  const calls = { setView: [], fitBounds: [], marker: [], layerAdded: [], selected: [] };
  const map = {
    setView(...args) { calls.setView.push(args); return this; },
    fitBounds(...args) { calls.fitBounds.push(args); return this; },
    addLayer(layer) { calls.layerAdded.push(layer); return this; },
    getContainer() { return container; },
    remove() {},
  };
  const container = { querySelectorAll: () => [] };
  const worldLayer = { addTo() {}, getBounds: () => ({ isValid: () => true }) };
  const group = {
    addLayer(marker) { calls.marker.push(marker); },
    addTo() { calls.marker.forEach((marker) => marker.fire('add')); },
    on() {},
  };
  const zoomControl = { addTo() {} };
  const fakeL = {
    map(_container, options) { calls.options = options; return map; },
    geoJSON() { return worldLayer; },
    control: { zoom: (options) => { calls.zoomOptions = options; return zoomControl; } },
    Control: { extend: (definition) => class { constructor() { this.definition = definition; } addTo() {} } },
    DomUtil: { create: () => ({ setAttribute() {}, addEventListener() {} }) },
    DomEvent: { disableClickPropagation() {}, on() {}, stop() {} },
    markerClusterGroup: (options) => { calls.clusterOptions = options; return group; },
    divIcon: (options) => options,
    marker(latlng, options) {
      const listeners = new Map();
      const elementListeners = new Map();
      const element = {
        attributes: {},
        setAttribute(name, value) { this.attributes[name] = value; },
        addEventListener(name, listener) { elementListeners.set(name, listener); },
        focus() { calls.focused = this; },
      };
      const marker = {
        latlng,
        options,
        element,
        on(name, listener) { listeners.set(name, listener); return this; },
        fire(name, event = {}) { listeners.get(name)?.(event); return this; },
        bindTooltip() {},
        getElement: () => element,
        simulateKey(key, event) { elementListeners.get('keydown')?.({ key, preventDefault() { event.prevented = true; }, stopPropagation() { event.stopped = true; }, ...event }); },
      };
      return marker;
    },
    latLng: (lat, lng) => ({ lat, lng }),
    latLngBounds: (southWest, northEast) => ({ southWest, northEast }),
  };
  const previousL = globalThis.L;
  const previousDocument = globalThis.document;
  globalThis.L = fakeL;
  globalThis.document = { createElement: () => ({ textContent: '' }) };
  try {
    const places = [
      { id: 'local', name: 'Local', lat: 49, lon: 15 },
      { id: 'far', name: 'Far', lat: -33.8, lon: 151.2 },
    ];
    const controller = RKMap.mount(container, places, {
      worldGeometry: { type: 'FeatureCollection', features: [] },
      initialBounds: { south: 48.4, north: 51.2, west: 12, east: 19 },
      onPlaceSelect: (id) => calls.selected.push(id),
    });
    assert.ok(Number.isFinite(calls.options.maxZoom));
    assert.equal(calls.options.scrollWheelZoom, false, 'Plain wheel must scroll the page, not zoom the map');
    const allLongitudes = Array.from({ length: 36 }, (_, index) => ({ id: `global-${index}`, lat: 0, lon: index * 10 - 180 }));
    const globalBounds = RKMap.getMapBounds(allLongitudes);
    const widthAtMinimumZoom = (globalBounds.east - globalBounds.west) / 360 * 256 * 2 ** calls.options.minZoom;
    assert.ok(widthAtMinimumZoom + 60 <= 285, 'Every position must fit the narrow mobile map with marker padding');
    assert.deepEqual(calls.setView[0], [[15, 0], 2]);
    assert.equal(calls.fitBounds.length, 1);
    assert.deepEqual(calls.fitBounds[0][0].southWest, { lat: 48.4, lng: 12 });
    assert.deepEqual(calls.fitBounds[0][0].northEast, { lat: 51.2, lng: 19 });
    assert.equal(calls.marker.length, 2);
    assert.equal(calls.marker[0].options.icon.iconSize[0], 44);
    assert.equal(calls.zoomOptions.zoomInTitle, 'Přiblížit');
    assert.equal(calls.zoomOptions.zoomOutTitle, 'Oddálit');
    const spaceEvent = {};
    calls.marker[0].simulateKey(' ', spaceEvent);
    assert.deepEqual(calls.selected, ['local']);
    assert.equal(spaceEvent.prevented, true);
    assert.equal(spaceEvent.stopped, true);
    const enterEvent = {};
    calls.marker[0].simulateKey('Enter', enterEvent);
    assert.deepEqual(calls.selected, ['local', 'local']);
    assert.equal(enterEvent.prevented, true);
    assert.equal(enterEvent.stopped, true);
    const clusterIcon = calls.clusterOptions.iconCreateFunction({ getChildCount: () => 7 });
    assert.equal(clusterIcon.iconSize[0], 48);
    assert.match(clusterIcon.html, />7</);
    controller.reset();
    assert.equal(calls.fitBounds.length, 2);
    const allPlaceBounds = RKMap.getMapBounds(places);
    assert.deepEqual(calls.fitBounds[1][0].southWest, { lat: allPlaceBounds.south, lng: allPlaceBounds.west });
    assert.deepEqual(calls.fitBounds[1][0].northEast, { lat: allPlaceBounds.north, lng: allPlaceBounds.east });
    const fallbackController = RKMap.mount(container, places, {
      initialBounds: { south: 90, north: -90, west: 12, east: 19 },
    });
    assert.equal(calls.fitBounds.length, 3);
    assert.deepEqual(calls.fitBounds[2][0].southWest, { lat: allPlaceBounds.south, lng: allPlaceBounds.west });
    assert.deepEqual(calls.fitBounds[2][0].northEast, { lat: allPlaceBounds.north, lng: allPlaceBounds.east });
    fallbackController.destroy();
    controller.destroy();
  } finally {
    if (previousL === undefined) delete globalThis.L;
    else globalThis.L = previousL;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

