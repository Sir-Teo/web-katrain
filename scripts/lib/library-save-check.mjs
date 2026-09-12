import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { connectDevtools, evaluate, navigate, setViewport, sleep } from './browser.mjs';

const recoveryKey = 'web-katrain:auto_saved_game:v1';
const textDialog = '[aria-labelledby="library-text-dialog-title"]';
const recoveryDialog = '[aria-labelledby="auto-save-recovery-title"]';

// Inject failures only after the fixture has loaded. Other localStorage keys,
// including recovery data, remain writable. Delayed opens let a real board
// edit overtake a pending save without mocking the app's callbacks.
const installStorageControls = `(()=>{
  const open=indexedDB.open.bind(indexedDB),setItem=Storage.prototype.setItem;
  window.librarySaveAudit={mode:'normal',failed:0,held:[],open};
  indexedDB.open=(...args)=>{
    if(librarySaveAudit.mode==='fail'){librarySaveAudit.failed++;throw new DOMException('Test write failure','QuotaExceededError')}
    const request=open(...args);
    if(librarySaveAudit.mode==='delay'){
      Object.defineProperty(request,'onsuccess',{set(fn){
        request.addEventListener('success',event=>librarySaveAudit.held.push(()=>fn.call(request,event)),{once:true});
      }});
    }
    return request;
  };
  Storage.prototype.setItem=function(key,value){
    if(key==='web-katrain:library:v1'&&librarySaveAudit.mode==='fail'){
      librarySaveAudit.failed++;throw new DOMException('Test write failure','QuotaExceededError');
    }
    return setItem.call(this,key,value);
  };
  return true;
})()`;
const storedItems = `new Promise((resolve,reject)=>{
  const open=librarySaveAudit.open('web-katrain-library');open.onerror=()=>reject(open.error);
  open.onsuccess=()=>{const db=open.result,request=db.transaction('items','readonly').objectStore('items').getAll();
    request.onsuccess=()=>{db.close();resolve(request.result)};
    request.onerror=()=>{db.close();reject(request.error)};
  };
})`;

export async function assertLibrarySaveRecovery(devtoolsPort, appUrl, runDir, screenshotDir) {
  const version = await (await fetch(`http://127.0.0.1:${devtoolsPort}/json/version`)).json();
  const browser = connectDevtools(version.webSocketDebuggerUrl);
  await browser.ready;
  const reports = [], failures = [];
  const scenarios = [
    ...[1280, 390, 320].flatMap(width => ['save', 'update'].map(action => ({ width, action, mode: 'fail' }))),
    ...['save', 'update'].map(action => ({ width: 1280, action, mode: 'delay' })),
  ];
  try {
    for (const scenario of scenarios) {
      const { width, action, mode } = scenario, mobile = width < 1000, height = width === 320 ? 568 : mobile ? 844 : 800;
      const context = (await browser.send('Target.createBrowserContext')).result.browserContextId;
      const target = (await browser.send('Target.createTarget', { url: 'about:blank', browserContextId: context })).result.targetId;
      const cdp = connectDevtools(`ws://127.0.0.1:${devtoolsPort}/devtools/page/${target}`);
      await cdp.ready;
      const stem = `${width}x${height}-library-${action}-${mode}`, report = { ...scenario, stages: [] }, errors = [];
      const wait = async expression => {
        for (let i = 0; i < 150; i++) {
          const value = await evaluate(cdp, expression);
          if (value) return value;
          await sleep(100);
        }
        throw Error(`Library save check timed out: ${expression}`);
      };
      const point = expression => wait(`(()=>{
        const e=${expression};if(!e)return false;e.scrollIntoView({block:'nearest'});
        const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
        return r.width&&r.height&&!e.disabled&&!e.closest('[inert]')&&e.contains(document.elementFromPoint(x,y))?{x,y}:false;
      })()`);
      const dispatch = async (point, right = false) => {
        if (mobile && !right) {
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        } else for (const type of ['mousePressed', 'mouseReleased']) {
          await cdp.send('Input.dispatchMouseEvent', { type, ...point, button: right ? 'right' : 'left', clickCount: 1 });
        }
      };
      const clickElement = async expression => dispatch(await point(expression));
      const click = selector => clickElement(`document.querySelector(${JSON.stringify(selector)})`);
      const openLibrary = async () => {
        if (mobile) await click('#mobile-tab-library');
        await wait(`document.querySelector('[data-library-storage-badge=true]')?.textContent==='IndexedDB'`);
      };
      const boardSnapshot = () => evaluate(cdp, `({...document.querySelector('[data-board-snapshot=true]').dataset})`);
      const recovery = () => evaluate(cdp, `JSON.parse(localStorage.getItem(${JSON.stringify(recoveryKey)}))`);
      const play = async coordinate => {
        const before = await boardSnapshot();
        const p = await point(`document.querySelector('[data-board-snapshot=true]')`);
        Object.assign(p, await evaluate(cdp, `(()=>{
          const b=document.querySelector('[data-board-snapshot=true]'),r=b.getBoundingClientRect();
          return {x:r.x+Number(b.dataset.boardOriginX)+${coordinate}*Number(b.dataset.boardCellSize),
            y:r.y+Number(b.dataset.boardOriginY)+${coordinate}*Number(b.dataset.boardCellSize)};
        })()`));
        assert.ok(await evaluate(cdp, `document.querySelector('[data-board-snapshot=true]').contains(document.elementFromPoint(${p.x},${p.y}))`));
        await dispatch(p);
        // The phone board previews the first tap and confirms the second.
        if (mobile) { await sleep(100); await dispatch(p); }
        await wait(`document.querySelector('[data-board-snapshot=true]').dataset.boardStones!==${JSON.stringify(before.boardStones)}`);
        await wait(`!!localStorage.getItem(${JSON.stringify(recoveryKey)})`);
      };
      const beginSave = async () => {
        if (action === 'save') {
          await click('button[aria-label="Save current game to Library"]');
          await wait(`document.activeElement===document.querySelector('${textDialog} input')`);
          await cdp.send('Input.insertText', { text: 'Unsaved study' });
        }
        await evaluate(cdp, `librarySaveAudit.mode=${JSON.stringify(mode)}`);
        if (action === 'save') await clickElement(`[...document.querySelectorAll('${textDialog} button')].find(e=>e.textContent.trim()==='Save')`);
        else await click('button[aria-label="Update loaded library game"]');
      };
      const saveFailure = async expectedRecovery => {
        await wait('librarySaveAudit.failed>=2');
        await wait(`document.querySelector('[data-library-storage-badge=true]')?.textContent==='Error'`);
        assert.deepEqual(await recovery(), expectedRecovery, 'A rejected save must retain the recovery copy');
        assert.ok(await evaluate(cdp, `document.body.innerText.includes('Could not save the game to Library')`));
        assert.ok(!await evaluate(cdp, `document.body.innerText.includes('Success: Saved "Unsaved study"')||document.body.innerText.includes('Success: Updated "Saved study"')`));
        await point(`[...document.querySelectorAll('button')].find(e=>e.textContent==='Retry saving library')`);
      };
      try {
        await cdp.send('Runtime.enable');
        cdp.on(message => {
          if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
        });
        await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
          localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');
          localStorage.setItem('web-katrain:library_open:v1','true');
          localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
          localStorage.setItem('web-katrain:settings:v3',JSON.stringify({soundEnabled:false,loadSgfFastAnalysis:false}));
        ` });
        await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
        await setViewport(cdp, { width, height, mobile });
        await navigate(cdp, appUrl);
        await wait(`!!document.querySelector('[data-board-snapshot=true]')`);
        await openLibrary();
        if (action === 'update') {
          const sgf = '(;GM[1]SZ[9]C[Original study]AB[dd])';
          const file = path.join(runDir, `${stem}.json`);
          fs.writeFileSync(file, JSON.stringify({ app: 'web-katrain', version: 2, items: [{
            id: 'original', name: 'Saved study', type: 'file', parentId: null, sgf,
            size: sgf.length, moveCount: 0, metadata: { boardSize: 9 }, createdAt: 1, updatedAt: 1,
          }] }));
          const root = (await cdp.send('DOM.getDocument')).result.root;
          const nodeId = (await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[type=file][accept=".json,application/json"]' })).result.nodeId;
          const imported = await cdp.send('DOM.setFileInputFiles', { nodeId, files: [file] });
          assert.ok(!imported.error, JSON.stringify(imported.error));
          await wait(`!!document.querySelector('[data-library-row-name="Saved study"]')`);
          await wait(`document.querySelector('[data-library-storage-badge=true]')?.textContent==='IndexedDB'`);
          if (mobile) await click('button[aria-label="More actions for Saved study"]');
          else await dispatch(await point(`document.querySelector('[data-library-row-name="Saved study"]')`), true);
          await clickElement(`[...document.querySelectorAll('[role=menu][aria-label="Library actions"] [role=menuitem]')].find(e=>e.textContent.trim()==='Load')`);
          await wait(`document.querySelector('[data-board-snapshot=true]').dataset.boardSize==='9'`);
        } else if (mobile) await click('#mobile-tab-board');
        await play(4);
        const firstRecovery = await recovery();
        await openLibrary();
        await evaluate(cdp, installStorageControls);
        const originalItems = await evaluate(cdp, storedItems);
        await beginSave();
        if (mode === 'delay') {
          await wait('librarySaveAudit.held.length>0');
          assert.deepEqual(await recovery(), firstRecovery, 'A pending save must retain recovery data');
          await play(5);
          await wait(`JSON.parse(localStorage.getItem(${JSON.stringify(recoveryKey)}))?.sgf!==${JSON.stringify(firstRecovery.sgf)}`);
          const latestRecovery = await recovery();
          await evaluate(cdp, `(()=>{librarySaveAudit.mode='normal';const held=librarySaveAudit.held.splice(0);held.forEach(release=>release());return held.length})()`);
          await wait(`document.querySelector('[data-library-storage-badge=true]')?.textContent==='IndexedDB'`);
          const saved = await evaluate(cdp, storedItems);
          assert.ok(saved.some(item => item.sgf === firstRecovery.sgf));
          assert.deepEqual(await recovery(), latestRecovery, 'Completing an older save must retain newer edits');
          report.stages.push('Delayed save persisted its snapshot and kept recovery for a newer move');
        } else {
          await saveFailure(firstRecovery);
          assert.deepEqual(await evaluate(cdp, storedItems), originalItems, 'A failed save must not change persisted records');
          report.stages.push('Rejected save kept all stored records and recovery data');
          const failureScreenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
          fs.writeFileSync(path.join(screenshotDir, `${stem}-error.png`), Buffer.from(failureScreenshot.result.data, 'base64'));
          await evaluate(cdp, `librarySaveAudit.mode='normal'`);
          await clickElement(`[...document.querySelectorAll('button')].find(e=>e.textContent==='Retry saving library')`);
          await wait(`document.querySelector('[data-library-storage-badge=true]')?.textContent==='IndexedDB'`);
          await wait(`!localStorage.getItem(${JSON.stringify(recoveryKey)})`);
          const saved = await evaluate(cdp, storedItems);
          const savedGame = saved.find(item => item.sgf === firstRecovery.sgf);
          assert.ok(savedGame, 'Retry must persist the exact requested game');
          assert.ok(await evaluate(cdp, `!!document.querySelector('button[aria-label="Update loaded library game"]')`));
          report.stages.push('Retry persisted the game before clearing recovery and marking it saved');
          if (mobile) await click('#mobile-tab-board');
          await play(5);
          const latestBoard = await boardSnapshot(), latestRecovery = await recovery();
          await openLibrary();
          // Reopening the phone panel replaces the module's guarded callbacks,
          // but the page-level storage controls remain installed.
          await evaluate(cdp, `librarySaveAudit.mode='fail';librarySaveAudit.failed=0`);
          await click('button[aria-label="Update loaded library game"]');
          await saveFailure(latestRecovery);
          assert.deepEqual(await evaluate(cdp, storedItems), saved);
          await navigate(cdp, appUrl, 15000, { acceptBeforeUnload: true });
          await wait(`!!document.querySelector('${recoveryDialog}')`);
          assert.equal((await recovery())?.sgf, latestRecovery.sgf);
          await clickElement(`[...document.querySelectorAll('${recoveryDialog} button')].find(e=>e.textContent.trim()==='Restore Game')`);
          await wait(`!document.querySelector('${recoveryDialog}')`);
          const restored = await boardSnapshot();
          for (const key of ['boardSize', 'boardStones', 'boardMoveCount', 'boardCurrentPlayer']) {
            assert.equal(restored[key], latestBoard[key], `Recovery must restore ${key}`);
          }
          report.stages.push('A second rejected update survived reload and restored the complete board');
        }
        assert.deepEqual(errors, []);
        assert.ok(await evaluate(cdp, 'document.documentElement.scrollWidth<=innerWidth+1'));
        console.log(`Library ${action} at ${width}x${height} (${mode}): ${report.stages.join('; ')}.`);
      } catch (error) {
        report.error = error.message;
        failures.push(`${stem}: ${error.message}`);
      } finally {
        const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(screenshotDir, `${stem}.png`), Buffer.from(screenshot.result.data, 'base64'));
        reports.push(report);
        fs.writeFileSync(path.join(screenshotDir, 'library-save-recovery.json'), JSON.stringify(reports, null, 2));
        cdp.close();
        await browser.send('Target.disposeBrowserContext', { browserContextId: context });
      }
    }
    assert.deepEqual(failures, [], 'Library saves must acknowledge persisted data and preserve unsaved recovery');
  } finally {
    browser.close();
  }
}
