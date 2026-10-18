/*
 * MZA ActaPublica – cílený výřez obrazu matriky přímo z dlaždic IIPImage DeepZoom.
 *
 * Použití: otevřít v prohlížeči (vestavěný panel nebo Chrome) libovolný scan knihy
 * na https://www.mza.cz/actapublica/matrika/detail/<id>?image=<full-id>.jp2,
 * vložit obsah tohoto souboru do stránky (DevTools konzole nebo javascript tool)
 * a volat například:
 *
 *   await mzaShow(mzaScan(66), 0.0, 0.2, 0.5, 0.38)   // scan 66, levá strana, řádek
 *   await mzaShow(mzaBase(), 0, 0, 1, 1, 1600)          // aktuální scan celý, náhled
 *   mzaHide()                                           // zpět na viewer
 *
 * Souřadnice x0, y0, x1, y1 jsou zlomky šířky/výšky celého obrazu (0–1).
 * Výřez se vykreslí jako překryv přes celou stránku, takže jde vyfotit screenshotem;
 * maxWidth určuje cílovou šířku výřezu v pixelech (vyšší = ostřejší, víc dlaždic).
 * Výsledek vrací rozměry obrazu, použitý level a počet nenačtených dlaždic.
 *
 * Proč: viewer OpenSeadragon ve skrytém nebo zmenšeném panelu dlaždice načítá pomalu
 * nebo vůbec. Nástroj čte stejné dlaždice jako viewer (stejný server, stejné
 * rozlišení), nic neretušuje a nestahuje celé knihy – jen dlaždice zvoleného výřezu.
 * Metodika a pravidla: docs/genealogicky-vyzkum-postupy.md, oddíl „Čtení obrazů MZA ActaPublica“.
 */
(function (root) {
  // Čistý výpočet mřížky dlaždic; bez DOM, testovatelný v Node.
  function tileGrid(size, rect, maxWidth) {
    const { width: W, height: H, tileSize: T } = size;
    const [x0, y0, x1, y1] = rect;
    const maxLevel = Math.ceil(Math.log2(Math.max(W, H)));
    const cropWidth = (x1 - x0) * W;
    let level = maxLevel;
    while (level > 0 && cropWidth / 2 ** (maxLevel - level) > maxWidth) level--;
    const scale = 2 ** (maxLevel - level);
    const lw = Math.ceil(W / scale);
    const lh = Math.ceil(H / scale);
    const px0 = Math.floor(x0 * lw);
    const py0 = Math.floor(y0 * lh);
    const px1 = Math.min(lw, Math.ceil(x1 * lw));
    const py1 = Math.min(lh, Math.ceil(y1 * lh));
    const tiles = [];
    for (let tx = Math.floor(px0 / T); tx <= Math.floor((px1 - 1) / T); tx++) {
      for (let ty = Math.floor(py0 / T); ty <= Math.floor((py1 - 1) / T); ty++) {
        tiles.push({ tx, ty, dx: tx * T - px0, dy: ty * T - py0 });
      }
    }
    return { level, maxLevel, width: px1 - px0, height: py1 - py0, tiles };
  }

  // Základ DZI URL aktuálně otevřeného scanu (bez přípony .dzi).
  function mzaBase() {
    const item = root.viewer && root.viewer.world && root.viewer.world.getItemAt(0);
    if (!item) throw new Error('Viewer MZA ještě nenačetl obraz; počkej a zkus znovu.');
    return item.source.tilesUrl.replace(/_files\/$/, '');
  }

  // Základ DZI URL jiného scanu téže knihy (číslo scanu podle vieweru MZA).
  function mzaScan(scan, base = mzaBase()) {
    return base.replace(/-(\d{5})\.jp2$/, `-${String(scan * 10).padStart(5, '0')}.jp2`);
  }

  async function mzaShow(base, x0 = 0, y0 = 0, x1 = 1, y1 = 1, maxWidth = 2400) {
    const xml = await fetch(`${base}.dzi`).then((r) => r.text());
    const num = (name) => Number(xml.match(new RegExp(`${name}="(\\d+)"`))[1]);
    const size = { width: num('Width'), height: num('Height'), tileSize: num('TileSize') };
    const grid = tileGrid(size, [x0, y0, x1, y1], maxWidth);
    const canvas = document.createElement('canvas');
    canvas.width = grid.width;
    canvas.height = grid.height;
    const g = canvas.getContext('2d');
    g.fillStyle = '#888';
    g.fillRect(0, 0, canvas.width, canvas.height);
    let fails = 0;
    await Promise.all(grid.tiles.map(async ({ tx, ty, dx, dy }) => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const response = await fetch(`${base}_files/${grid.level}/${tx}_${ty}.jpg`);
          if (!response.ok) throw new Error(String(response.status));
          g.drawImage(await createImageBitmap(await response.blob()), dx, dy);
          return;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 400));
        }
      }
      fails++;
    }));
    let overlay = document.getElementById('mza-crop-overlay');
    if (!overlay) {
      overlay = document.createElement('img');
      overlay.id = 'mza-crop-overlay';
      document.body.appendChild(overlay);
    }
    overlay.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;object-fit:contain;background:#fff;z-index:99999';
    overlay.src = canvas.toDataURL('image/jpeg', 0.9);
    await new Promise((resolve) => { overlay.onload = resolve; });
    return { ...size, level: grid.level, maxLevel: grid.maxLevel, crop: [grid.width, grid.height], fails };
  }

  function mzaHide() {
    const overlay = document.getElementById('mza-crop-overlay');
    if (overlay) overlay.remove();
  }

  const api = { tileGrid, mzaBase, mzaScan, mzaShow, mzaHide };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof window !== 'undefined' ? window : globalThis);
