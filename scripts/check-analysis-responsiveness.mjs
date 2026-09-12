import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  chromePath, chromeTarget, connectDevtools, evaluate, freePort,
  navigate, setViewport, sleep, waitForHttp,
} from './lib/browser.mjs';
import { assertAiMoveCancellation } from './lib/ai-move-check.mjs';

// A quick click handler does not prove the engine followed the move. CPU/WASM
// inference once starved incoming worker messages, leaving the new position's
// evaluation blank for 32 seconds while obsolete searches finished. Exercise
// real inference and trusted input against dist/, without replacing responses.
const freshPositionBudgetMs = 2500;
const gameRules = process.env.ANALYSIS_GAME_RULES ?? 'japanese';
assert.ok(['japanese', 'chinese', 'korean', 'aga', 'new-zealand', 'tromp-taylor', 'stone-scoring'].includes(gameRules), 'Unknown ANALYSIS_GAME_RULES');
const root = path.resolve(import.meta.dirname, '..');
const outputDir = process.env.ANALYSIS_SCREENSHOT_DIR
  ?? path.join(os.tmpdir(), 'web-katrain-analysis-check');

async function stopProcess(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), 1500);
  try {
    await exited;
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  assert.ok(fs.existsSync(path.join(root, 'dist/index.html')),
    'Run npm run build first; this check measures the production bundle.');
  fs.mkdirSync(outputDir, { recursive: true });
  const appPort = await freePort();
  const devtoolsPort = await freePort();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'web-katrain-analysis-'));
  const server = spawn(path.join(root, 'node_modules/.bin/vite'), [
    'preview', '--host', '127.0.0.1', '--port', String(appPort), '--strictPort',
  ], { cwd: root, stdio: 'ignore' });
  let chrome;
  let cdp;
  const errors = [];
  const spawnErrors = [];
  server.on('error', (error) => spawnErrors.push(error.message));
  const screenshot = async (name) => {
    const response = await cdp.send('Page.captureScreenshot', { format: 'png' });
    assert.ok(response.result?.data, `Screenshot failed: ${JSON.stringify(response.error)}`);
    fs.writeFileSync(path.join(outputDir, `${name}.png`), Buffer.from(response.result.data, 'base64'));
  };
  try {
    await waitForHttp(`http://127.0.0.1:${appPort}/`);
    chrome = spawn(chromePath, [
      '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      ...(process.env.CI ? ['--no-sandbox', '--disable-dev-shm-usage'] : []),
      `--user-data-dir=${profile}`, `--remote-debugging-port=${devtoolsPort}`, 'about:blank',
    ], { stdio: 'ignore' });
    chrome.on('error', (error) => spawnErrors.push(error.message));
    cdp = connectDevtools(await chromeTarget(devtoolsPort));
    await cdp.ready;
    await cdp.send('Runtime.enable');
    cdp.on((message) => {
      if (message.method === 'Runtime.exceptionThrown') {
        const details = message.params.exceptionDetails;
        errors.push(details.exception?.description ?? details.text);
      }
    });
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
      localStorage.setItem('web-katrain:settings:v3', JSON.stringify({
        katagoVisits: 50000, katagoFastVisits: 50000, katagoMaxTimeMs: 8000,
        katagoBackend: 'wasm', soundEnabled: false, loadSgfFastAnalysis: false,
        gameRules: ${JSON.stringify(gameRules)},
      }));
      localStorage.setItem('web-katrain:library_open:v1', 'false');
      window.auditRequests = [];
      window.auditResponses = [];
      const BaseWorker = window.Worker;
      window.Worker = class extends BaseWorker {
        postMessage(...args) {
          const d = args[0];
          if (d.type === 'katago:analyze') window.auditRequests.push({
            at: performance.now(), id: d.id, positionId: d.positionId,
            ply: d.moveHistory.length, visits: d.visits, group: d.analysisGroup,
            rules: d.rules, historyPositions: d.repetitionHistory?.length ?? 0,
          });
          return super.postMessage(...args);
        }
        constructor(...args) {
          super(...args);
          this.addEventListener('message', (event) => {
            const d = event.data;
            if (d.type === 'katago:analyze_update' || d.type === 'katago:analyze_result') {
              window.auditResponses.push({
                at: performance.now(), id: d.id, type: d.type,
                canceled: !!d.canceled, visits: d.analysis?.rootVisits, backend: d.backend, ok: d.ok,
              });
            }
          });
        }
      };
    ` });
    const throttle = Number(process.env.ANALYSIS_CPU_THROTTLE ?? 1);
    assert.ok(Number.isFinite(throttle) && throttle >= 1, 'ANALYSIS_CPU_THROTTLE must be at least 1');
    // CDP throttles the renderer, not the separate inference worker.
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
    await setViewport(cdp, { width: 1280, height: 800, mobile: false });
    await navigate(cdp, `http://127.0.0.1:${appPort}/`);
    const wait = async (expression, timeoutMs = 20000) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const result = await evaluate(cdp, expression);
        if (result) return result;
        await sleep(50);
      }
      throw new Error(`Timed out waiting for ${expression}`);
    };
    const clickAt = async (point) => {
      for (const type of ['mousePressed', 'mouseReleased']) {
        await cdp.send('Input.dispatchMouseEvent', {
          type, ...point, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0,
        });
      }
    };
    const analyze = await wait(`(() => {
      const b = document.querySelector('.analyze-toggle');
      if (!b || b.disabled) return false;
      const r = b.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
      return r.width && b.contains(document.elementFromPoint(x, y)) ? { x, y } : false;
    })()`);
    await clickAt(analyze);
    let first = await wait('auditResponses.find(r => r.type === "katago:analyze_update" && r.ok && r.visits > 0)');
    assert.equal(first.backend, 'wasm');
    await wait(`(() => {
      const best = document.querySelector('.cb-metric .v.best');
      return best?.textContent && best.textContent !== '—';
    })()`);
    assert.equal(await evaluate(cdp, 'document.querySelector("#wk-engine-pill-label")?.textContent'),
      'Analyzing…', 'Live evaluation must not be labeled as model loading');
    await screenshot('first-progress');
    const stopAt = await evaluate(cdp, 'performance.now()');
    for (const type of ['keyDown', 'keyUp']) {
      await cdp.send('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    }
    await wait('document.querySelector(".analyze-toggle").getAttribute("aria-pressed") === "false"');
    const stopped = await wait(`auditResponses.find(r => r.id === ${first.id} && r.type === 'katago:analyze_result')`);
    assert.equal(stopped.canceled, true, 'Stop must reach the worker, not just hide its results');
    const stoppedMs = stopped.at - stopAt;
    assert.ok(stoppedMs >= 0, 'The search must still be active when Stop is pressed');
    assert.ok(stoppedMs < 1000, `Worker kept searching for ${stoppedMs.toFixed(1)} ms after Stop`);
    await screenshot('stopped');
    // Confirm the live-analysis loop does not restart after its promise settles.
    await sleep(350);
    assert.equal(await evaluate(cdp, `auditRequests.filter(r => r.at > ${stopAt}).length`), 0);
    await clickAt(analyze);
    first = await wait(`auditResponses.find(r => r.id > ${first.id}
      && r.type === 'katago:analyze_update' && r.ok && r.visits > 0)`);
    const point = await evaluate(cdp, `(() => {
      window.auditUiAt = 0;
      window.auditOldId = ${first.id};
      window.auditClickAt = performance.now();
      window.auditObserver = new MutationObserver(() => {
        const board = document.querySelector('[data-board-snapshot=true]');
        const best = document.querySelector('.cb-metric .v.best');
        const freshResponse = auditResponses.some(r => r.ok && r.visits > 0
          && auditRequests.some(q => q.id === r.id && q.ply === 1));
        if (!auditUiAt && freshResponse && board?.dataset.boardStones.replaceAll('.', '').length === 1
          && best?.textContent && best.textContent !== '—') window.auditUiAt = performance.now();
      });
      auditObserver.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
      const b = document.querySelector('[data-board-snapshot=true]'), r = b.getBoundingClientRect();
      const x = r.x + Number(b.dataset.boardOriginX) + 3 * Number(b.dataset.boardCellSize);
      const y = r.y + Number(b.dataset.boardOriginY) + 3 * Number(b.dataset.boardCellSize);
      if (!b.contains(document.elementFromPoint(x, y))) throw new Error('Board point is obscured');
      return { x, y };
    })()`);
    await clickAt(point);
    await wait("document.querySelector('[data-board-snapshot=true]').dataset.boardStones.replaceAll('.', '').length === 1");
    await wait('auditUiAt');
    const result = await evaluate(cdp, `(() => {
      const response = auditResponses.find(r => r.ok && r.visits > 0
        && auditRequests.some(q => q.id === r.id && q.ply === 1));
      const request = auditRequests.find(q => q.id === response.id);
      const canceled = auditResponses.find(r => r.id === auditOldId && r.canceled);
      auditObserver.disconnect();
      return {
        freshResponseMs: response.at - auditClickAt, freshUiMs: auditUiAt - auditClickAt,
        dispatchDelayMs: request.at - auditClickAt, workerHandoffMs: response.at - request.at,
        oldCanceled: !!canceled, oldCancelMs: canceled ? canceled.at - auditClickAt : null,
        visits: response.visits, backend: response.backend, requests: auditRequests, responses: auditResponses,
      };
    })()`);
    assert.ok(result.requests.every(request => request.rules === gameRules), 'The worker must receive the selected rules');
    if (['aga', 'new-zealand', 'tromp-taylor'].includes(gameRules)) {
      assert.ok(result.requests.every(request => request.historyPositions > 0), 'Superko requests must carry repetition history');
    }
    fs.writeFileSync(path.join(outputDir, 'results.json'), JSON.stringify({ gameRules, rendererThrottle: throttle, stoppedMs, ...result, errors }, null, 2));
    await screenshot('fresh-position');

    // Play another move and stop before its 500 ms deferred request can fire.
    // Waiting for its evaluation first would miss this race on a slow machine.
    const nextPoint = await evaluate(cdp, `(() => {
      const b = document.querySelector('[data-board-snapshot=true]'), r = b.getBoundingClientRect();
      return { x: r.x + Number(b.dataset.boardOriginX) + 15 * Number(b.dataset.boardCellSize),
        y: r.y + Number(b.dataset.boardOriginY) + 15 * Number(b.dataset.boardCellSize) };
    })()`);
    const nextMoveAt = await evaluate(cdp, 'performance.now()');
    await clickAt(nextPoint);
    await wait("document.querySelector('[data-board-snapshot=true]').dataset.boardStones.replaceAll('.', '').length === 2");
    for (const type of ['keyDown', 'keyUp']) {
      await cdp.send('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    }
    const stopAfterMoveAt = await evaluate(cdp, 'performance.now()');
    assert.ok(stopAfterMoveAt - nextMoveAt < 500, 'Stop must precede the delayed move-analysis callback');
    await wait('document.querySelector(".analyze-toggle").getAttribute("aria-pressed") === "false"');
    await sleep(750);
    const restarted = await evaluate(cdp, `auditRequests.filter(r => r.at > ${stopAfterMoveAt})`);
    assert.deepEqual(restarted, [], 'A delayed move callback must not restart analysis after Stop');
    await screenshot('stopped-after-move');

    await assertAiMoveCancellation(cdp, outputDir, gameRules);

    assert.deepEqual(spawnErrors, []);
    assert.deepEqual(errors, []);
    assert.equal(result.oldCanceled, true, 'The obsolete search must be canceled');
    assert.ok(result.oldCancelMs >= 0, 'The previous position must still be searching when the move is played');
    assert.ok(result.freshUiMs < freshPositionBudgetMs,
      `Current-position evaluation took ${result.freshUiMs.toFixed(1)} ms (budget ${freshPositionBudgetMs} ms)`);
    console.log(`Explicit Stop: worker canceled after ${stoppedMs.toFixed(1)} ms; analysis restarted successfully.`);
    console.log('Stop immediately after a move: no delayed request restarted the worker.');
    console.log(`Analysis preemption: current-position response ${result.freshResponseMs.toFixed(1)} ms,`
      + ` rendered evaluation ${result.freshUiMs.toFixed(1)} ms, old request canceled ${result.oldCancelMs.toFixed(1)} ms.`);
    console.log(`Analysis responsiveness checks passed. Evidence: ${outputDir}`);
  } catch (error) {
    if (cdp) await screenshot('failure').catch(() => {});
    if (spawnErrors.length) console.error(spawnErrors.join('\n'));
    throw error;
  } finally {
    cdp?.close();
    await stopProcess(chrome);
    await stopProcess(server);
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
