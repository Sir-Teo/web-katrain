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
  waitForExpression,
} from './lib/browser.mjs';

/**
 * A first visit must leave the board and engine usable without the network.
 * Put the page and service worker offline and disable HTTP caches. Dedicated
 * workers inherit the page's network conditions; an uncached CORS endpoint
 * verifies that inheritance rather than trusting navigator.onLine.
 *
 * Reloading an analyzed game opens recovery. Restore it, play a new position,
 * and require a real worker result for that position. A cached win rate or a
 * shortcut ignored behind the recovery dialog cannot pass this check.
 */
const TIMEOUT_MS = 60_000;
const OFFLINE = { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 };
const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.wasm': 'application/wasm', '.gz': 'application/gzip',
  '.svg': 'image/svg+xml', '.png': 'image/png',
};

// Observe metadata only; the real worker runs unchanged and keeps its buffers.
const FIXTURE_SCRIPT = `
  if (!localStorage.getItem('web-katrain:settings:v3')) {
    localStorage.setItem('web-katrain:settings:v3', JSON.stringify({
      katagoBackend: 'wasm', katagoVisits: 16, katagoMaxTimeMs: 1000,
      soundEnabled: false, timerMainTimeMinutes: 0, timerByoPeriods: 0,
      autoSaveRecovery: true, trainerSaveAnalysis: true, loadSgfFastAnalysis: false,
    }));
  }
  localStorage.setItem('web-katrain:pwa-install-dismissed:v1', 'true');
  window.offlineCheckTrace = { requests: [], results: [] };
  window.Worker = new Proxy(window.Worker, {
    construct(Type, args) {
      const worker = Reflect.construct(Type, args);
      const post = worker.postMessage.bind(worker);
      worker.postMessage = (message, ...rest) => {
        if (message?.type === 'katago:analyze') offlineCheckTrace.requests.push({
          id: message.id, position: message.positionId,
          stones: message.board.flat().filter(Boolean).length, player: message.currentPlayer,
        });
        return post(message, ...rest);
      };
      worker.addEventListener('message', event => {
        const data = event.data;
        if (data?.type === 'katago:analyze_result') offlineCheckTrace.results.push({
          id: data.id, ok: data.ok, canceled: data.canceled, backend: data.backend,
          visits: data.analysis?.rootVisits, error: data.error,
        });
      });
      return worker;
    },
  });
`;

function deploymentBase(index) {
  const entry = /<script\b[^>]*\bsrc="([^"]+)"[^>]*>/.exec(index)?.[1];
  assert.ok(entry, 'The production entry script is missing');
  const pathname = new URL(entry, 'http://localhost').pathname;
  const assets = pathname.lastIndexOf('/assets/');
  assert.ok(assets >= 0, `Unexpected production entry: ${entry}`);
  return decodeURIComponent(pathname.slice(0, assets + 1));
}

/** Match GitHub Pages: no COOP/COEP, so TFJS uses the precached SIMD WASM build. */
function serveDist(root, base) {
  return http.createServer((request, response) => {
    const requested = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (!requested.startsWith(base)) return response.writeHead(404).end();
    const relative = requested.slice(base.length) + (requested.endsWith('/') ? 'index.html' : '');
    const file = path.join(root, relative);
    if (!file.startsWith(`${root}${path.sep}`)) return response.writeHead(403).end();
    fs.readFile(file, (error, body) => {
      if (error) return response.writeHead(404).end();
      response.writeHead(200, { 'Content-Type': CONTENT_TYPES[path.extname(file)] || 'application/octet-stream' }).end(body);
    });
  });
}

async function command(client, method, params = {}, sessionId) {
  const reply = await client.send(method, params, sessionId);
  assert.ok(!reply.error, `${method}: ${JSON.stringify(reply.error)}`);
  return reply.result;
}

const wait = (cdp, expression, label = 'Offline check') =>
  waitForExpression(cdp, expression, { label, timeoutMs: TIMEOUT_MS });

async function click(cdp, expression) {
  const point = await wait(cdp, `(async()=>{
    const e=${expression};if(!e)return false;e.scrollIntoView({block:'nearest'});
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    if(!e.isConnected)return false;
    const a=e.getBoundingClientRect(),x=a.x+a.width/2,y=a.y+a.height/2;
    return !e.disabled&&a.width&&a.height&&e.contains(document.elementFromPoint(x,y))?{x,y}:false;
  })()`, 'Offline native control');
  for (const type of ['mousePressed', 'mouseReleased']) {
    await command(cdp, 'Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 });
  }
}

async function analyzePosition(cdp, stones) {
  if (await evaluate(cdp, 'document.querySelector("button.analyze-toggle")?.getAttribute("aria-pressed")!=="true"')) {
    await click(cdp, 'document.querySelector("button.analyze-toggle")');
  }
  const proof = await wait(cdp, `(()=>{
    const t=offlineCheckTrace;
    for(const request of t.requests.filter(r=>r.stones===${stones})){
      const result=t.results.find(r=>r.id===request.id&&r.ok&&!r.canceled&&r.visits>=16);
      if(result)return {request,result};
    }
    return t.results.some(r=>!r.ok&&!r.canceled)?{error:t.results}:false;
  })()`, `Fresh analysis of ${stones} stones`);
  assert.ok(!proof.error, JSON.stringify(proof));
  assert.equal(proof.result.backend, 'wasm');
  return proof;
}

async function configureOffline(cdp, devtoolsPort, controlUrl) {
  const version = await (await fetch(`http://127.0.0.1:${devtoolsPort}/json/version`)).json();
  const browser = connectDevtools(version.webSocketDebuggerUrl);
  await browser.ready;
  const pending = new Set(), configured = new Map(), workers = new Map(), errors = [];
  const configure = async (client, sessionId, info) => {
    await command(client, 'Network.enable', {}, sessionId);
    await command(client, 'Network.setCacheDisabled', { cacheDisabled: true }, sessionId);
    // Dedicated workers reject this CDP command. They inherit page emulation;
    // the worker's positive/negative fetch controls below prove the boundary.
    if (info.type !== 'worker') await command(client, 'Network.emulateNetworkConditions', OFFLINE, sessionId);
    configured.set(info.targetId, info.type);
  };
  const unsubscribe = cdp.on(message => {
    if (message.method !== 'Target.attachedToTarget') return;
    const { sessionId, targetInfo } = message.params;
    if (targetInfo.type === 'worker') workers.set(targetInfo.targetId, sessionId);
    let job;
    job = (async () => {
      try { await configure(cdp, sessionId, targetInfo); }
      catch (error) { errors.push(String(error)); }
      finally { await command(cdp, 'Runtime.runIfWaitingForDebugger', {}, sessionId); }
    })().catch(error => errors.push(String(error))).finally(() => pending.delete(job));
    pending.add(job);
  });
  const fetchControl = async sessionId => {
    assert.ok(sessionId, 'The dedicated worker debugger session is missing');
    const reply = await command(cdp, 'Runtime.evaluate', {
      expression: `fetch(${JSON.stringify(controlUrl)},{cache:'no-store'}).then(async r=>({ok:r.ok,text:await r.text()}),e=>({ok:false,error:String(e)}))`,
      awaitPromise: true, returnByValue: true,
    }, sessionId);
    assert.ok(!reply.exceptionDetails, JSON.stringify(reply.exceptionDetails));
    return reply.result.value;
  };
  try {
    // Pause newly created workers before execution, including after the reload.
    await command(cdp, 'Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
    await Promise.all([...pending]);
    const onlineControl = await fetchControl([...workers.values()][0]);
    assert.equal(onlineControl.text, 'network-control', 'The worker cannot reach the online control');
    const targets = (await command(browser, 'Target.getTargets')).targetInfos;
    for (const info of targets) {
      if (!['page', 'service_worker', 'worker'].includes(info.type) || configured.has(info.targetId)) continue;
      const { sessionId } = await command(browser, 'Target.attachToTarget', { targetId: info.targetId, flatten: true });
      await configure(browser, sessionId, info);
    }
    assert.deepEqual(errors, []);
    return {
      async verify() {
        await Promise.all([...pending]);
        assert.deepEqual(errors, []);
        const targets = (await command(browser, 'Target.getTargets')).targetInfos.filter(t => ['page', 'worker', 'service_worker'].includes(t.type));
        assert.deepEqual(targets.filter(t => !configured.has(t.targetId)).map(t => t.type), [], 'A new target was not configured');
        const currentWorker = [...workers.entries()].reverse().find(([id]) => targets.some(t => t.targetId === id));
        const offlineControl = await fetchControl(currentWorker?.[1]);
        assert.equal(offlineControl.ok, false, 'The dedicated worker still reaches the uncached endpoint');
        console.log('Worker network control: reachable online and blocked offline');
      },
      close() { unsubscribe(); browser.close(); },
    };
  } catch (error) {
    unsubscribe();
    browser.close();
    throw error;
  }
}

async function stopChrome(chrome) {
  if (!chrome || chrome.exitCode !== null) return;
  await new Promise(resolve => {
    const timer = setTimeout(() => { chrome.kill('SIGKILL'); resolve(); }, 2000);
    timer.unref();
    chrome.once('exit', () => { clearTimeout(timer); resolve(); });
    chrome.kill();
  });
}

async function main() {
  const root = path.resolve(import.meta.dirname, '../dist'), index = path.join(root, 'index.html');
  assert.ok(fs.existsSync(index), 'No production build. Run npm run build before test:offline.');
  const base = deploymentBase(fs.readFileSync(index, 'utf8'));
  const runDir = fs.mkdtempSync(path.resolve(import.meta.dirname, '../node_modules/.web-katrain-offline-'));
  const server = serveDist(root, base);
  let controlRequests = 0;
  // A second origin is outside the app worker's scope and allows CORS. Failure
  // there after a successful online fetch proves an actual network boundary.
  const controlServer = http.createServer((request, response) => {
    if (request.url !== '/network-control') return response.writeHead(404).end();
    controlRequests++;
    response.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }).end('network-control');
  });
  let chrome, cdp, network;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    await new Promise(resolve => controlServer.listen(0, '127.0.0.1', resolve));
    const debugPort = await freePort();
    const ciFlags = process.env.CI ? ['--no-sandbox', '--disable-dev-shm-usage'] : [];
    chrome = spawn(chromePath, [
      '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', ...ciFlags,
      `--user-data-dir=${path.join(runDir, 'chrome')}`, `--remote-debugging-port=${debugPort}`, 'about:blank',
    ], { stdio: 'ignore' });
    cdp = connectDevtools(await chromeTarget(debugPort));
    await cdp.ready;
    await command(cdp, 'Page.enable');
    await command(cdp, 'Network.enable');
    await command(cdp, 'Network.setCacheDisabled', { cacheDisabled: true });
    await command(cdp, 'Emulation.setFocusEmulationEnabled', { enabled: true });
    await command(cdp, 'Page.addScriptToEvaluateOnNewDocument', { source: FIXTURE_SCRIPT });
    await setViewport(cdp, { width: 1280, height: 900, mobile: false });
    const url = `http://127.0.0.1:${server.address().port}${base}`;
    await navigate(cdp, url);
    await wait(cdp, '!!document.querySelector("[data-board-snapshot=true]")');
    await wait(cdp, 'navigator.serviceWorker.controller?.state==="activated"', 'First-visit service worker');
    await wait(cdp, `(async()=>{
      const urls=performance.getEntriesByType('resource').map(e=>e.name).filter(u=>{
        const pathname=new URL(u).pathname;return pathname.includes('/themes/')||pathname.includes('/katrain/');
      });
      return urls.length>0&&(await Promise.all(urls.map(u=>caches.match(u)))).every(Boolean);
    })()`, 'First-visit board assets');
    console.log(`First visit cached the board at ${base}`);
    const online = await analyzePosition(cdp, 0);
    console.log(`Online control: ${online.result.visits} WASM visits`);
    await click(cdp, 'document.querySelector("button.analyze-toggle")');
    network = await configureOffline(cdp, debugPort, `http://127.0.0.1:${controlServer.address().port}/network-control`);
    assert.equal(controlRequests, 1);
    // This private fixture owns the generated game and explicitly restores its
    // recovery after accepting the browser's unsaved-game warning.
    await navigate(cdp, url, 15_000, { acceptBeforeUnload: true });
    await wait(cdp, '!!document.querySelector("#auto-save-recovery-title")');
    await click(cdp, `[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Restore Game')`);
    await wait(cdp, '!document.querySelector("[role=dialog]")&&!history.state?.webKatrainOverlay');
    const before = await evaluate(cdp, 'document.querySelector("[data-board-snapshot]").dataset.boardStones');
    const point = await evaluate(cdp, `(()=>{
      const e=document.querySelector('[data-board-snapshot]'),r=e.getBoundingClientRect();
      return {x:r.x+Number(e.dataset.boardOriginX)+3*Number(e.dataset.boardCellSize),y:r.y+Number(e.dataset.boardOriginY)+3*Number(e.dataset.boardCellSize)};
    })()`);
    assert.ok(await evaluate(cdp, `document.querySelector('[data-board-snapshot]').contains(document.elementFromPoint(${point.x},${point.y}))`));
    await command(cdp, 'Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
    for (const type of ['mousePressed', 'mouseReleased']) {
      await command(cdp, 'Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 });
    }
    await wait(cdp, `document.querySelector('[data-board-snapshot]').dataset.boardStones!==${JSON.stringify(before)}`);
    const offline = await analyzePosition(cdp, 1);
    assert.equal(offline.request.player, 'white');
    await network.verify();
    assert.equal(controlRequests, 1, 'An offline fetch reached the control server');
    const failed = await evaluate(cdp, `performance.getEntriesByType('resource').filter(e=>e.responseStatus===0).map(e=>new URL(e.name).pathname)`);
    assert.deepEqual(failed, [], `Requests failed offline: ${JSON.stringify(failed)}`);
    console.log(`Offline check passed: cached board, restored game and a fresh ${offline.result.visits}-visit WASM result for White`);
  } catch (error) {
    if (cdp) console.error('Offline UI:', await evaluate(cdp, `(()=>({
      dialogs:[...document.querySelectorAll('[role=dialog]')].map(e=>e.getAttribute('aria-labelledby')),
      focus:document.activeElement?.outerHTML.slice(0,180),trace:window.offlineCheckTrace,
      text:document.body.innerText.slice(0,300),
    }))()`).catch(cause => String(cause)));
    throw error;
  } finally {
    network?.close();
    cdp?.close();
    await stopChrome(chrome);
    server.close();
    controlServer.close();
    fs.rmSync(runDir, { recursive: true, force: true });
  }
}

await main();
