import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evaluate, loadedModuleUrl, navigate, setViewport, waitForExpression } from './browser.mjs';

export async function assertOgsSyncCancellation(cdp, appUrl, screenshotDir) {
  const wait = expression => waitForExpression(cdp, expression, { label: 'OGS sync cancellation' });
  let mobile = false;
  const click = async (selector, text) => {
    const point = await wait(`(() => {
      const e = [...document.querySelectorAll(${JSON.stringify(selector)})]
        .find(e => ${text ? `e.textContent.trim()===${JSON.stringify(text)}` : 'true'});
      if (!e || e.disabled) return false;
      e.scrollIntoView({ block: 'nearest' });
      const r = e.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
      return r.width && e.contains(document.elementFromPoint(x, y)) ? { x, y } : false;
    })()`);
    if (mobile) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      for (const type of ['mousePressed', 'mouseReleased']) {
        await cdp.send('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 });
      }
    }
  };
  const key = async (key, code, windowsVirtualKeyCode, modifiers = 0) => {
    for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode, modifiers });
  };
  const open = async () => {
    await click('[aria-label="More library actions"]');
    await click('[role=menuitem]', 'Sync from OGS');
    await wait('!!document.querySelector("#ogs-sync-username")');
    await click('#ogs-sync-username');
    await key('a', 'KeyA', 65, 2);
    await cdp.send('Input.insertText', { text: 'Alice' });
    await key('Enter', 'Enter', 13);
  };
  const release = async (index, payload, sgf = false) => {
    await evaluate(cdp, `ogsSyncCancelRequests[${index}].resolve(new Response(${JSON.stringify(sgf ? payload : JSON.stringify(payload))})); void 0`);
  };
  const listing = (id, next = null) => ({ results: [{ id, name: 'Sync cancellation study', width: 9, height: 9, ended: '2026-10-25', players: { black: { username: 'Alice' }, white: { username: 'Bob' } } }], next });
  const player = { results: [{ id: 42, username: 'Alice' }] };
  const waitCount = count => wait(`ogsSyncCancelRequests.length===${count}`);
  const reports = [];
  for (const width of [1440, 390]) {
    mobile = width === 390;
    const setup = await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
      performance.setResourceTimingBufferSize(5000);
      localStorage.removeItem('web-katrain:auto_saved_game:v1');
      localStorage.removeItem('web-katrain:ogs_sync_username:v1');
      localStorage.setItem('web-katrain:mobile_home_dismissed:v1', 'true');
      localStorage.setItem('web-katrain:pwa-install-dismissed:v1', 'true');
      localStorage.setItem('web-katrain:library_open:v1', 'true');
    ` });
    try {
      await setViewport(cdp, { width, height: mobile ? 844 : 900, mobile });
      await navigate(cdp, appUrl, 15000, { acceptBeforeUnload: true });
    } finally {
      await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: setup.result.identifier });
    }
    await wait('!!document.querySelector("[data-board-snapshot]")');
    if (mobile) await click('#mobile-tab-library');
    await wait('document.querySelector("[data-library-storage-badge]")?.textContent==="IndexedDB"');
    await evaluate(cdp, `(async () => {
      const url = ${loadedModuleUrl.toString()};
      window.ogsSyncCancelLibrary = await import(url('/src/utils/library.ts'));
      window.ogsSyncCancelOriginalFetch = window.fetch.bind(window);
      window.ogsSyncCancelRequests = [];
      window.fetch = (url, init) => !String(url).includes('online-go.com/')
        ? ogsSyncCancelOriginalFetch(url, init)
        : new Promise((resolve, reject) => ogsSyncCancelRequests.push({ url: String(url), signal: init?.signal, resolve, reject }));
    })()`);
    const baseline = await evaluate(cdp, '(async () => (await ogsSyncCancelLibrary.loadLibrary()).map(item => item.id).sort())()');
    try {
      for (const stage of ['lookup', 'pagination', 'download']) {
        const start = await evaluate(cdp, 'ogsSyncCancelRequests.length');
        await open();
        await waitCount(start + 1);
        let pending = start;
        if (stage !== 'lookup') {
          await release(start, player);
          await waitCount(start + 2);
          pending++;
          if (stage === 'pagination') {
            await release(pending, { results: [], next: 'https://online-go.com/api/v1/players/42/games/?page=2' });
          } else {
            await release(pending, listing(100 + width));
          }
          await waitCount(start + 3);
          pending++;
        }
        if (stage === 'lookup') await click('.ogs-sync-footer button', 'Cancel');
        else if (stage === 'pagination') await click('[aria-label="Close OGS sync"]');
        else if (mobile) await evaluate(cdp, 'history.back()');
        else await key('Escape', 'Escape', 27);
        await wait('!document.querySelector("#ogs-sync-username") && !history.state?.webKatrainOverlay');
        assert.equal(await evaluate(cdp, `ogsSyncCancelRequests[${pending}].signal?.aborted`), true);
        const count = await evaluate(cdp, 'ogsSyncCancelRequests.length');
        if (stage === 'lookup') await release(pending, player);
        else if (stage === 'pagination') await release(pending, listing(200 + width, 'https://online-go.com/api/v1/players/42/games/?page=3'));
        else await release(pending, '(;SZ[9]PB[Alice]PW[Bob];B[dd])', true);
        // The stub deliberately ignores AbortSignal. Give a late response time
        // to attempt pagination/import before verifying that nothing follows.
        await evaluate(cdp, 'new Promise(resolve => setTimeout(resolve, 100))');
        assert.equal(await evaluate(cdp, 'ogsSyncCancelRequests.length'), count, `${stage}: a cancelled sync started another request`);
        assert.deepEqual(await evaluate(cdp, '(async () => (await ogsSyncCancelLibrary.loadLibrary()).map(item => item.id).sort())()'), baseline);
        if (stage === 'lookup') assert.equal(await evaluate(cdp, 'localStorage.getItem("web-katrain:ogs_sync_username:v1")'), null);
        reports.push({ width, stage, aborted: true, laterRequests: 0, importedAfterCancel: 0 });
      }
      const start = await evaluate(cdp, 'ogsSyncCancelRequests.length');
      await open();
      await waitCount(start + 1);
      await release(start, player);
      await waitCount(start + 2);
      const gameId = 60000 + width;
      await release(start + 1, listing(gameId));
      await waitCount(start + 3);
      const sgf = '(;SZ[9]PB[Alice]PW[Bob];B[dd])';
      await release(start + 2, sgf, true);
      await wait("document.querySelector('.ogs-sync-footer')?.textContent.includes('Sync Again')");
      const imported = await wait(`(async () => {
        const file = (await ogsSyncCancelLibrary.loadLibrary()).find(item => item.name.includes('(ogs-${gameId})'));
        return file?.type==='file' ? { name: file.name, sgf: file.sgf } : false;
      })()`);
      assert.equal(imported.sgf, sgf);
      assert.equal(await evaluate(cdp, 'ogsSyncCancelRequests.length'), start + 3);
      assert.equal(await evaluate(cdp, `ogsSyncCancelRequests[${start + 2}].signal.aborted`), false);
      await click('.ogs-sync-footer button', 'Done');
      await wait('!document.querySelector("#ogs-sync-username") && !history.state?.webKatrainOverlay');
      reports.push({ width, retryImported: 1, requests: 3 });
    } finally {
      await evaluate(cdp, 'window.fetch = ogsSyncCancelOriginalFetch; void 0');
    }
  }
  fs.writeFileSync(path.join(screenshotDir, 'ogs-sync-cancellation.json'), JSON.stringify(reports, null, 2));
  console.log('OGS sync: lookup/pagination/download cancellation aborts and ignores late responses; Cancel/Close/Escape/Back and a successful retry passed on desktop/phone.');
}
