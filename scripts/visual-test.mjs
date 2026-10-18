// Visual regression tests: builds the synthetic fixture, photographs each scenario in
// headless Edge/Chrome and compares the shots with tests/visual/baseline/.
//
//   node scripts/visual-test.mjs                 compare with the baseline
//   node scripts/visual-test.mjs --update        rewrite the baseline
//   node scripts/visual-test.mjs --only <name>   run one scenario (repeatable, comma list)
//
// RK_BROWSER=<path> picks the browser executable.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launchBrowser } from './lib/cdp.mjs';
import { diff } from './lib/png.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = 'tests/fixtures/sample-family/data.json';
const BASELINE_DIR = path.join(ROOT, 'tests', 'visual', 'baseline');
const OUTPUT_DIR = path.join(ROOT, 'tests', 'visual', 'output');
const MAX_CHANGED_RATIO = 0.005;
const PIXEL_THRESHOLD = 16;

const VIEWPORTS = [
  { width: 1400, height: 900, mobile: false },
  { width: 375, height: 812, mobile: true },
];

// Each scenario opens `hash`, waits for `ready` (a CSS selector) and optionally runs
// `act(page)` before the screenshot. Add new views here.
const SCENARIOS = [
  { name: 'prehled', hash: 'prehled', ready: '#view-root .view' },
  { name: 'rodokmen-vyvod', hash: 'rodokmen', ready: '.tree-view-direct [data-person-id]' },
  {
    name: 'rodokmen-cely',
    hash: 'rodokmen',
    ready: '[data-tree-mode="full"]',
    async act(page) {
      await click(page, '[data-tree-mode="full"]');
      await waitFor(page, '.tree-view-full [data-full-tree-person]');
    },
  },
  { name: 'mista', hash: 'mista', ready: '#view-root .view' },
  { name: 'casova-osa', hash: 'casova-osa', ready: '#view-root .view' },
  {
    name: 'profil-osoby',
    hash: 'osoby',
    ready: '#view-root [data-person-id]',
    async act(page) {
      await click(page, '#view-root [data-person-id="frantisek-kadlec-1898"]');
      await waitFor(page, '#detail-dialog[open]');
    },
  },
  {
    name: 'casova-osa-zivoty',
    hash: 'casova-osa',
    ready: '[data-timeline-mode="lives"]',
    async act(page) {
      await click(page, '[data-timeline-mode="lives"]');
      await waitFor(page, '.lifelines-svg');
    },
  },
  {
    name: 'mista-film',
    hash: 'mista',
    ready: '[data-places-mode="film"]',
    async act(page) {
      await click(page, '[data-places-mode="film"]');
      await waitFor(page, '[data-film-caption] h2');
    },
  },
  {
    name: 'pramen-fotka',
    hash: 'media',
    ready: '[data-media-id="media-photo-1955"]',
    async act(page) {
      await click(page, '[data-media-id="media-photo-1955"]');
      await waitFor(page, '#detail-dialog[open] .media-region');
    },
  },
  { name: 'badatelna-fronta', edition: 'research', hash: 'badatelna', ready: '.rv-queue' },
  { name: 'badatelna-zdravi', edition: 'research', hash: 'zdravi-dat', ready: '.rv-findings' },
  { name: 'badatelna-prepis', edition: 'research', hash: 'prepis', ready: '[data-rv-form="transcribe"]' },
];

// Known problems that should not fail the run until they are fixed in src/.
// { scenario, width, kind: 'overflow' | 'console', match: substring of the message }
const knownIssues = [];

function parseArgs(argv) {
  const options = { update: false, only: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--update') options.update = true;
    else if (arg === '--only') options.only.push(...String(argv[++i] || '').split(','));
    else if (arg.startsWith('--only=')) options.only.push(...arg.slice(7).split(','));
    else throw new Error(`Unknown argument: ${arg}`);
  }
  options.only = options.only.map((name) => name.trim()).filter(Boolean);
  return options;
}

async function waitFor(page, selector, timeoutMs = 10000) {
  const found = await page.evaluate(`new Promise((resolve) => {
    const deadline = performance.now() + ${timeoutMs};
    (function check() {
      const visible = [...document.querySelectorAll(${JSON.stringify(selector)})].some((element) => element.getClientRects().length);
      if (visible) return resolve(true);
      if (performance.now() > deadline) return resolve(false);
      setTimeout(check, 50);
    })();
  })`);
  if (!found) throw new Error(`Timed out waiting for ${selector}`);
}

async function click(page, selector) {
  const ok = await page.evaluate(`(() => {
    const element = [...document.querySelectorAll(${JSON.stringify(selector)})].find((candidate) => candidate.getClientRects().length);
    if (!element) return false;
    element.scrollIntoView({ block: 'center' });
    element.click();
    return true;
  })()`);
  if (!ok) throw new Error(`Nothing to click: ${selector}`);
}

// Waits for fonts, pending layout and a quiet DOM so screenshots are stable.
async function settle(page) {
  await page.evaluate(`new Promise(async (resolve) => {
    await document.fonts?.ready;
    const frame = () => new Promise((done) => requestAnimationFrame(() => done()));
    let mutations = 0;
    const observer = new MutationObserver((records) => { mutations += records.length; });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
    let quietFrames = 0;
    const deadline = performance.now() + 5000;
    while (quietFrames < 10 && performance.now() < deadline) {
      const before = mutations;
      await frame();
      quietFrames = mutations === before ? quietFrames + 1 : 0;
    }
    observer.disconnect();
    document.activeElement?.blur?.();
    await frame();
    resolve(true);
  })`);
}

// Lists the outermost elements that stick out past the right edge of the viewport.
// Under mobile emulation innerWidth grows with overflowing content, so the layout
// viewport width (documentElement.clientWidth) is the reference instead.
const OVERFLOW_PROBE = `(() => {
  const width = document.documentElement.clientWidth;
  if (document.documentElement.scrollWidth <= width) return [];
  const selectorFor = (element) => {
    const parts = [];
    for (let node = element; node && node.nodeType === 1 && parts.length < 4; node = node.parentElement) {
      if (node.id) { parts.unshift('#' + node.id); break; }
      const classes = [...node.classList].slice(0, 2).map((name) => '.' + CSS.escape(name)).join('');
      parts.unshift(node.localName + classes);
    }
    return parts.join(' > ');
  };
  const offenders = [];
  for (const element of document.body.querySelectorAll('*')) {
    const rect = element.getBoundingClientRect();
    if (!rect.width || rect.right <= width + 1) continue;
    const style = getComputedStyle(element);
    if (style.position === 'fixed' || style.visibility === 'hidden') continue;
    const parent = element.parentElement;
    if (parent && parent !== document.body && parent.getBoundingClientRect().right > width + 1) continue;
    let clipped = false;
    for (let node = parent; node && node !== document.body; node = node.parentElement) {
      const overflowX = getComputedStyle(node).overflowX;
      if (overflowX !== 'visible' && node.getBoundingClientRect().right <= width + 1) { clipped = true; break; }
    }
    if (!clipped) offenders.push(selectorFor(element) + ' (right ' + Math.round(rect.right) + 'px)');
  }
  return ['scrollWidth ' + document.documentElement.scrollWidth + ' > viewport ' + width, ...offenders.slice(0, 8)];
})()`;

function isKnown(scenario, width, kind, message) {
  return knownIssues.some((issue) => issue.scenario === scenario && (!issue.width || issue.width === width) && issue.kind === kind && message.includes(issue.match));
}

// One build per edition (family by default, research for the Badatelna).
const builds = new Map();
function buildFixture(edition = 'family') {
  if (builds.has(edition)) return builds.get(edition);
  const output = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rk-visual-')), `chronicle-${edition}.html`);
  execFileSync(process.execPath, ['scripts/build.mjs', '--data', FIXTURE, '--edition', edition, '--output', output], { cwd: ROOT, stdio: 'inherit' });
  builds.set(edition, pathToFileURL(output).href);
  return builds.get(edition);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const scenarios = options.only.length ? SCENARIOS.filter((scenario) => options.only.includes(scenario.name)) : SCENARIOS;
  if (!scenarios.length) throw new Error(`No scenario matches: ${options.only.join(', ')}. Known: ${SCENARIOS.map((s) => s.name).join(', ')}`);

  fs.mkdirSync(BASELINE_DIR, { recursive: true });
  fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });

  const failures = [];
  const browser = await launchBrowser();
  console.log(`Browser: ${browser.executable}`);
  try {
    for (const scenario of scenarios) {
      for (const viewport of VIEWPORTS) {
        const id = `${scenario.name}-${viewport.width}`;
        const problems = [];
        try {
          await browser.open(`${buildFixture(scenario.edition)}#${scenario.hash}`, { ...viewport, initScript: 'try { localStorage.clear(); } catch (_) {}' });
          if (scenario.ready) await waitFor(browser, scenario.ready);
          await settle(browser);
          if (scenario.act) {
            await scenario.act(browser);
            await settle(browser);
          }
          const shot = await browser.screenshot();

          for (const message of browser.consoleErrors()) {
            if (!isKnown(scenario.name, viewport.width, 'console', message)) problems.push(`console error: ${message}`);
            else console.log(`  (known) ${id} console: ${message}`);
          }
          if (viewport.mobile) {
            const overflow = await browser.evaluate(OVERFLOW_PROBE);
            if (overflow.length) {
              const message = overflow.join('; ');
              if (!isKnown(scenario.name, viewport.width, 'overflow', message)) problems.push(`horizontal overflow: ${overflow.join('\n      ')}`);
              else console.log(`  (known) ${id} overflow: ${message}`);
            }
          }

          const baselineFile = path.join(BASELINE_DIR, `${id}.png`);
          if (options.update) {
            fs.writeFileSync(baselineFile, shot);
          } else if (!fs.existsSync(baselineFile)) {
            problems.push('missing baseline (run with --update)');
            saveOutput(id, shot);
          } else {
            const result = diff(fs.readFileSync(baselineFile), shot, { threshold: PIXEL_THRESHOLD });
            if (result.changedRatio > MAX_CHANGED_RATIO) {
              problems.push(`${(result.changedRatio * 100).toFixed(2)} % pixels changed (limit ${MAX_CHANGED_RATIO * 100} %)`);
              saveOutput(id, shot, result.diffPng);
            }
          }
        } catch (error) {
          problems.push(error.message);
        }
        if (problems.length) {
          failures.push({ id, problems });
          console.log(`✖ ${id}\n    ${problems.join('\n    ')}`);
        } else {
          console.log(`✔ ${id}${options.update ? ' (baseline updated)' : ''}`);
        }
      }
    }
  } finally {
    await browser.close();
    for (const url of builds.values()) fs.rmSync(path.dirname(fileURLToPath(url)), { recursive: true, force: true });
  }

  if (failures.length) {
    console.log(`\n${failures.length} visual check(s) failed. Current shots and diffs: ${path.relative(ROOT, OUTPUT_DIR)}`);
    process.exitCode = 1;
  } else {
    console.log(`\nAll ${scenarios.length * VIEWPORTS.length} visual checks passed.`);
  }
}

function saveOutput(id, shot, diffPng) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUTPUT_DIR, `${id}.png`), shot);
  if (diffPng) fs.writeFileSync(path.join(OUTPUT_DIR, `${id}.diff.png`), diffPng);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
