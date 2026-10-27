import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {
  closeBrowser, chromePath,
  chromeTarget,
  connectDevtools,
  evaluate,
  freePort,
  navigate,
  setViewport,
  sleep,
  waitForExpression,
  waitForHttp,
} from './lib/browser.mjs';

/**
 * The offline claim, end to end.
 *
 * The README leads with "can be installed as an offline PWA" and
 * docs/deployment.md lists what the service worker precaches. Nothing checked
 * any of it, and a precache list rots quietly: an asset renamed by a build, a
 * chunk split in two, a header that changes how a cached entry matches. The
 * failure only shows up on a plane.
 *
 * Three ways of asking are wrong, and each passes on a broken cache, which is
 * worse than no check at all:
 *
 *  - `Network.emulateNetworkConditions {offline:true}` on the *page* target
 *    leaves the service worker, which is its own target, still online. Its
 *    fetches reached the server, so the app "worked offline" with every Cache
 *    API entry deleted.
 *  - Chrome's own HTTP cache answers whether or not the worker cached
 *    anything, so the shell loads with an empty precache.
 *  - Killing the server is not the same as being offline, and under COEP in
 *    headless Chrome it fails in ways real offline does not.
 *
 * So this puts the page and service worker offline, disables HTTP caching,
 * and attaches new inference workers before execution. Chrome cannot emulate
 * offline networking on those workers; the server also refuses all requests
 * after the cutoff, so it cannot supply an uncached dependency. A final
 * negative control deletes the app caches and requires navigation to fail.
 *
 * This cuts the network after the first visit. The worker learns the built
 * entry and first-paint chunks, and the default board images must be in its
 * precache: initial image requests can precede service-worker control and
 * therefore never reach runtime caching.
 *
 * Production only: a dev server registers no worker, so there is nothing to
 * fall back to and this refuses to guess.
 */
const ANALYSIS_TIMEOUT_MS = 90_000;

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.gz': 'application/gzip',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

/**
 * Serves dist/ the way the deployment does, which `vite preview` does not.
 *
 * Preview sends COOP/COEP, so the page is cross-origin isolated and TFJS picks
 * its *threaded* wasm build -- the one sw.js deliberately leaves out of the
 * precache, because GitHub Pages cannot send those headers and never asks for
 * it. Checking against preview therefore fails on an asset production never
 * requests. Preview also sends `Vary: Origin`, which production does not.
 */
function serveDist(root, network) {
  const server = http.createServer((request, response) => {
    // Browser-managed SW update checks can bypass target emulation. Keep the
    // server alive, but never let it supply a dependency after the cutoff.
    if (network.disabled) {
      network.blocked.push(request.url);
      response.writeHead(503).end();
      return;
    }
    const requested = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const relative = requested.endsWith('/') ? `${requested}index.html` : requested;
    const file = path.join(root, relative);
    if (!file.startsWith(root)) {
      response.writeHead(403).end();
      return;
    }
    fs.readFile(file, (error, body) => {
      if (error) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, { 'Content-Type': CONTENT_TYPES[path.extname(file)] || 'application/octet-stream' });
      response.end(body);
    });
  });
  return server;
}
const OFFLINE = { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 };

const pageText = `(() => (document.body.innerText || '').replace(/\\s+/g, ' '))()`;

/** Cut page/SW networking and disable HTTP caches for current and future workers. */
async function goOffline(devtoolsPort) {
  const version = await (await fetch(`http://127.0.0.1:${devtoolsPort}/json/version`)).json();
  const browser = connectDevtools(version.webSocketDebuggerUrl);
  await browser.ready;
  const targets = new Map();
  const pending = new Set();
  const errors = [];
  const workerFallbacks = new Set();
  const filter = ['page', 'service_worker', 'worker', 'shared_worker'].map(type => ({ type, exclude: false }));
  filter.push({ exclude: true });
  const send = async (method, params, sessionId) => {
    const reply = await browser.send(method, params, sessionId);
    if (reply.error) throw new Error(`${method}: ${reply.error.message}`);
  };
  const unsubscribe = browser.on(message => {
    if (message.method !== 'Target.attachedToTarget') return;
    const { sessionId, targetInfo } = message.params;
    const task = (async () => {
      try {
        await send('Network.enable', {}, sessionId);
        await send('Network.setCacheDisabled', { cacheDisabled: true }, sessionId);
        try {
          await send('Network.emulateNetworkConditions', OFFLINE, sessionId);
        } catch (error) {
          // Chrome exposes Network for dedicated workers but does not support
          // offline emulation there. Their HTTP cache is disabled and the
          // server refuses every post-cutoff request, so only SW caches can
          // supply this app's same-origin model/WASM dependencies.
          if (['worker', 'shared_worker'].includes(targetInfo.type)
            && error.message === 'Network.emulateNetworkConditions: Not supported') {
            workerFallbacks.add(targetInfo.targetId);
          } else throw error;
        }
        if (targetInfo.type === 'page') {
          // Dedicated workers belong to the page; attach before their first
          // instruction so model/WASM fetches cannot escape the cutoff.
          await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true,
            filter: [{ type: 'worker', exclude: false }, { exclude: true }] }, sessionId);
        }
        targets.set(targetInfo.targetId, targetInfo.type);
      } finally {
        await send('Runtime.runIfWaitingForDebugger', {}, sessionId);
      }
    })().catch(error => errors.push(error.message));
    pending.add(task);
    void task.finally(() => pending.delete(task));
  });
  try {
    await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true, filter });
    while (pending.size) await Promise.all([...pending]);
    assert.deepEqual(errors, [], 'Offline target setup failed');
    assert.ok([...targets.values()].includes('service_worker'), 'No service worker target to put offline; the check would prove nothing.');
    assert.ok([...targets.values()].includes('page'), 'No page target to put offline.');
    return { targets, errors, workerFallbacks, close: () => { unsubscribe(); browser.close(); } };
  } catch (error) {
    unsubscribe(); browser.close(); throw error;
  }
}

/** Require a real worker result for this move, rather than a previous readout. */
async function runAnalysis(cdp, where) {
  const moves = await evaluate(cdp, `Number(document.querySelector('[data-board-snapshot]').dataset.boardMoveCount)`);
  await evaluate(cdp, `(() => {
    const button = document.querySelector('.analyze-toggle');
    if (button.getAttribute('aria-pressed') !== 'true') button.click();
  })()`);
  const result = await waitForExpression(cdp, `offlineAnalysisResponses.find(r => r.type==='katago:analyze_result'
    && r.ok && r.visits>0 && offlineAnalysisRequests.some(q => q.id===r.id && q.ply===${moves}))`, {
    label: `Real worker analysis ${where}`, timeoutMs: ANALYSIS_TIMEOUT_MS,
    diagnose: `({requests:offlineAnalysisRequests,responses:offlineAnalysisResponses,text:${pageText}.slice(0,300)})`,
  });
  assert.equal(result.backend, 'wasm');
  return result;
}

async function main() {
  const distIndex = path.resolve(import.meta.dirname, '../dist/index.html');
  if (!fs.existsSync(distIndex)) {
    throw new Error(
      'No production build to check. Run `npm run build` first -- a dev server '
      + 'registers no service worker, so there is nothing offline to test.',
    );
  }

  const appPort = await freePort();
  const devtoolsPort = await freePort();
  const network = { disabled: false, blocked: [] };
  const server = serveDist(path.resolve(import.meta.dirname, '../dist'), network);
  await new Promise((resolve) => server.listen(appPort, '127.0.0.1', resolve));

  let chrome;
  let cdp;
  let offline;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'web-katrain-offline-'));
  try {
    await waitForHttp(`http://127.0.0.1:${appPort}/`);
    const ciChromeFlags = process.env.CI ? ['--no-sandbox', '--disable-dev-shm-usage'] : [];
    chrome = spawn(chromePath, [
      '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      ...ciChromeFlags,
      `--user-data-dir=${profile}`,
      `--remote-debugging-port=${devtoolsPort}`, '--window-size=1280,900', 'about:blank',
    ], { stdio: ['ignore', 'ignore', 'ignore'] });

    cdp = connectDevtools(await chromeTarget(devtoolsPort));
    await cdp.ready;
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
      localStorage.setItem('web-katrain:settings:v3', JSON.stringify({ soundEnabled:false,
        katagoBackend:'wasm', katagoVisits:64, katagoMaxTimeMs:10000, loadSgfFastAnalysis:false }));
      window.offlineAnalysisRequests = []; window.offlineAnalysisResponses = [];
      const BaseWorker = window.Worker;
      window.Worker = class extends BaseWorker {
        postMessage(...args) {
          const d = args[0];
          if (d.type === 'katago:analyze') offlineAnalysisRequests.push({ id:d.id, ply:d.moveHistory.length, position:d.positionId });
          return super.postMessage(...args);
        }
        constructor(...args) {
          super(...args);
          this.addEventListener('message', event => {
            const d = event.data;
            if (d.type==='katago:analyze_result' || d.type==='katago:analyze_update') {
              offlineAnalysisResponses.push({ id:d.id, type:d.type, ok:d.ok, error:d.error,
                visits:d.analysis?.rootVisits, backend:d.backend });
            }
          });
        }
      };
    ` });
    await setViewport(cdp, { width: 1280, height: 900, mobile: false });

    const url = `http://127.0.0.1:${appPort}/`;
    // Establish the origin without loading the app or registering its worker.
    // An update may remove old bundles, but must retain saved Library data.
    await navigate(cdp, `${url}version.json`);
    await evaluate(cdp, `(async () => {
      for (const name of ['web-katrain-library-data-v1', 'web-katrain-library-data-v2', 'web-katrain-old-offline-probe']) {
        const cache = await caches.open(name);
        await cache.put('https://web-katrain.invalid/offline-retention-probe', new Response('saved Library data'));
      }
    })()`);
    await navigate(cdp, url);
    await sleep(8000);

    const state = await evaluate(cdp, `(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      return reg && reg.active ? reg.active.state : 'none';
    })()`);
    assert.equal(state, 'activated', `Service worker not active: ${state}`);
    console.log('Service worker activated');
    const retention = await evaluate(cdp, `(async () => {
      const result = {};
      for (const name of ['web-katrain-library-data-v1', 'web-katrain-library-data-v2', 'web-katrain-old-offline-probe']) {
        const response = await caches.match('https://web-katrain.invalid/offline-retention-probe', { cacheName:name });
        result[name] = response ? await response.text() : null;
      }
      return result;
    })()`);
    assert.deepEqual(retention, {
      'web-katrain-library-data-v1': 'saved Library data',
      'web-katrain-library-data-v2': 'saved Library data',
      'web-katrain-old-offline-probe': null,
    }, 'Activation must retain Library data while deleting obsolete app-shell caches');
    console.log('Service-worker activation retained both Library data namespaces and removed the obsolete app shell.');

    const cached = await evaluate(cdp, `(async () => {
      const counts = {};
      for (const name of await caches.keys()) counts[name] = (await (await caches.open(name)).keys()).length;
      return counts;
    })()`);
    const total = Object.values(cached).reduce((sum, n) => sum + n, 0);
    assert.ok(total > 0, `Nothing was cached: ${JSON.stringify(cached)}`);
    console.log(`Cached ${total} entries: ${JSON.stringify(cached)}`);
    const missingBoardImages = await evaluate(cdp, `(async () => {
      const theme = document.querySelector('[data-board-snapshot=true]')?.dataset.boardTheme;
      const used = performance.getEntriesByType('resource').filter(e => new URL(e.name).pathname.includes('/themes/' + theme + '/'));
      const missing = [];
      for (const asset of used) if (!(await caches.match(asset.name))) missing.push(new URL(asset.name).pathname);
      return missing;
    })()`);
    assert.deepEqual(missingBoardImages, [], `Default board images were not cached: ${JSON.stringify(missingBoardImages)}`);

    // Use the engine once online: its worker chunk is fetched lazily, and the
    // promise is that what you actually use stays available offline.
    await runAnalysis(cdp, 'online');
    console.log('Analysed once while online');

    offline = await goOffline(devtoolsPort);
    const initialTargets = new Set(offline.targets.keys());
    network.disabled = true;
    console.log(`Offline page/service worker; ${offline.workerFallbacks.size} existing inference worker(s) use disabled HTTP cache and a blocked server.`);

    await navigate(cdp, url);
    await sleep(5000);

    const booted = await evaluate(cdp, `(() => ({
      board: !!document.querySelector('[data-board-snapshot="true"]'),
      failed: performance.getEntriesByType('resource')
        .filter((entry) => entry.responseStatus === 0)
        .map((entry) => new URL(entry.name).pathname),
      text: ${pageText}.slice(0, 160),
    }))()`);
    assert.ok(booted.board, `The board did not render offline: ${JSON.stringify(booted)}`);
    assert.deepEqual(booted.failed, [], `Requests failed offline: ${JSON.stringify(booted.failed)}`);
    console.log('Booted offline with no failed request');

    // The online analysis can create recovery data. Resolve the real prompt
    // before testing shortcuts; a recovery dialog correctly blocks them.
    await evaluate(cdp, `(() => {
      const recovery = document.querySelector('[aria-labelledby=auto-save-recovery-title]');
      [...(recovery?.querySelectorAll('button') ?? [])].find(e => e.textContent.trim() === 'Restore Game')?.click();
    })()`);
    await waitForExpression(cdp, '!document.querySelector("[aria-labelledby=auto-save-recovery-title]")');
    await evaluate(cdp, 'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');

    // These were the first idle imports: their initial requests could finish
    // outside worker control, then a partial startup report pruned their only
    // cached copies. Open both real dialogs after the offline reload.
    await evaluate(cdp, `(() => {
      document.activeElement?.blur();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', bubbles: true, cancelable: true }));
    })()`);
    await waitForExpression(cdp, '!!document.querySelector("[aria-labelledby=tsumego-frame-title]")', {
      label: 'Offline tsumego dialog', timeoutMs: 15000,
      diagnose: `({ dialogs: [...document.querySelectorAll('[role=dialog]')].map(e => ({ title: e.getAttribute('aria-labelledby'), text: e.textContent.slice(0, 220) })),
        failed: performance.getEntriesByType('resource').filter(e => e.responseStatus === 0).map(e => e.name) })`,
    });
    await evaluate(cdp, `document.querySelector('[aria-label="Close frame as tsumego"]').click()`);
    await waitForExpression(cdp, '!document.querySelector("[aria-labelledby=tsumego-frame-title]")');
    await evaluate(cdp, `document.querySelector('[aria-label="More file actions"]').click()`);
    await waitForExpression(cdp, `[...document.querySelectorAll('.popover.menu button')].some(e => e.textContent.trim() === 'Paste SGF / OGS')`);
    await evaluate(cdp, `[...document.querySelectorAll('.popover.menu button')].find(e => e.textContent.trim() === 'Paste SGF / OGS').click()`);
    await waitForExpression(cdp, '!!document.querySelector("[aria-labelledby=paste-sgf-title] textarea")', { label: 'Offline paste dialog' });
    await evaluate(cdp, `document.querySelector('[aria-label="Close paste SGF"]').click()`);
    const failedAfterDialogs = await evaluate(cdp, `performance.getEntriesByType('resource')
      .filter(entry => entry.responseStatus === 0).map(entry => new URL(entry.name).pathname)`);
    assert.deepEqual(failedAfterDialogs, [], 'Offline dialogs must not request missing bundles');
    console.log('Opened Frame as tsumego and Paste SGF offline');

    // A new move cannot reuse the position evaluated online or its readout.
    const point = await evaluate(cdp, `(() => {
      const board=document.querySelector('[data-board-snapshot]'), r=board.getBoundingClientRect();
      return {x:r.x+Number(board.dataset.boardOriginX)+3*Number(board.dataset.boardCellSize),
        y:r.y+Number(board.dataset.boardOriginY)+3*Number(board.dataset.boardCellSize)};
    })()`);
    for (const type of ['mousePressed', 'mouseReleased']) {
      await cdp.send('Input.dispatchMouseEvent', { type, ...point, button:'left', clickCount:1 });
    }
    await waitForExpression(cdp, 'document.querySelector("[data-board-snapshot]")?.dataset.boardMoveCount==="1"');
    const result = await runAnalysis(cdp, 'after offline reload');
    await waitForExpression(cdp, `(() => {
      const readout = document.querySelector('.cb-metric .v.win');
      return !!readout?.getBoundingClientRect().width && /^\\d+(?:\\.\\d+)?%$/.test(readout.textContent.trim());
    })()`, { label:'Rendered offline win rate', diagnose: `({readout:document.querySelector('.cb-metric .v.win')?.textContent,
      requests:offlineAnalysisRequests,responses:offlineAnalysisResponses})` });
    assert.deepEqual(offline.errors, [], 'New worker network guards must initialize');
    assert.ok([...offline.targets].some(([id,type]) => type==='worker' && !initialTargets.has(id)),
      'The fresh inference worker must be attached and cache-disabled before executing');
    assert.deepEqual(network.blocked.filter(url => url !== '/sw.js'), [], 'An offline dependency tried to reach the server');
    console.log(`Fresh offline WASM analysis completed with ${result.visits} visits and a rendered win-rate readout.`);

    // Negative control: HTTP cache is disabled, so deleting the app caches
    // must make this same offline navigation fail rather than pass from disk.
    await evaluate(cdp, '(async () => { for (const name of await caches.keys()) await caches.delete(name); })()');
    await assert.rejects(navigate(cdp, url, 15000, { acceptBeforeUnload:true }), /Navigation failed|net::ERR_/);
    console.log('Offline negative control passed: deleting the app caches prevents navigation.');
    console.log('Offline check passed: cached shell, board, dialogs, and fresh analysis; no dependency served over the network.');
  } finally {
    offline?.close();
    await closeBrowser(cdp, chrome);
    server.close();
    fs.rmSync(profile, { recursive:true, force:true });
  }
}

await main();
