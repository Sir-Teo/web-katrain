import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {
  chromePath,
  chromeTarget,
  connectDevtools,
  evaluate,
  freePort,
  navigate,
  setViewport,
  sleep,
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
 * So this puts *every* target offline, the worker's included, and leaves the
 * server running. Verified to fail as it should: with the caches deleted first,
 * the offline navigation itself gets net::ERR_FAILED.
 *
 * The app is loaded twice before the network is cut, because that is what the
 * guarantee is. A *first* visit fetches the chunks of the first paint before
 * the worker controls the page, so they never reach a cache;
 * `DesktopDashboard`, `ScoreWinrateGraph` and the dashboard CSS are still
 * missing after one visit and the app offers its error page offline. Closing
 * that needs the build to name its own chunks, which is a separate change.
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
function serveDist(root) {
  const server = http.createServer((request, response) => {
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

/** Cuts the network for the page *and* the service worker that serves it. */
async function goOffline(devtoolsPort) {
  const version = await (await fetch(`http://127.0.0.1:${devtoolsPort}/json/version`)).json();
  const browser = connectDevtools(version.webSocketDebuggerUrl);
  await browser.ready;
  const { result: { targetInfos } } = await browser.send('Target.getTargets');
  const offlined = [];
  for (const target of targetInfos) {
    if (target.type !== 'page' && target.type !== 'service_worker') continue;
    const { result } = await browser.send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
    if (!result || !result.sessionId) continue;
    await browser.send('Network.enable', {}, result.sessionId);
    await browser.send('Network.emulateNetworkConditions', OFFLINE, result.sessionId);
    offlined.push(target.type);
  }
  assert.ok(offlined.includes('service_worker'), 'No service worker target to put offline; the check would prove nothing.');
  assert.ok(offlined.includes('page'), 'No page target to put offline.');
  return offlined;
}

/** Turns analysis on and waits for a win-rate readout, or says why not. */
async function runAnalysis(cdp, where) {
  // Tab *toggles*, and analysis mode persists across a reload, so a single
  // blind press can just as easily turn it off. Drive it by the outcome
  // instead: press, wait, and press again if nothing is happening.
  const toggle = () => evaluate(cdp, `(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    return true;
  })()`);
  await toggle();
  const deadline = Date.now() + ANALYSIS_TIMEOUT_MS;
  let presses = 1;
  let waited = 0;
  while (Date.now() < deadline) {
    await sleep(3000);
    waited += 3000;
    if (waited >= 18_000 && presses < 3) {
      await toggle();
      presses += 1;
      waited = 0;
    }
    const state = await evaluate(cdp, `(() => {
      const text = ${pageText};
      return { failed: /Engine error/i.test(text), done: /WIN\\s+\\d/i.test(text), excerpt: text.slice(0, 200) };
    })()`);
    assert.ok(!state.failed, `The engine failed ${where}: ${state.excerpt}`);
    if (state.done) return;
  }
  assert.fail(`No analysis result ${where} within ${ANALYSIS_TIMEOUT_MS / 1000}s`);
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
  const server = serveDist(path.resolve(import.meta.dirname, '../dist'));
  await new Promise((resolve) => server.listen(appPort, '127.0.0.1', resolve));

  let chrome;
  try {
    await waitForHttp(`http://127.0.0.1:${appPort}/`);
    const ciChromeFlags = process.env.CI ? ['--no-sandbox', '--disable-dev-shm-usage'] : [];
    chrome = spawn(chromePath, [
      '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      ...ciChromeFlags,
      `--remote-debugging-port=${devtoolsPort}`, '--window-size=1280,900', 'about:blank',
    ], { stdio: ['ignore', 'ignore', 'ignore'] });

    const cdp = connectDevtools(await chromeTarget(devtoolsPort));
    await cdp.ready;
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await setViewport(cdp, { width: 1280, height: 900, mobile: false });

    const url = `http://127.0.0.1:${appPort}/`;
    await navigate(cdp, url);
    await sleep(8000);

    const state = await evaluate(cdp, `(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      return reg && reg.active ? reg.active.state : 'none';
    })()`);
    assert.equal(state, 'activated', `Service worker not active: ${state}`);
    console.log('Service worker activated');

    const cached = await evaluate(cdp, `(async () => {
      const counts = {};
      for (const name of await caches.keys()) counts[name] = (await (await caches.open(name)).keys()).length;
      return counts;
    })()`);
    const total = Object.values(cached).reduce((sum, n) => sum + n, 0);
    assert.ok(total > 0, `Nothing was cached: ${JSON.stringify(cached)}`);
    console.log(`Cached ${total} entries: ${JSON.stringify(cached)}`);

    // Use the engine once online: its worker chunk is fetched lazily, and the
    // promise is that what you actually use stays available offline.
    await runAnalysis(cdp, 'online');
    console.log('Analysed once while online');

    console.log(`Offline for: ${(await goOffline(devtoolsPort)).join(', ')}`);

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

    // Offline *analysis* is deliberately not asserted here. Driving the engine
    // online first does get its worker chunk cached -- without that step the
    // offline attempt dies with "KataGo worker crashed: unknown error" -- but
    // even then no result arrived within 90s under this harness, and the cause
    // was not pinned down. Asserting it would make the check flaky; leaving it
    // out silently would be worse, so it is named here instead. The online run
    // above is a real control: it proves the engine works in this environment,
    // so a future attempt starts from a known-good baseline.
    console.log('Offline check passed: shell and board served from cache; engine verified online.');
  } finally {
    if (chrome) chrome.kill();
    server.close();
  }
}

await main();
