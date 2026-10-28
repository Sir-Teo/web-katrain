import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { connectDevtools, evaluate, loadedModuleUrl, navigate, setViewport, waitForExpression } from './browser.mjs';

export async function assertNotePageExit(devtoolsPort, appUrl, runDir, screenshotDir) {
  const version = await (await fetch(`http://127.0.0.1:${devtoolsPort}/json/version`)).json();
  const browser = connectDevtools(version.webSocketDebuggerUrl);
  await browser.ready;
  const filesDir = fs.mkdtempSync(path.join(runDir, 'note-page-exit-'));
  const filename = path.join(filesDir, 'Saved note.sgf');
  fs.writeFileSync(filename, '(;GM[1]SZ[9]KM[7.5]C[Saved baseline])');
  const reports = [];
  try {
    for (const [width, height] of [[1280, 800], [390, 844], [320, 568]]) {
      for (const scenario of ['reload', 'cancel', 'hidden']) {
        const mobile = width < 1000;
        const context = (await browser.send('Target.createBrowserContext')).result.browserContextId;
        const target = (await browser.send('Target.createTarget', { url: 'about:blank', browserContextId: context })).result.targetId;
        const cdp = connectDevtools(`ws://127.0.0.1:${devtoolsPort}/devtools/page/${target}`);
        await cdp.ready;
        const dialogs = [];
        const unsubscribe = cdp.on(message => {
          if (message.method === 'Page.javascriptDialogOpening') dialogs.push(message.params.type);
        });
        const wait = expression => waitForExpression(cdp, expression, { label: 'Note page exit', timeoutMs: 15_000 });
        const key = async (key, code, modifiers = 0) => {
          for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', { type, key, windowsVirtualKeyCode: code, modifiers });
        };
        const click = async expression => {
          const point = await wait(`(async()=>{const e=${expression};if(!e)return false;e.scrollIntoView({block:'nearest'});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));if(!e.isConnected)return false;const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return !e.disabled&&r.width&&r.height&&e.contains(document.elementFromPoint(x,y))?{x,y}:false})()`);
          if (mobile) {
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          } else {
            for (const type of ['mousePressed', 'mouseReleased']) await cdp.send('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 });
          }
        };
        const attachStore = async () => {
          await wait('!!document.querySelector("[data-board-snapshot=true]")');
          await evaluate(cdp, `(async()=>{const url=${loadedModuleUrl.toString()};window.noteExitStore=(await import(url('/src/store/gameStore.ts'))).useGameStore;return true})()`);
        };
        const openNotes = async () => {
          const notice = `document.querySelector('[aria-label="Dismiss notification"]')`;
          if (await evaluate(cdp, `!!${notice}`)) await click(notice);
          if (mobile) await click('document.querySelector("#mobile-tab-info")');
          const comment = `[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Comment')`;
          if (await evaluate(cdp, `${comment}?.getAttribute('aria-expanded')!=='true'`)) await click(comment);
          await wait('document.querySelector("[data-note-preview]")?.getBoundingClientRect().height>0');
        };
        const edit = async text => {
          await openNotes();
          await click('document.querySelector("[data-note-preview]")');
          await wait('document.querySelector("[data-note-editor]")===document.activeElement');
          if (text !== undefined) {
            await key('a', 65, 2);
            if (text) await cdp.send('Input.insertText', { text });
            else await key('Backspace', 8);
            await wait(`document.querySelector('[data-note-editor]').value===${JSON.stringify(text)}`);
          }
        };
        const snapshot = 'JSON.parse(localStorage.getItem("web-katrain:auto_saved_game:v1")??"null")?.sgf';
        const restore = async expected => {
          await wait('!!document.querySelector("#auto-save-recovery-title")');
          await click(`[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Restore Game')`);
          await wait('!document.querySelector("#auto-save-recovery-title")');
          await attachStore();
          assert.equal(await evaluate(cdp, 'noteExitStore.getState().rootNode.note??""'), expected, 'Recovered note differs from the latest draft');
          assert.equal(await evaluate(cdp, 'noteExitStore.getState().board.length'), 9, 'Recovery changed the board size');
          assert.equal(await evaluate(cdp, 'noteExitStore.getState().moveHistory.length'), 0, 'Recovery added a game move');
        };
        try {
          await cdp.send('Page.enable');
          await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
          await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
            performance.setResourceTimingBufferSize(5000);
            localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');
            localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
            localStorage.setItem('web-katrain:settings:v3',JSON.stringify({soundEnabled:false,loadSgfFastAnalysis:false}));
          ` });
          await setViewport(cdp, { width, height, mobile });
          await navigate(cdp, appUrl);
          await attachStore();
          const previous = await evaluate(cdp, 'noteExitStore.getState().rootNode.id');
          const doc = (await cdp.send('DOM.getDocument')).result.root;
          const nodeId = (await cdp.send('DOM.querySelector', { nodeId: doc.nodeId, selector: 'input[type=file][accept^=".sgf"]:not([multiple])' })).result.nodeId;
          await cdp.send('DOM.setFileInputFiles', { nodeId, files: [filename] });
          await wait(`noteExitStore.getState().rootNode.id!==${JSON.stringify(previous)}`);
          // The clean version's debounce must have run before the draft is
          // committed in capture phase; this exercises revision-based writes.
          await evaluate(cdp, 'new Promise(r=>setTimeout(r,650))');
          assert.equal(await evaluate(cdp, snapshot), undefined);
          if (scenario === 'reload') {
            await edit('First unfinished thought');
            let blocked = false;
            try { await navigate(cdp, appUrl); } catch { blocked = true; }
            assert.equal(blocked, true, 'A dirty note did not protect the page with beforeunload');
            assert.deepEqual(dialogs, ['beforeunload']);
            assert.equal(await evaluate(cdp, 'noteExitStore.getState().rootNode.note'), 'First unfinished thought');
            assert.equal(await evaluate(cdp, 'noteExitStore.getState().editUndoCount'), 1);
            await wait(`(${snapshot})?.includes('First unfinished thought')`);
            const latest = 'Latest thought before leaving — 厚み';
            await edit(latest);
            await navigate(cdp, appUrl, 15_000, { acceptBeforeUnload: true });
            await wait(`(${snapshot})?.includes(${JSON.stringify(latest)})`);
            await restore(latest);
            assert.deepEqual(dialogs, ['beforeunload', 'beforeunload']);
          } else if (scenario === 'cancel') {
            await edit('Discard this unfinished thought');
            await key('Escape', 27);
            await navigate(cdp, appUrl);
            await attachStore();
            assert.equal(await evaluate(cdp, snapshot), undefined, 'Cancel created a recovery copy');
            await edit();
            await navigate(cdp, appUrl);
            await attachStore();
            assert.equal(await evaluate(cdp, snapshot), undefined, 'An untouched editor created recovery');
            assert.deepEqual(dialogs, [], 'Cancel or an untouched editor triggered an exit warning');
          } else {
            await edit('Rapid background draft');
            const hidden = await evaluate(cdp, `(()=>{
              const original=Storage.prototype.setItem;window.noteExitWrites=0;
              Storage.prototype.setItem=function(k,v){if(k==='web-katrain:auto_saved_game:v1')noteExitWrites++;return original.call(this,k,v)};
              Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});
              document.dispatchEvent(new Event('visibilitychange'));
              window.dispatchEvent(new Event('pagehide'));
              document.dispatchEvent(new Event('visibilitychange'));
              const result={note:noteExitStore.getState().currentNode.note,sgf:${snapshot},writes:noteExitWrites};
              delete document.visibilityState;document.dispatchEvent(new Event('visibilitychange'));
              Storage.prototype.setItem=original;return result;
            })()`);
            assert.equal(hidden.note, 'Rapid background draft');
            assert.ok(hidden.sgf?.includes('Rapid background draft'), 'Hide did not synchronously write the pending note');
            assert.equal(hidden.writes, 1, 'Repeated hide events rewrote the same revision');
            await edit('');
            const deleted = await evaluate(cdp, `(()=>{window.dispatchEvent(new Event('pagehide'));return {note:noteExitStore.getState().currentNode.note,sgf:${snapshot}}})()`);
            assert.equal(deleted.note, '');
            assert.ok(deleted.sgf && !deleted.sgf.includes('Rapid background draft') && !deleted.sgf.includes('Saved baseline'), 'Deleting a note retained its old SGF comment');
            await navigate(cdp, appUrl, 15_000, { acceptBeforeUnload: true });
            await restore('');
          }
          reports.push({ width, height, scenario, dialogs: [...dialogs], latestDraftRetained: true });
          const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
          fs.writeFileSync(path.join(screenshotDir, `${width}x${height}-note-exit-${scenario}.png`), Buffer.from(screenshot.result.data, 'base64'));
        } catch (error) {
          const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
          fs.writeFileSync(path.join(screenshotDir, `${width}x${height}-note-exit-${scenario}-failed.png`), Buffer.from(screenshot.result.data, 'base64'));
          throw error;
        } finally {
          unsubscribe();
          cdp.close();
          await browser.send('Target.disposeBrowserContext', { browserContextId: context });
        }
      }
    }
    fs.writeFileSync(path.join(screenshotDir, 'note-page-exit.json'), JSON.stringify(reports, null, 2));
    console.log('Note page exit: native reload protection and latest-draft recovery, clean cancellation, immediate hide snapshots and comment deletion passed on desktop and phones.');
  } finally {
    browser.close();
    fs.rmSync(filesDir, { recursive: true, force: true });
  }
}
