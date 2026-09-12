import { spawn } from 'node:child_process';
import fs from 'node:fs';
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
 * A budget for how the app answers a click.
 *
 * The viewport sweep guards where things are; nothing guarded how quickly they
 * respond, and everything below was measured as a real regression at some
 * point:
 *
 *  - Opening any dialog took ~317ms whatever its size, because React.lazy
 *    suspends even when the chunk is already in memory and a committed
 *    fallback is then held. Warming them (src/utils/warmableLazy.ts) took it
 *    to 11-23ms.
 *  - Placing the *first* stone cost 85-100ms of synchronous work, all of it
 *    `new AudioContext()` inside the click. Building it on an idle callback
 *    took the first move to 1.56ms.
 *
 * Budgets sit well above what is measured, so this fails on a regression
 * rather than on a slow machine. The numbers in each comment are what was
 * actually measured on the production preview, for comparison.
 *
 * Production only. Dev timings are not a proxy -- React's dev instrumentation
 * changes them by an order of magnitude -- so this runs `vite preview` against
 * dist/ and refuses to guess if there is no build.
 */
const BUDGETS = {
  firstBoardMoveSyncMs: 25,      // measured 1.56ms; catches the AudioContext stall
  boardMoveMedianSyncMs: 5,      // measured 0.30ms
  warmDialogOpenMs: 120,         // measured 11-23ms; catches the Suspense throttle
  inpP98Ms: 150,                 // measured 40ms desktop; "good" for INP is <=200ms
  worstLongTaskMs: 200,          // measured 0 over the session
};

const failures = [];
const record = (label, value, budget, unit = 'ms') => {
  const ok = value !== null && value <= budget;
  if (!ok) failures.push(`${label}: ${value}${unit} over budget ${budget}${unit}`);
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label.padEnd(28)} ${String(value).padStart(8)}${unit}  (budget ${budget}${unit})`);
};

async function main() {
  const distIndex = path.resolve(import.meta.dirname, '../dist/index.html');
  if (!fs.existsSync(distIndex)) {
    throw new Error(
      'No production build to measure. Run `npm run build` first -- dev timings '
      + 'are not a proxy for these numbers, so this check will not fall back to them.',
    );
  }

  const appPort = await freePort();
  const devtoolsPort = await freePort();
  const server = spawn(path.join('node_modules', '.bin', 'vite'), [
    'preview', '--host', '127.0.0.1', '--port', String(appPort), '--strictPort',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  let chrome;
  try {
    await waitForHttp(`http://127.0.0.1:${appPort}/`);
    const ciChromeFlags = process.env.CI ? ['--no-sandbox', '--disable-dev-shm-usage'] : [];
    chrome = spawn(chromePath, [
      '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      ...ciChromeFlags,
      `--remote-debugging-port=${devtoolsPort}`, '--window-size=1280,900', 'about:blank',
    ], { stdio: ['ignore', 'ignore', 'pipe'] });

    const cdp = connectDevtools(await chromeTarget(devtoolsPort));
    await cdp.ready;
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    // Same knob as VIEWPORT_CPU_THROTTLE in check-viewports.mjs: a CI runner is
    // a slower machine than a developer's, and a budget is only worth having if
    // it holds on one.
    if (process.env.RESPONSIVENESS_CPU_THROTTLE) {
      const rate = Number(process.env.RESPONSIVENESS_CPU_THROTTLE);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate });
      console.log(`CPU throttled ${rate}x`);
    }
    await setViewport(cdp, { width: 1280, height: 800, mobile: false });
    await navigate(cdp, `http://127.0.0.1:${appPort}/`);
    await sleep(2000);
    // A previous run's auto-save would otherwise sit over the app.
    await evaluate(cdp, `(() => {
      const b = Array.from(document.querySelectorAll('button'))
        .find((x) => (x.textContent || '').includes('Discard Auto-Save'));
      if (b) b.click();
      return true;
    })()`);
    // Idle warming has to have run; that is the thing being measured.
    await sleep(4000);

    await evaluate(cdp, `(() => {
      window.__lt = [];
      window.__events = [];
      try {
        new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(e.duration); })
          .observe({ entryTypes: ['longtask'] });
        new PerformanceObserver((l) => {
          for (const e of l.getEntries()) {
            if (e.interactionId > 0) window.__events.push(e.duration);
          }
        }).observe({ type: 'event', durationThreshold: 16, buffered: true });
      } catch {}
      return true;
    })()`);

    console.log('Responsiveness (production preview, 1280x800):');

    // --- Board moves. The first one is measured on its own: a lazily built
    // AudioContext, or anything else constructed inside the handler, shows up
    // there and nowhere else.
    const moves = JSON.parse(await evaluate(cdp, `(async () => {
      const el = document.querySelector('[data-board-snapshot="true"]');
      const size = Number(el.getAttribute('data-board-size'));
      const cell = Number(el.getAttribute('data-board-cell-size'));
      const ox = Number(el.getAttribute('data-board-origin-x'));
      const oy = Number(el.getAttribute('data-board-origin-y'));
      const times = [];
      for (let n = 0; n < 20; n++) {
        const stones = el.getAttribute('data-board-stones') || '';
        const idx = stones.indexOf('.', (n * 7) % stones.length);
        if (idx < 0) break;
        const r = el.getBoundingClientRect();
        const clientX = r.left + ox + (idx % size) * cell;
        const clientY = r.top + oy + Math.floor(idx / size) * cell;
        const o = { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', clientX, clientY, isPrimary: true };
        const t = performance.now();
        el.dispatchEvent(new PointerEvent('pointerdown', o));
        el.dispatchEvent(new PointerEvent('pointerup', o));
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX, clientY }));
        times.push(+(performance.now() - t).toFixed(2));
        await new Promise((res) => setTimeout(res, 40));
      }
      const rest = times.slice(1).sort((a, b) => a - b);
      return JSON.stringify({ first: times[0] ?? null, median: rest[Math.floor(rest.length / 2)] ?? null, count: times.length });
    })()`));
    if (moves.count < 5) failures.push(`only ${moves.count} board moves were played; the board probe is broken`);
    record('first board move (sync)', moves.first, BUDGETS.firstBoardMoveSyncMs);
    record('board move median (sync)', moves.median, BUDGETS.boardMoveMedianSyncMs);

    // --- A dialog that idle warming should already have made ready.
    const dialog = JSON.parse(await evaluate(cdp, `(async () => {
      const lab = (b) => (b.getAttribute('aria-label') || b.title || b.textContent || '').trim();
      const btn = Array.from(document.querySelectorAll('button')).find((b) => lab(b) === 'Settings');
      if (!btn) return JSON.stringify({ ms: null, error: 'no Settings button' });
      const t0 = performance.now();
      btn.click();
      let ms = null, fallbackSeen = false;
      const deadline = performance.now() + 8000;
      while (performance.now() < deadline) {
        await new Promise((res) => requestAnimationFrame(res));
        if (document.querySelector('[data-lazy-modal-loading="true"]')) fallbackSeen = true;
        if (document.querySelector('[aria-label="Close settings"]')) { ms = +(performance.now() - t0).toFixed(1); break; }
      }
      const close = document.querySelector('[aria-label="Close settings"]');
      if (close) close.click();
      await new Promise((res) => setTimeout(res, 400));
      return JSON.stringify({ ms, fallbackSeen });
    })()`));
    if (dialog.error) failures.push(`dialog probe: ${dialog.error}`);
    record('warm dialog open', dialog.ms, BUDGETS.warmDialogOpenMs);
    if (dialog.fallbackSeen) {
      // Not fatal on its own -- the fallback is correct when a chunk really is
      // still coming -- but after idle warming it means warming stopped working.
      failures.push('the loading fallback appeared for a dialog that idle warming should have made ready');
    }

    // --- INP, from trusted input, over a short scripted session.
    const clickAt = async (x, y) => {
      for (const type of ['mousePressed', 'mouseReleased']) {
        await cdp.send('Input.dispatchMouseEvent', {
          type, x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1,
          buttons: type === 'mousePressed' ? 1 : 0,
        });
      }
    };
    for (const label of ['Back', 'Forward', 'To start', 'To end', 'Rotate board', 'Coordinates', 'Territory', 'Pass']) {
      const spot = await evaluate(cdp, `(() => {
        const lab = (b) => (b.getAttribute('aria-label') || b.title || b.textContent || '').trim();
        const b = Array.from(document.querySelectorAll('button')).find((x) => lab(x) === ${JSON.stringify(label)} || lab(x).startsWith(${JSON.stringify(label)}));
        if (!b) return 'null';
        const r = b.getBoundingClientRect();
        return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
      })()`);
      if (spot === 'null') continue;
      const { x, y } = JSON.parse(spot);
      await clickAt(x, y);
      await sleep(240);
    }

    const tail = JSON.parse(await evaluate(cdp, `(() => {
      const durs = (window.__events || []).slice().sort((a, b) => a - b);
      const lt = window.__lt || [];
      return JSON.stringify({
        inp: durs.length ? +durs[Math.max(0, Math.ceil(durs.length * 0.98) - 1)].toFixed(1) : null,
        interactions: durs.length,
        worstLongTask: lt.length ? +Math.max(...lt).toFixed(1) : 0,
      });
    })()`));
    if (tail.interactions < 4) {
      failures.push(`only ${tail.interactions} interactions were recorded; the INP probe is broken`);
    }
    record('INP (p98, trusted input)', tail.inp, BUDGETS.inpP98Ms);
    record('worst long task', tail.worstLongTask, BUDGETS.worstLongTaskMs);

    cdp.close();
    if (failures.length > 0) {
      throw new Error(`${failures.length} responsiveness budget(s) exceeded:\n  - ${failures.join('\n  - ')}`);
    }
    console.log('Responsiveness checks passed.');
  } finally {
    await stopProcess(chrome);
    await stopProcess(server);
  }
}

/**
 * Ends a child and lets node exit.
 *
 * `vite preview` does not always go down on SIGTERM the way the dev server
 * does, and an undrained stdio pipe keeps the event loop alive on its own -- so
 * this printed "Responsiveness checks passed." and then simply sat there, which
 * in CI is a job that never finishes rather than a check that failed.
 */
async function stopProcess(child) {
  if (!child) return;
  for (const stream of [child.stdout, child.stderr]) {
    stream?.removeAllListeners();
    stream?.destroy();
  }
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), 1500);
  await Promise.race([exited, sleep(3000)]);
  clearTimeout(timer);
  child.unref?.();
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
