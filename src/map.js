(function registerMap(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.RKMap = api;
})(globalThis, function createMapModule() {
  'use strict';

  function validPlace(place) {
    return place && typeof place.id === 'string'
      && Number.isFinite(place.lat) && place.lat >= -90 && place.lat <= 90
      && Number.isFinite(place.lon) && place.lon >= -180 && place.lon <= 180;
  }

  function getMapPlaces(places = []) {
    return (Array.isArray(places) ? places : []).filter(validPlace).map((place) => ({ ...place }));
  }

  function getMapBounds(places = []) {
    const mapped = getMapPlaces(places);
    if (!mapped.length) return null;
    const latitudes = mapped.map((place) => place.lat);
    const longitudes = mapped.map((place) => (place.lon + 360) % 360).sort((a, b) => a - b);
    let largestGap = -1;
    let arcStart = longitudes[0];
    for (let index = 0; index < longitudes.length; index += 1) {
      const next = index === longitudes.length - 1 ? longitudes[0] + 360 : longitudes[index + 1];
      const gap = next - longitudes[index];
      if (gap > largestGap) {
        largestGap = gap;
        arcStart = next % 360;
      }
    }
    const west = arcStart > 180 ? arcStart - 360 : arcStart;
    const east = west + (360 - largestGap);
    return { south: Math.min(...latitudes), north: Math.max(...latitudes), west, east };
  }

  function getValidInitialBounds(value) {
    if (!value || typeof value !== 'object') return null;
    const { south, north, west, east } = value;
    if (![south, north, west, east].every(Number.isFinite)) return null;
    if (south < -90 || north > 90 || south > north) return null;
    if (west < -180 || west > 180 || east <= west || east > west + 360) return null;
    return { south, north, west, east };
  }

  function normalizedLongitude(lon, west) {
    const delta = lon - west;
    if (delta >= -1e-9 && delta < 360 - 1e-9) return Math.abs(delta) < 1e-9 ? west : lon;
    return west + (((delta % 360) + 360) % 360);
  }

  function wrapWorldGeometry(geometry, bounds) {
    if (!geometry || !bounds || bounds.east < 180) return geometry;
    function shiftCoordinates(coordinates) {
      if (Array.isArray(coordinates)) {
        if (coordinates.length >= 2 && typeof coordinates[0] === 'number' && typeof coordinates[1] === 'number') {
          return [coordinates[0] + 360, ...coordinates.slice(1)];
        }
        return coordinates.map(shiftCoordinates);
      }
      return coordinates;
    }
    function translatedCopy(value) {
      if (!value || typeof value !== 'object') return value;
      const copy = { ...value };
      if (Array.isArray(value.features)) copy.features = value.features.map(translatedCopy);
      if (Array.isArray(value.geometries)) copy.geometries = value.geometries.map(translatedCopy);
      if (value.geometry) copy.geometry = translatedCopy(value.geometry);
      if (Array.isArray(value.coordinates)) copy.coordinates = shiftCoordinates(value.coordinates);
      return copy;
    }
    // Keep both world copies: selecting a copy by its center can hide the
    // visible edge of a country or island intersecting the fitted window.
    const adjacent = translatedCopy(geometry);
    if (geometry.type === 'FeatureCollection') return { ...geometry, features: [...geometry.features, ...adjacent.features] };
    if (geometry.type === 'Feature') return { type: 'FeatureCollection', features: [geometry, adjacent] };
    return { type: 'GeometryCollection', geometries: [geometry, adjacent] };
  }

  // A plain wheel keeps scrolling the page. Ctrl/Cmd + wheel zooms at once;
  // a click on the map enables plain wheel zoom until the pointer leaves it.
  function bindWheelZoom(map, container, onViewChange) {
    container.addEventListener?.('wheel', (event) => {
      if (!(event.ctrlKey || event.metaKey) || map.scrollWheelZoom?.enabled?.()) return;
      event.preventDefault();
      map.setZoomAround(map.mouseEventToContainerPoint(event), map.getZoom() + (event.deltaY < 0 ? 0.5 : -0.5));
    }, { passive: false });
    map.on?.('click', () => map.scrollWheelZoom?.enable?.());
    map.on?.('move zoom', () => onViewChange?.());
    container.addEventListener?.('mouseleave', () => map.scrollWheelZoom?.disable?.());
  }

  // Same numbering as the printed book: the person is generation 1.
  function generationLabel(depth) {
    return ({ 0: 'Vybraná osoba', 1: 'Rodiče', 2: 'Prarodiče', 3: 'Praprarodiče' })[depth] || `${depth + 1}. generace předků`;
  }

  function firstYear(...values) {
    for (const value of values) {
      const match = String(value || '').match(/(?<!\d)(\d{4})(?!\d)/);
      if (match) return Number(match[1]);
    }
    return null;
  }

  // Where the ancestors of one person were born and died, generation by
  // generation, from recorded birth/death placeIds only. `depths` maps each
  // ancestor id to its generation (0 = the person), e.g. RKModel.getAncestorDepths.
  // Lines join a parent's birthplace with the child's birthplace.
  function buildMigration(data, depths) {
    const placesById = new Map(getMapPlaces(data?.places).map((place) => [place.id, place]));
    const people = new Map((data?.people || []).map((person) => [person.id, person]));
    const byDepth = new Map();
    const usedPlaces = new Set();
    let unmapped = 0;
    for (const [personId, depth] of depths || []) {
      const person = people.get(personId);
      if (!person) continue;
      const generation = byDepth.get(depth) || { depth, label: generationLabel(depth), people: [], stops: [] };
      byDepth.set(depth, generation);
      const entry = {
        id: person.id,
        name: person.displayName,
        birthYear: firstYear(person.birth?.date, person.birth?.dateText),
        deathYear: firstYear(person.death?.date, person.death?.dateText),
        birthPlaceId: placesById.has(person.birth?.placeId) ? person.birth.placeId : null,
        deathPlaceId: placesById.has(person.death?.placeId) ? person.death.placeId : null,
      };
      for (const kind of ['birth', 'death']) {
        const placeId = entry[`${kind}PlaceId`];
        if (!placeId) continue;
        usedPlaces.add(placeId);
        generation.stops.push({ kind, placeId, personId: person.id, year: entry[`${kind}Year`] });
      }
      if (!entry.birthPlaceId && !entry.deathPlaceId) unmapped += 1;
      generation.people.push(entry);
    }
    const generations = [...byDepth.values()].sort((a, b) => b.depth - a.depth).map((generation) => {
      const years = generation.people.map((person) => person.birthYear).filter(Boolean);
      generation.people.sort((a, b) => (a.birthYear || 9999) - (b.birthYear || 9999) || a.name.localeCompare(b.name, 'cs'));
      return { ...generation, fromYear: years.length ? Math.min(...years) : null, toYear: years.length ? Math.max(...years) : null };
    });
    const entries = new Map(generations.flatMap((generation) => generation.people.map((person) => [person.id, person])));
    const links = [];
    for (const link of data?.relationships || []) {
      if (link.type !== 'parent-child' || !depths?.has(link.from) || !depths.has(link.to)) continue;
      if (depths.get(link.from) !== depths.get(link.to) + 1) continue;
      const from = entries.get(link.from)?.birthPlaceId;
      const to = entries.get(link.to)?.birthPlaceId;
      if (!from || !to || from === to) continue;
      links.push({ parentId: link.from, childId: link.to, fromPlaceId: from, toPlaceId: to, depth: depths.get(link.to) });
    }
    // Map steps: only generations with at least one mapped place.
    const steps = generations.filter((generation) => generation.stops.length);
    return { generations, steps, links, places: [...usedPlaces].map((id) => placesById.get(id)), unmapped };
  }

  function mountMigration(container, model, options = {}) {
    const L = globalThis.L;
    if (!container || !L) throw new Error('Map container and local Leaflet runtime are required.');
    const places = new Map((model?.places || []).map((place) => [place.id, place]));
    const bounds = getMapBounds(model?.places || []);
    const map = L.map(container, { zoomControl: false, scrollWheelZoom: false, worldCopyJump: false, zoomSnap: 0.25, minZoom: -1, maxZoom: 18 });
    map.setView([49.5, 17], 6);
    if (options.worldGeometry) {
      L.geoJSON(wrapWorldGeometry(options.worldGeometry, bounds), {
        interactive: false,
        style: { color: '#8b9788', weight: 0.7, opacity: 0.8, fillColor: '#e9e6dc', fillOpacity: 0.72 },
      }).addTo(map);
    }
    bindWheelZoom(map, container, options.onViewChange);
    L.control.zoom({ position: 'topright', zoomInTitle: 'Přiblížit', zoomOutTitle: 'Oddálit' }).addTo(map);
    const lon = (place) => normalizedLongitude(place.lon, bounds?.west ?? -180);
    const names = new Map((model?.generations || []).flatMap((generation) => generation.people.map((person) => [person.id, person])));
    const describe = (person, kind) => `${person.name}${person[`${kind}Year`] ? ` (${person[`${kind}Year`]})` : ''}`;

    // One layer per generation: lines from the parents' birthplaces, then a
    // marker per place and kind (* birth, † death) listing who it was.
    const layers = (model?.steps || []).map((generation) => {
      const group = L.layerGroup();
      const markers = [];
      const lines = [];
      for (const link of (model.links || []).filter((item) => item.depth === generation.depth)) {
        const from = places.get(link.fromPlaceId);
        const to = places.get(link.toPlaceId);
        if (!from || !to) continue;
        const line = L.polyline([[from.lat, lon(from)], [to.lat, lon(to)]], { color: '#7b3f4b', weight: 3, opacity: 0.85, dashArray: '6 6', interactive: false, className: 'migration-line' });
        lines.push(line);
        group.addLayer(line);
      }
      const stops = new Map();
      for (const stop of generation.stops) {
        const key = `${stop.kind}|${stop.placeId}`;
        stops.set(key, [...(stops.get(key) || []), stop]);
      }
      for (const [key, list] of stops) {
        const [kind, placeId] = key.split('|');
        const place = places.get(placeId);
        const who = list.map((stop) => describe(names.get(stop.personId), kind)).join(', ');
        const label = `${place.name || place.id}: ${kind === 'birth' ? 'narození' : 'úmrtí'} – ${who}`;
        const icon = L.divIcon({ className: `migration-marker-icon migration-${kind}`, html: `<span aria-hidden="true">${kind === 'birth' ? '*' : '†'}</span>`, iconSize: [36, 36], iconAnchor: kind === 'birth' ? [18, 18] : [6, 30] });
        const marker = L.marker([place.lat, lon(place)], { icon, keyboard: true, title: label, alt: label, riseOnHover: true });
        marker.on('add', () => {
          const element = marker.getElement?.();
          if (!element || element.dataset.keyReady) return;
          element.dataset.keyReady = 'true';
          element.setAttribute('role', 'button');
          element.setAttribute('aria-label', label);
          element.addEventListener('keydown', (event) => {
            if (event.key !== ' ' && event.key !== 'Enter') return;
            event.preventDefault();
            event.stopPropagation();
            marker.fire('click', { originalEvent: event });
          });
        });
        marker.on('click', () => options.onPlaceSelect?.(placeId, marker.getElement?.()));
        const tooltipContent = document.createElement('span');
        tooltipContent.textContent = `${kind === 'birth' ? '*' : '†'} ${place.name || place.id}`;
        marker.bindTooltip(tooltipContent, { permanent: true, direction: kind === 'birth' ? 'right' : 'left', offset: kind === 'birth' ? [12, 0] : [-4, -16], className: 'place-map-label migration-label' });
        markers.push(marker);
        group.addLayer(marker);
      }
      return { group, markers, lines };
    });

    let step = layers.length - 1;
    function setStep(value) {
      step = Math.max(0, Math.min(layers.length - 1, Number(value) || 0));
      layers.forEach((layer, index) => {
        if (index > step) {
          map.removeLayer(layer.group);
          return;
        }
        if (!map.hasLayer(layer.group)) layer.group.addTo(map);
        const current = index === step;
        layer.lines.forEach((line) => line.setStyle({ opacity: current ? 0.9 : 0.35, weight: current ? 3.5 : 2 }));
        layer.markers.forEach((marker) => {
          marker.getElement?.()?.classList.toggle('is-faded', !current);
          if (current) marker.openTooltip?.();
          else marker.closeTooltip?.();
        });
      });
      return step;
    }
    function fitAll() {
      if (bounds) map.fitBounds(L.latLngBounds(L.latLng(bounds.south, bounds.west), L.latLng(bounds.north, bounds.east)), { padding: [40, 40], maxZoom: 9 });
    }
    fitAll();
    setStep(step);
    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => map.invalidateSize({ pan: false })) : null;
    resizeObserver?.observe(container);
    return { setStep, getStep: () => step, stepCount: layers.length, reset: fitAll, destroy() { resizeObserver?.disconnect(); map.remove(); } };
  }

  function mount(container, places, options = {}) {
    const L = globalThis.L;
    if (!container || !L) throw new Error('Map container and local Leaflet runtime are required.');
    const mapped = getMapPlaces(places);
    const bounds = getMapBounds(mapped);
    const map = L.map(container, {
      zoomControl: false,
      scrollWheelZoom: false,
      worldCopyJump: false,
      zoomSnap: 0.25,
      minZoom: -1,
      maxZoom: 18,
    });
    map.setView([15, 0], 2);
    const worldLayer = options.worldGeometry ? L.geoJSON(wrapWorldGeometry(options.worldGeometry, bounds), {
      interactive: false,
      style: { color: '#8b9788', weight: 0.7, opacity: 0.8, fillColor: '#e9e6dc', fillOpacity: 0.72 },
    }) : null;
    if (worldLayer) worldLayer.addTo(map);

    bindWheelZoom(map, container, options.onViewChange);

    L.control.zoom({ position: 'topright', zoomInTitle: 'Přiblížit', zoomOutTitle: 'Oddálit' }).addTo(map);
    const ResetControl = L.Control.extend({
      options: { position: 'topright' },
      onAdd() {
        const button = L.DomUtil.create('button', 'leaflet-control-reset');
        button.type = 'button';
        button.textContent = 'Všechna místa';
        button.setAttribute('aria-label', 'Zobrazit všechna místa');
        L.DomEvent.disableClickPropagation(button);
        L.DomEvent.on(button, 'click', (event) => { L.DomEvent.stop(event); reset(); });
        return button;
      },
    });
    new ResetControl().addTo(map);

    const clusterOptions = {
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      spiderfyOnMaxZoom: true,
      removeOutsideVisibleBounds: false,
      maxClusterRadius: 48,
      spiderfyDistanceMultiplier: 2.5,
      iconCreateFunction(cluster) {
        const count = cluster.getChildCount();
        return L.divIcon({
          html: `<span aria-hidden="true">${count}</span>`,
          className: 'marker-cluster',
          iconSize: [48, 48],
          iconAnchor: [24, 24],
        });
      },
    };
    const clusterGroup = L.markerClusterGroup(clusterOptions);
    const keyboardBoundElements = new WeakSet();
    mapped.forEach((place) => {
      const icon = L.divIcon({ className: 'place-map-marker-icon', html: '<span aria-hidden="true"></span>', iconSize: [44, 44], iconAnchor: [22, 22] });
      const marker = L.marker([place.lat, normalizedLongitude(place.lon, bounds?.west ?? -180)], {
        icon,
        keyboard: true,
        title: place.name || place.id,
        alt: place.name || place.id,
        riseOnHover: true,
      });
      marker.on('click', () => {
        marker.getElement()?.focus?.();
        options.onPlaceSelect?.(place.id, marker.getElement?.());
      });
      marker.on('add', () => {
        const element = marker.getElement?.();
        if (!element || keyboardBoundElements.has(element)) return;
        keyboardBoundElements.add(element);
        element.setAttribute('role', 'button');
        element.setAttribute('aria-label', place.name || place.id);
        element.addEventListener('keydown', (event) => {
          if (event.key !== ' ' && event.key !== 'Enter') return;
          event.preventDefault();
          event.stopPropagation();
          element.focus();
          marker.fire('click', { originalEvent: event });
        });
      });
      const tooltipContent = document.createElement('span');
      tooltipContent.textContent = place.name || place.id;
      // Names stay visible next to unclustered points so the map can be read without hovering.
      marker.bindTooltip(tooltipContent, { permanent: true, direction: 'right', offset: [10, 0], className: 'place-map-label' });
      clusterGroup.addLayer(marker);
    });
    clusterGroup.addTo(map);

    const clusterObserver = typeof MutationObserver === 'function' ? new MutationObserver(() => {
      container.querySelectorAll('.marker-cluster:not([data-key-ready])').forEach((element) => {
        element.dataset.keyReady = 'true';
        element.setAttribute('tabindex', '0');
        element.setAttribute('role', 'button');
        element.setAttribute('aria-label', `${element.textContent.trim()} míst v tomto shluku. Přiblížit.`);
        element.addEventListener('keydown', (event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          event.stopPropagation();
          element.click();
          setTimeout(() => map.getContainer().focus(), 0);
        });
      });
    }) : null;
    clusterObserver?.observe(container, { childList: true, subtree: true });
    function fitBounds(target, padding = [30, 30]) {
      const southWest = L.latLng(target.south, target.west);
      const northEast = L.latLng(target.north, target.east);
      map.fitBounds(L.latLngBounds(southWest, northEast), { padding, maxZoom: 8 });
    }
    function fitAllPlaces() {
      if (bounds) {
        fitBounds(bounds);
      } else if (worldLayer?.getBounds().isValid()) {
        map.fitBounds(worldLayer.getBounds(), { padding: [24, 24] });
      } else map.setView([15, 0], 2);
    }
    const initialBounds = getValidInitialBounds(options.initialBounds);
    if (initialBounds) fitBounds(initialBounds);
    else fitAllPlaces();
    function reset() {
      clusterGroup.unspiderfy?.();
      fitAllPlaces();
    }
    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => map.invalidateSize({ pan: false })) : null;
    resizeObserver?.observe(container);
    return { reset, destroy() { clusterObserver?.disconnect(); resizeObserver?.disconnect(); map.remove(); } };
  }

  // "Film rodu": the family year by year. Births, deaths and recorded moves
  // with their places; a line joins a parent's birthplace with the child's.
  // Only people with a recorded year and a place with coordinates appear.
  function buildFilm(data, { personIds = null } = {}) {
    const placesById = new Map(getMapPlaces(data?.places).map((place) => [place.id, place]));
    const people = new Map((data?.people || []).map((person) => [person.id, person]));
    const included = (id) => !personIds || personIds.has(id);
    const moments = [];
    for (const person of people.values()) {
      if (!included(person.id)) continue;
      const birthYear = firstYear(person.birth?.date, person.birth?.dateText);
      const deathYear = firstYear(person.death?.date, person.death?.dateText);
      if (birthYear && placesById.has(person.birth?.placeId)) moments.push({ kind: 'birth', year: birthYear, personId: person.id, name: person.displayName, placeId: person.birth.placeId });
      if (deathYear && placesById.has(person.death?.placeId)) moments.push({ kind: 'death', year: deathYear, personId: person.id, name: person.displayName, placeId: person.death.placeId });
    }
    for (const event of data?.events || []) {
      if (event.type !== 'migration' || !placesById.has(event.placeId)) continue;
      const year = firstYear(event.date, event.dateText);
      const personId = (event.personIds || [])[0];
      if (!year || !personId || !included(personId)) continue;
      moments.push({ kind: 'move', year, personId, name: people.get(personId)?.displayName || '', placeId: event.placeId, fromPlaceId: placesById.has(event.fromPlaceId) ? event.fromPlaceId : null, title: event.title });
    }
    const birthOf = new Map(moments.filter((moment) => moment.kind === 'birth').map((moment) => [moment.personId, moment]));
    const links = [];
    for (const link of data?.relationships || []) {
      if (link.type !== 'parent-child') continue;
      const parent = birthOf.get(link.from);
      const child = birthOf.get(link.to);
      if (!parent || !child || parent.placeId === child.placeId) continue;
      links.push({ year: child.year, fromPlaceId: parent.placeId, toPlaceId: child.placeId, parentId: link.from, childId: link.to });
    }
    for (const moment of moments) {
      if (moment.kind === 'move' && moment.fromPlaceId && moment.fromPlaceId !== moment.placeId) links.push({ year: moment.year, fromPlaceId: moment.fromPlaceId, toPlaceId: moment.placeId, personId: moment.personId, move: true });
    }
    moments.sort((a, b) => a.year - b.year || a.kind.localeCompare(b.kind));
    const years = moments.map((moment) => moment.year);
    const usedPlaces = new Set(moments.flatMap((moment) => [moment.placeId, moment.fromPlaceId]).filter(Boolean));
    return {
      from: years.length ? Math.floor(Math.min(...years) / 5) * 5 : null,
      to: years.length ? Math.max(...years) : null,
      moments,
      links,
      places: [...usedPlaces].map((id) => placesById.get(id)),
    };
  }

  // What happened in (from, to]: for the caption under the map.
  function filmMoments(film, from, to) {
    return (film?.moments || []).filter((moment) => moment.year > from && moment.year <= to);
  }

  function mountFilm(container, film, options = {}) {
    const L = globalThis.L;
    if (!container || !L) throw new Error('Map container and local Leaflet runtime are required.');
    const places = new Map((film?.places || []).map((place) => [place.id, place]));
    const bounds = getMapBounds(film?.places || []);
    const map = L.map(container, { zoomControl: false, scrollWheelZoom: false, worldCopyJump: false, zoomSnap: 0.25, minZoom: -1, maxZoom: 18 });
    map.setView([49.5, 17], 6);
    if (options.worldGeometry) {
      L.geoJSON(wrapWorldGeometry(options.worldGeometry, bounds), { interactive: false, style: { color: '#8b9788', weight: 0.7, opacity: 0.8, fillColor: '#e9e6dc', fillOpacity: 0.72 } }).addTo(map);
    }
    bindWheelZoom(map, container, options.onViewChange);
    L.control.zoom({ position: 'topright', zoomInTitle: 'Přiblížit', zoomOutTitle: 'Oddálit' }).addTo(map);
    const lon = (place) => normalizedLongitude(place.lon, bounds?.west ?? -180);
    const point = (placeId) => {
      const place = places.get(placeId);
      return [place.lat, lon(place)];
    };
    const layer = L.layerGroup().addTo(map);
    let year = film?.from ?? 0;
    // Births stay on the map as dots; those within the last step are
    // highlighted, older ones fade. Lines appear when the child is born.
    function setYear(value, step = 5) {
      year = Math.max(film.from, Math.min(film.to, Math.round(Number(value) || film.from)));
      layer.clearLayers();
      for (const link of film.links) {
        if (link.year > year) continue;
        const fresh = link.year > year - step;
        layer.addLayer(L.polyline([point(link.fromPlaceId), point(link.toPlaceId)], { color: link.move ? '#3f6350' : '#7b3f4b', weight: fresh ? 3.5 : 1.5, opacity: fresh ? 0.9 : 0.3, dashArray: '6 6', interactive: false, className: 'film-line' }));
      }
      const counts = new Map();
      for (const moment of film.moments) {
        if (moment.year > year || moment.kind === 'death') continue;
        const entry = counts.get(moment.placeId) || { total: 0, fresh: 0, names: [] };
        entry.total += 1;
        if (moment.year > year - step) {
          entry.fresh += 1;
          entry.names.push(moment.name);
        }
        counts.set(moment.placeId, entry);
      }
      for (const [placeId, entry] of counts) {
        const place = places.get(placeId);
        const word = entry.total === 1 ? 'záznam' : entry.total < 5 ? 'záznamy' : 'záznamů';
        const label = entry.fresh ? place.name + ': ' + entry.names.join(', ') : place.name + ': ' + entry.total + ' ' + word;
        const marker = L.circleMarker(point(placeId), {
          radius: Math.min(16, 5 + Math.sqrt(entry.total) * 2.5),
          color: entry.fresh ? '#7b3f4b' : '#566159',
          weight: entry.fresh ? 3 : 1,
          fillColor: entry.fresh ? '#c98a96' : '#b9ad9b',
          fillOpacity: entry.fresh ? 0.85 : 0.45,
          className: entry.fresh ? 'film-dot is-fresh' : 'film-dot',
        });
        marker.bindTooltip(label, { direction: 'top', className: 'place-map-label', permanent: Boolean(entry.fresh) });
        marker.on('click', () => options.onPlaceSelect?.(placeId, marker.getElement?.()));
        layer.addLayer(marker);
      }
      return year;
    }
    if (bounds) map.fitBounds(L.latLngBounds(L.latLng(bounds.south, bounds.west), L.latLng(bounds.north, bounds.east)), { padding: [40, 40], maxZoom: 9 });
    if (film?.from !== null && film?.from !== undefined) setYear(film.from);
    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => map.invalidateSize({ pan: false })) : null;
    resizeObserver?.observe(container);
    return { setYear, getYear: () => year, from: film?.from, to: film?.to, destroy() { resizeObserver?.disconnect(); map.remove(); } };
  }

  return { getMapPlaces, getMapBounds, getValidInitialBounds, normalizedLongitude, wrapWorldGeometry, mount, buildMigration, generationLabel, mountMigration, buildFilm, filmMoments, mountFilm };
});
