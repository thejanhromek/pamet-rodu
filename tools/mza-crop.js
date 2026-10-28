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
 *
 * Šetrnost k serveru: MZA v říjnu 2026 zablokovalo IP adresu po dávkách, kdy nástroj
 * stahoval všechny dlaždice výřezu najednou. Všechny požadavky proto jdou přes sdílený
 * omezovač (výchozí 2 souběžně, nejméně 300 ms mezi požadavky), dlaždice se drží
 * v paměti a znovu se nestahují, jeden výřez smí mít nejvýš 60 dlaždic a sezení
 * 1500 požadavků. Odpověď 403/429/503 nebo síťová chyba nástroj zastaví (bez dalších
 * pokusů) – pak počkat, nezkoušet znovu hned. Limity mění mzaConfig({...}),
 * stav ukáže mzaStats().
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

  // Omezovač požadavků: nejvýš `concurrency` souběžně a mezi starty aspoň `minGapMs`.
  function createLimiter(options = {}) {
    const now = () => Date.now();
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const limits = { concurrency: options.concurrency || 2, minGapMs: options.minGapMs ?? 300 };
    let active = 0;
    let nextStart = 0;
    const queue = [];
    const pump = () => {
      while (active < limits.concurrency && queue.length) {
        const { task, resolve, reject } = queue.shift();
        active++;
        const wait = Math.max(0, nextStart - now());
        nextStart = Math.max(now(), nextStart) + limits.minGapMs;
        Promise.resolve(wait && sleep(wait)).then(task).then(resolve, reject).finally(() => { active--; pump(); });
      }
    };
    return {
      limits,
      run: (task) => new Promise((resolve, reject) => { queue.push({ task, resolve, reject }); pump(); }),
    };
  }

  const config = { concurrency: 2, minGapMs: 300, maxTilesPerCrop: 60, sessionBudget: 1500 };
  const limiter = createLimiter(config);
  const tileCache = new Map();
  const stats = { requests: 0, cached: 0, halted: '' };

  function mzaConfig(changes = {}) {
    Object.assign(config, changes);
    limiter.limits.concurrency = config.concurrency;
    limiter.limits.minGapMs = config.minGapMs;
    if (changes.resume) stats.halted = '';
    return { ...config };
  }

  function mzaStats() {
    return { ...stats, cachedTiles: tileCache.size, budgetLeft: config.sessionBudget - stats.requests };
  }

  // Jediná cesta na server MZA: hlídá zastavení, rozpočet sezení a omezovač.
  function politeFetch(url) {
    if (stats.halted) throw new Error(`Nástroj je zastaven (${stats.halted}); počkej, než MZA zase odpovídá, pak mzaConfig({ resume: true }).`);
    if (stats.requests >= config.sessionBudget) throw new Error(`Vyčerpán rozpočet ${config.sessionBudget} požadavků na sezení; udělej pauzu.`);
    stats.requests++;
    return limiter.run(async () => {
      let response;
      try {
        response = await fetch(url);
      } catch (error) {
        stats.halted = `síťová chyba: ${error.message}`;
        throw error;
      }
      if ([403, 429, 503].includes(response.status)) {
        stats.halted = `HTTP ${response.status}`;
        throw new Error(stats.halted);
      }
      return response;
    });
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
    const dziUrl = `${base}.dzi`;
    if (!tileCache.has(dziUrl)) tileCache.set(dziUrl, await politeFetch(dziUrl).then((r) => r.text()));
    const xml = tileCache.get(dziUrl);
    const num = (name) => Number(xml.match(new RegExp(`${name}="(\\d+)"`))[1]);
    const size = { width: num('Width'), height: num('Height'), tileSize: num('TileSize') };
    const grid = tileGrid(size, [x0, y0, x1, y1], maxWidth);
    if (grid.tiles.length > config.maxTilesPerCrop) {
      throw new Error(`Výřez potřebuje ${grid.tiles.length} dlaždic (limit ${config.maxTilesPerCrop}); zmenši oblast nebo maxWidth.`);
    }
    const canvas = document.createElement('canvas');
    canvas.width = grid.width;
    canvas.height = grid.height;
    const g = canvas.getContext('2d');
    g.fillStyle = '#888';
    g.fillRect(0, 0, canvas.width, canvas.height);
    let fails = 0;
    // Dlaždice jdou přes omezovač, ne všechny najednou; 404 a podobné se jednou zopakují
    // po delší pauze, blokační odpovědi zastaví celý nástroj (viz politeFetch).
    await Promise.all(grid.tiles.map(async ({ tx, ty, dx, dy }) => {
      const url = `${base}_files/${grid.level}/${tx}_${ty}.jpg`;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          if (tileCache.has(url)) stats.cached++;
          else {
            const response = await politeFetch(url);
            if (!response.ok) throw new Error(String(response.status));
            tileCache.set(url, await response.blob());
          }
          g.drawImage(await createImageBitmap(tileCache.get(url)), dx, dy);
          return;
        } catch {
          if (stats.halted) break;
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
      fails++;
    }));
    if (stats.halted) throw new Error(`MZA přestalo odpovídat (${stats.halted}); nástroj zastaven, nezkoušej hned znovu.`);
    let overlay = document.getElementById('mza-crop-overlay');
    if (!overlay) {
      overlay = document.createElement('img');
      overlay.id = 'mza-crop-overlay';
      document.body.appendChild(overlay);
    }
    overlay.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;object-fit:contain;background:#fff;z-index:99999';
    overlay.src = canvas.toDataURL('image/jpeg', 0.9);
    await new Promise((resolve) => { overlay.onload = resolve; });
    return { ...size, level: grid.level, maxLevel: grid.maxLevel, crop: [grid.width, grid.height], fails, ...mzaStats() };
  }

  // Zvýraznění vybledlého inkoustu (čistá funkce nad šedotónovým polem, testovatelná v Node):
  // tmavší kanál, odečtení lokálního pozadí (skvrny, nerovnoměrné osvětlení), roztažení
  // histogramu mezi percentily a gama. Vrací Uint8ClampedArray hodnot 0–255.
  function enhanceGray(values, width, height, { low = 0.01, high = 0.5, gamma = 0.9 } = {}) {
    const n = width * height;
    const radius = Math.max(8, Math.round(width / 60));
    const tmp = new Float32Array(n);
    const bg = new Float32Array(n);
    for (let y = 0; y < height; y++) {
      let sum = 0, count = 0;
      for (let x = -radius; x < width; x++) {
        if (x + radius < width) { sum += values[y * width + x + radius]; count++; }
        if (x - radius - 1 >= 0) { sum -= values[y * width + x - radius - 1]; count--; }
        if (x >= 0) tmp[y * width + x] = sum / count;
      }
    }
    for (let x = 0; x < width; x++) {
      let sum = 0, count = 0;
      for (let y = -radius; y < height; y++) {
        if (y + radius < height) { sum += tmp[(y + radius) * width + x]; count++; }
        if (y - radius - 1 >= 0) { sum -= tmp[(y - radius - 1) * width + x]; count--; }
        if (y >= 0) bg[y * width + x] = sum / count;
      }
    }
    const ratio = new Float32Array(n);
    for (let i = 0; i < n; i++) ratio[i] = Math.min(1.2, values[i] / (bg[i] + 1));
    const sorted = Float32Array.from(ratio).sort();
    const lo = sorted[Math.floor((n - 1) * low)];
    const hi = sorted[Math.floor((n - 1) * high)];
    const out = new Uint8ClampedArray(n);
    for (let i = 0; i < n; i++) {
      const t = Math.max(0, Math.min(1, (ratio[i] - lo) / ((hi - lo) || 1)));
      out[i] = Math.round(Math.pow(t, gamma) * 255);
    }
    return out;
  }

  // Zvýrazní aktuální výřez (po mzaShow) a volitelně ho zvětší; nestahuje nic dalšího.
  // Příklad: await mzaShow(mzaScan(323), 0.26, 0.69, 0.4, 0.76, 3400); await mzaEnhance({ scale: 2 })
  async function mzaEnhance({ low = 0.01, high = 0.5, gamma = 0.9, scale = 1, sharpen = 0 } = {}) {
    const overlay = document.getElementById('mza-crop-overlay');
    if (!overlay) throw new Error('Nejdřív zobraz výřez přes mzaShow.');
    const source = new Image();
    source.src = overlay.src;
    await source.decode();
    const w = source.naturalWidth, h = source.naturalHeight;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const g = canvas.getContext('2d');
    g.drawImage(source, 0, 0);
    const image = g.getImageData(0, 0, w, h);
    const px = image.data;
    const gray = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) gray[i] = Math.min(px[4 * i], px[4 * i + 1], px[4 * i + 2]);
    const out = enhanceGray(gray, w, h, { low, high, gamma });
    for (let i = 0; i < w * h; i++) px[4 * i] = px[4 * i + 1] = px[4 * i + 2] = out[i];
    g.putImageData(image, 0, 0);
    const big = document.createElement('canvas');
    big.width = w * scale; big.height = h * scale;
    const bg = big.getContext('2d');
    bg.imageSmoothingEnabled = true;
    bg.imageSmoothingQuality = 'high';
    bg.drawImage(canvas, 0, 0, big.width, big.height);
    if (sharpen > 0) {
      const sharp = bg.getImageData(0, 0, big.width, big.height);
      const q = sharp.data, W = big.width, copy = new Uint8ClampedArray(q);
      for (let y = 1; y < big.height - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
          const i = 4 * (y * W + x);
          const lap = 4 * copy[i] - copy[i - 4] - copy[i + 4] - copy[i - 4 * W] - copy[i + 4 * W];
          q[i] = q[i + 1] = q[i + 2] = copy[i] + sharpen * lap;
        }
      }
      bg.putImageData(sharp, 0, 0);
    }
    overlay.style.filter = '';
    overlay.src = big.toDataURL('image/jpeg', 0.92);
    await new Promise((resolve) => { overlay.onload = resolve; });
    return { crop: [w, h], shown: [big.width, big.height] };
  }

  function mzaHide() {
    const overlay = document.getElementById('mza-crop-overlay');
    if (overlay) overlay.remove();
  }

  const api = { tileGrid, createLimiter, enhanceGray, mzaBase, mzaScan, mzaShow, mzaEnhance, mzaHide, mzaConfig, mzaStats };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof window !== 'undefined' ? window : globalThis);
