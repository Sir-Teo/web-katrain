import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { connectDevtools, evaluate, loadedModuleUrl, navigate, setViewport, waitForExpression } from './browser.mjs';

export async function assertNoteDraftRetention(devtoolsPort, appUrl, screenshotDir) {
  const version = await (await fetch(`http://127.0.0.1:${devtoolsPort}/json/version`)).json();
  const browser = connectDevtools(version.webSocketDebuggerUrl);
  await browser.ready;
  const reports = [];
  try {
    for (const [width, height] of [[1280, 800], [390, 844], [320, 568]]) {
      const context = (await browser.send('Target.createBrowserContext')).result.browserContextId;
      const target = (await browser.send('Target.createTarget', { url: 'about:blank', browserContextId: context })).result.targetId;
      const cdp = connectDevtools(`ws://127.0.0.1:${devtoolsPort}/devtools/page/${target}`);
      await cdp.ready;
      let mobile = width < 1000;
      const wait = expression => waitForExpression(cdp, expression, { label: 'Note draft retention', timeoutMs: 15_000 });
      const comment = `[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Comment')`;
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
      const dismiss = async () => {
        const notice = `document.querySelector('[aria-label="Dismiss notification"]')`;
        if (await evaluate(cdp, `!!${notice}`)) await click(notice);
      };
      const openComment = async () => {
        if (mobile) await click('document.querySelector("#mobile-tab-info")');
        if (await evaluate(cdp, `${comment}?.getAttribute('aria-expanded')!=='true'`)) await click(comment);
        await wait('document.querySelector("[data-note-preview],[data-note-editor]")?.getBoundingClientRect().height>0');
      };
      const fixture = async () => {
        await evaluate(cdp, `(()=>{noteRetentionStore.getState().loadGame(noteRetentionParse('(;GM[1]SZ[9]C[Original note];B[dd]C[Child note])'));return true})()`);
        await openComment();
      };
      const edit = async text => {
        await dismiss();
        await click('document.querySelector("[data-note-preview]")');
        await wait('document.querySelector("[data-note-editor]")===document.activeElement');
        if (text !== undefined) {
          await key('a', 65, 2);
          if (text) await cdp.send('Input.insertText', { text });
          else await key('Backspace', 8);
          await wait(`document.querySelector('[data-note-editor]').value===${JSON.stringify(text)}`);
        }
      };
      const note = () => evaluate(cdp, 'noteRetentionStore.getState().currentNode.note');
      const undoCount = () => evaluate(cdp, 'noteRetentionStore.getState().editUndoCount');
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
        await wait('!!document.querySelector("[data-board-snapshot=true]")');
        await evaluate(cdp, `(async()=>{const url=${loadedModuleUrl.toString()};window.noteRetentionStore=(await import(url('/src/store/gameStore.ts'))).useGameStore;window.noteRetentionParse=(await import(url('/src/utils/sgf.ts'))).parseSgf;return true})()`);
        await fixture();
        await edit('Unfinished thought');
        await click(comment);
        if (!mobile) {
          // Desktop collapse hides the mounted editor. Crossing the responsive
          // boundary must preserve it when the old shell actually unmounts.
          await setViewport(cdp, { width: 390, height: 844, mobile: true });
          mobile = true;
          await wait('!!document.querySelector("#mobile-tab-info")');
        }
        await wait('noteRetentionStore.getState().currentNode.note==="Unfinished thought"');
        assert.equal(await undoCount(), 1);
        await openComment();
        await key('z', 90, 2);
        await wait('noteRetentionStore.getState().currentNode.note==="Original note"');
        await dismiss();
        await key('z', 90, 10);
        await wait('noteRetentionStore.getState().currentNode.note==="Unfinished thought"');
        await dismiss();
        await edit('Cancel this draft');
        await key('Escape', 27);
        await click(comment);
        await openComment();
        assert.equal(await note(), 'Unfinished thought', 'Cancel was saved during panel cleanup');
        assert.equal(await undoCount(), 1);
        await edit('');
        await click(comment);
        await wait('noteRetentionStore.getState().currentNode.note===""');
        assert.equal(await undoCount(), 2, 'An empty draft was lost or saved more than once');
        await key('z', 90, 2);
        await wait('noteRetentionStore.getState().currentNode.note==="Unfinished thought"');
        await dismiss();
        await fixture();
        await edit();
        await click(comment);
        assert.equal(await note(), 'Original note');
        assert.equal(await undoCount(), 0, 'An untouched editor created an undo entry');
        await fixture();
        await edit('Old game draft');
        await evaluate(cdp, `(()=>{noteRetentionStore.getState().loadGame(noteRetentionParse('(;GM[1]SZ[9]C[Replacement note])'));return true})()`);
        await wait('!!document.querySelector("[data-note-preview]")');
        await click(comment);
        assert.equal(await note(), 'Replacement note', 'Old draft leaked into the replacement game');
        assert.equal(await undoCount(), 0);
        await fixture();
        await edit('Root thought retained');
        await evaluate(cdp, `(()=>{const b=${comment};b.addEventListener('click',()=>noteRetentionStore.getState().navigateForward(),{once:true});return true})()`);
        await click(comment);
        await wait('noteRetentionStore.getState().moveHistory.length===1');
        assert.deepEqual(await evaluate(cdp, `(()=>{const s=noteRetentionStore.getState();return {root:s.rootNode.note,child:s.currentNode.note,undo:s.editUndoCount}})()`), { root: 'Root thought retained', child: 'Child note', undo: 1 }, 'Navigation and collapse reassigned the editor draft');
        await openComment();
        await wait('document.querySelector("[data-note-preview]")?.textContent.includes("Child note")');
        await key('z', 90, 2);
        await wait('noteRetentionStore.getState().rootNode.note==="Original note"');
        assert.equal(await note(), 'Child note');
        assert.equal(await evaluate(cdp, 'noteRetentionStore.getState().moveHistory.length'), 1);
        await dismiss();
        await fixture();
        await edit('Explicitly saved');
        await click('document.querySelector("[data-note-save]")');
        await click(comment);
        assert.equal(await note(), 'Explicitly saved');
        assert.equal(await undoCount(), 1, 'Save and collapse duplicated the edit');
        await openComment();
        reports.push({ width, height, responsiveHandoff: width >= 1000, collapse: true, undoRedo: true, cancel: true, emptyDeletion: true, unchanged: true, gameReplacement: true, concurrentNavigation: true, explicitSave: true });
        const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(screenshotDir, `${width}x${height}-note-retention.png`), Buffer.from(screenshot.result.data, 'base64'));
      } catch (error) {
        const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(screenshotDir, `${width}x${height}-note-retention-failed.png`), Buffer.from(screenshot.result.data, 'base64'));
        throw error;
      } finally {
        cdp.close();
        await browser.send('Target.disposeBrowserContext', { browserContextId: context });
      }
    }
    fs.writeFileSync(path.join(screenshotDir, 'note-draft-retention.json'), JSON.stringify(reports, null, 2));
    console.log('Note drafts: collapse, responsive shell changes, Undo/Redo, Cancel, deletion, game replacement and concurrent navigation preserve the correct position.');
  } finally {
    browser.close();
  }
}
