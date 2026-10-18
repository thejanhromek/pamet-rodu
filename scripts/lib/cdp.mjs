// Tiny Chrome DevTools Protocol client: launches headless Edge/Chrome and drives one page.
// Uses Node's built-in WebSocket (Node 22+); no npm dependencies.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const LAUNCH_TIMEOUT_MS = 20000;
const COMMAND_TIMEOUT_MS = 30000;

function browserCandidates() {
  const env = process.env;
  if (process.platform === 'win32') {
    const roots = [env['PROGRAMFILES(X86)'], env.PROGRAMFILES, env.LOCALAPPDATA].filter(Boolean);
    return roots.flatMap((root) => [
      path.join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(root, 'Chromium', 'Application', 'chrome.exe'),
    ]);
  }
  if (process.platform === 'darwin') {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ];
  }
  const names = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge', 'microsoft-edge-stable'];
  const dirs = (env.PATH || '').split(path.delimiter).filter(Boolean);
  return names.flatMap((name) => dirs.map((dir) => path.join(dir, name)));
}

/** Returns the browser executable: RK_BROWSER if set, otherwise the first installed Edge/Chrome/Chromium. */
export function findBrowser() {
  if (process.env.RK_BROWSER) {
    if (!fs.existsSync(process.env.RK_BROWSER)) throw new Error(`RK_BROWSER does not exist: ${process.env.RK_BROWSER}`);
    return process.env.RK_BROWSER;
  }
  const found = browserCandidates().find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error('No Edge, Chrome or Chromium found. Set RK_BROWSER to the browser executable.');
  return found;
}

function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  } catch (_) {
    // The browser may still hold a lock on Windows; the OS temp cleaner will get it.
  }
}

async function waitForPortFile(file, child) {
  const deadline = Date.now() + LAUNCH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Browser exited during startup (code ${child.exitCode})`);
    try {
      const [port, wsPath] = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/);
      if (port && wsPath) return `ws://127.0.0.1:${port}${wsPath}`;
    } catch (_) {
      // Not written yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Timed out waiting for DevToolsActivePort');
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    let nextId = 1;
    const pending = new Map();
    const listeners = new Set();
    socket.addEventListener('open', () => resolve(client));
    socket.addEventListener('error', (event) => reject(new Error(`CDP WebSocket error: ${event.message || 'connection failed'}`)));
    socket.addEventListener('close', () => {
      for (const { reject: fail, timer } of pending.values()) {
        clearTimeout(timer);
        fail(new Error('CDP connection closed'));
      }
      pending.clear();
    });
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && pending.has(message.id)) {
        const { resolve: done, reject: fail, timer, method } = pending.get(message.id);
        pending.delete(message.id);
        clearTimeout(timer);
        if (message.error) fail(new Error(`${method}: ${message.error.message}`));
        else done(message.result);
        return;
      }
      for (const listener of listeners) listener(message);
    });
    const client = {
      send(method, params = {}, sessionId) {
        const id = nextId++;
        return new Promise((done, fail) => {
          const timer = setTimeout(() => {
            pending.delete(id);
            fail(new Error(`${method}: timed out`));
          }, COMMAND_TIMEOUT_MS);
          timer.unref?.();
          pending.set(id, { resolve: done, reject: fail, timer, method });
          socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
        });
      },
      on(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      close() {
        for (const { reject: fail, timer } of pending.values()) {
          clearTimeout(timer);
          fail(new Error('CDP connection closed'));
        }
        pending.clear();
        socket.close();
      },
    };
  });
}

/**
 * Launches a headless browser and returns a controller for one page at a time:
 *   open(url, { width, height, mobile, initScript }) – opens a fresh tab, waits for load
 *   evaluate(expression)                  – awaits promises, returns JSON value
 *   screenshot()                          – viewport PNG as a Buffer
 *   consoleErrors()                       – console errors / exceptions since open()
 *   close()                               – kills the browser and removes the profile
 */
export async function launchBrowser({ executable = findBrowser(), extraArgs = [] } = {}) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'rk-cdp-'));
  const child = spawn(executable, [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-sync',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-features=Translate,msEdgeSidebarV2,EdgeCollections',
    '--hide-scrollbars',
    '--force-color-profile=srgb',
    '--font-render-hinting=none',
    '--mute-audio',
    ...extraArgs,
    'about:blank',
  ], { stdio: 'ignore' });

  let closed = false;
  const killSync = () => {
    if (child.exitCode === null) {
      try { child.kill(); } catch (_) { /* already gone */ }
    }
    removeDir(profile);
  };
  process.once('exit', killSync);

  let connection;
  try {
    const wsUrl = await waitForPortFile(path.join(profile, 'DevToolsActivePort'), child);
    connection = await connect(wsUrl);
  } catch (error) {
    process.removeListener('exit', killSync);
    killSync();
    throw error;
  }

  let page = null;

  async function closePage() {
    if (!page) return;
    const current = page;
    page = null;
    current.unsubscribe();
    await connection.send('Target.closeTarget', { targetId: current.targetId }).catch(() => {});
  }

  function requirePage() {
    if (!page) throw new Error('No page is open; call open() first');
    return page;
  }

  return {
    executable,

    async open(url, { width = 1280, height = 800, mobile = false, initScript = '' } = {}) {
      await closePage();
      const { targetId } = await connection.send('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = await connection.send('Target.attachToTarget', { targetId, flatten: true });
      const send = (method, params) => connection.send(method, params, sessionId);
      const errors = [];
      let loadResolve;
      const unsubscribe = connection.on((message) => {
        if (message.sessionId !== sessionId) return;
        const { method, params } = message;
        if (method === 'Page.loadEventFired') loadResolve?.();
        if (method === 'Runtime.exceptionThrown') {
          const details = params.exceptionDetails;
          errors.push(`Uncaught: ${details.exception?.description || details.text}`);
        }
        if (method === 'Runtime.consoleAPICalled' && (params.type === 'error' || params.type === 'assert')) {
          errors.push(`console.${params.type}: ${params.args.map((arg) => arg.value ?? arg.description ?? '').join(' ')}`);
        }
        if (method === 'Log.entryAdded' && params.entry.level === 'error') {
          errors.push(`${params.entry.source}: ${params.entry.text}${params.entry.url ? ` (${params.entry.url})` : ''}`);
        }
      });
      page = { targetId, sessionId, send, errors, unsubscribe };

      await Promise.all([send('Page.enable'), send('Runtime.enable'), send('Log.enable')]);
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
      await send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: mobile ? 5 : 1 });
      await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }, { name: 'prefers-color-scheme', value: 'light' }] });
      if (initScript) await send('Page.addScriptToEvaluateOnNewDocument', { source: initScript });
      const loaded = new Promise((resolve) => { loadResolve = resolve; });
      const result = await send('Page.navigate', { url });
      if (result.errorText) throw new Error(`Navigation to ${url} failed: ${result.errorText}`);
      let loadTimer;
      try {
        await Promise.race([loaded, new Promise((_, reject) => {
          loadTimer = setTimeout(() => reject(new Error(`Timed out loading ${url}`)), COMMAND_TIMEOUT_MS);
        })]);
      } finally {
        clearTimeout(loadTimer);
      }
    },

    async evaluate(expression) {
      const { send } = requirePage();
      const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
      if (result.exceptionDetails) {
        throw new Error(`evaluate failed: ${result.exceptionDetails.exception?.description || result.exceptionDetails.text}`);
      }
      return result.result.value;
    },

    async screenshot() {
      const { send } = requirePage();
      const { data } = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
      return Buffer.from(data, 'base64');
    },

    consoleErrors() {
      return page ? [...page.errors] : [];
    },

    async close() {
      if (closed) return;
      closed = true;
      await closePage().catch(() => {});
      await connection.send('Browser.close').catch(() => {});
      connection.close();
      await new Promise((resolve) => {
        if (child.exitCode !== null) return resolve();
        const timer = setTimeout(() => { try { child.kill(); } catch (_) { /* gone */ } resolve(); }, 3000);
        child.once('exit', () => { clearTimeout(timer); resolve(); });
      });
      process.removeListener('exit', killSync);
      removeDir(profile);
    },
  };
}
