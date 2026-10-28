import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { connectDevtools, evaluate, loadedModuleUrl, navigate, setViewport, waitForExpression } from './browser.mjs';

export async function assertGameInfoPageExit(devtoolsPort, appUrl, runDir, screenshotDir) {
  const version = await (await fetch(`http://127.0.0.1:${devtoolsPort}/json/version`)).json();
  const browser = connectDevtools(version.webSocketDebuggerUrl);
  await browser.ready;
  const filesDir = fs.mkdtempSync(path.join(runDir, 'metadata-page-exit-'));
  const filename = path.join(filesDir, 'Saved metadata.sgf');
  fs.writeFileSync(filename, '(;GM[1]SZ[9]KM[6.5]PB[Original Black]PW[Original White]C[Original note])');
  const reports = [];
  try {
    for (const [width, height] of [[1280, 800], [390, 844], [320, 568]]) {
      for (const scenario of ['Black', 'Komi', 'Handicap', 'cancel', 'invalid', 'combined']) {
        const mobile = width < 1000;
        const context = (await browser.send('Target.createBrowserContext')).result.browserContextId;
        const target = (await browser.send('Target.createTarget', { url: 'about:blank', browserContextId: context })).result.targetId;
        const cdp = connectDevtools(`ws://127.0.0.1:${devtoolsPort}/devtools/page/${target}`);
        await cdp.ready;
        const dialogs = [];
        const unsubscribe = cdp.on(message => {
          if (message.method === 'Page.javascriptDialogOpening') dialogs.push(message.params.type);
        });
        const wait = expression => waitForExpression(cdp, expression, { label: 'Game info page exit', timeoutMs: 15_000 });
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
          await evaluate(cdp, `(async()=>{const url=${loadedModuleUrl.toString()};window.infoExitStore=(await import(url('/src/store/gameStore.ts'))).useGameStore;return true})()`);
        };
        const review = async () => {
          const notice = `document.querySelector('[aria-label="Dismiss notification"]')`;
          if (await evaluate(cdp, `!!${notice}`)) await click(notice);
          if (mobile) await click('document.querySelector("#mobile-tab-info")');
        };
        const openEditor = async () => {
          await review();
          if (!await evaluate(cdp, 'document.querySelector("[data-game-info-panel]")?.getBoundingClientRect().height>0')) await click("[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Game info')");
          if (!await evaluate(cdp, '!!document.querySelector("[data-game-info-edit-form]")')) await click('document.querySelector("[data-game-info-edit-toggle]")');
          await wait('!!document.querySelector("[data-game-info-edit-form]")');
        };
        const field = label => `[...document.querySelectorAll('[data-game-info-edit-form] label')].find(e=>e.textContent.trim()===${JSON.stringify(label)})?.querySelector('input')`;
        const edit = async (label, text) => {
          await openEditor();
          await click(field(label));
          if (text !== undefined) {
            await key('a', 65, 2);
            if (text) await cdp.send('Input.insertText', { text });
            else await key('Backspace', 8);
            await wait(`${field(label)}.value===${JSON.stringify(text)}`);
          }
        };
        const metadata = () => evaluate(cdp, `(()=>{const s=infoExitStore.getState(),r=s.rootNode;return {black:r.properties.PB?.[0]??'',white:r.properties.PW?.[0]??'',komi:s.komi,handicap:Number(r.properties.HA?.[0]??0),stones:r.gameState.board.flat().filter(v=>v==='black').length,note:r.note??'',size:s.board.length,ply:s.moveHistory.length}})()`);
        const assertValue = (actual, label, value) => {
          if (label === 'Black') assert.equal(actual.black, value);
          if (label === 'Komi') assert.equal(actual.komi, Number(value));
          if (label === 'Handicap') {
            assert.equal(actual.handicap, Number(value));
            assert.equal(actual.stones, Number(value), 'Recovered handicap has the wrong setup stones');
          }
          assert.equal(actual.white, 'Original White');
          assert.equal(actual.size, 9);
          assert.equal(actual.ply, 0);
        };
        const snapshot = 'JSON.parse(localStorage.getItem("web-katrain:auto_saved_game:v1")??"null")?.sgf';
        const restore = async () => {
          await wait('!!document.querySelector("#auto-save-recovery-title")');
          await click(`[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Restore Game')`);
          await wait('!document.querySelector("#auto-save-recovery-title")');
          await attachStore();
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
          const previous = await evaluate(cdp, 'infoExitStore.getState().rootNode.id');
          const doc = (await cdp.send('DOM.getDocument')).result.root;
          const nodeId = (await cdp.send('DOM.querySelector', { nodeId: doc.nodeId, selector: 'input[type=file][accept^=".sgf"]:not([multiple])' })).result.nodeId;
          await cdp.send('DOM.setFileInputFiles', { nodeId, files: [filename] });
          await wait(`infoExitStore.getState().rootNode.id!==${JSON.stringify(previous)}`);
          await evaluate(cdp, 'new Promise(r=>setTimeout(r,650))');
          if (['Black', 'Komi', 'Handicap'].includes(scenario)) {
            const [first, latest] = scenario === 'Black' ? ['', 'Latest player — 林'] : scenario === 'Komi' ? ['12.5', '17.5'] : ['4', '2'];
            await edit(scenario, first);
            let blocked = false;
            try { await navigate(cdp, appUrl); } catch { blocked = true; }
            assert.equal(blocked, true, `${scenario} did not protect its unfinished edit`);
            assert.deepEqual(dialogs, ['beforeunload']);
            assertValue(await metadata(), scenario, first);
            assert.equal(await evaluate(cdp, 'infoExitStore.getState().editUndoCount'), 1);
            await wait(`!!(${snapshot})`);
            await edit(scenario, latest);
            await navigate(cdp, appUrl, 15_000, { acceptBeforeUnload: true });
            await restore();
            assertValue(await metadata(), scenario, latest);
            assert.deepEqual(dialogs, ['beforeunload', 'beforeunload']);
          } else if (scenario === 'cancel') {
            for (const [label, value] of [['Black', 'Discard this'], ['Komi', '12.5'], ['Handicap', '4']]) {
              await edit(label, value);
              await key('Escape', 27);
            }
            assert.equal(await evaluate(cdp, 'infoExitStore.getState().editUndoCount'), 0);
            await navigate(cdp, appUrl);
            await attachStore();
            assert.equal(await evaluate(cdp, snapshot), undefined);
            await edit('Black');
            await navigate(cdp, appUrl);
            await attachStore();
            assert.equal(await evaluate(cdp, snapshot), undefined);
            assert.deepEqual(dialogs, []);
          } else if (scenario === 'invalid') {
            await edit('Komi', '-');
            await edit('Handicap', '2abc');
            assert.equal(await evaluate(cdp, 'infoExitStore.getState().editUndoCount'), 0);
            await navigate(cdp, appUrl);
            await attachStore();
            assert.equal(await evaluate(cdp, snapshot), undefined, 'Invalid numeric input created recovery');
            assert.deepEqual(dialogs, []);
          } else {
            await review();
            const comment = `[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Comment')`;
            if (await evaluate(cdp, `${comment}?.getAttribute('aria-expanded')!=='true'`)) await click(comment);
            await click('document.querySelector("[data-note-preview]")');
            await wait('document.querySelector("[data-note-editor]")===document.activeElement');
            await key('a', 65, 2);
            await cdp.send('Input.insertText', { text: 'Combined unfinished note' });
            await edit('Black', 'Combined player');
            await navigate(cdp, appUrl, 15_000, { acceptBeforeUnload: true });
            await restore();
            const actual = await metadata();
            assertValue(actual, 'Black', 'Combined player');
            assert.equal(actual.note, 'Combined unfinished note', 'One editor overwrote another editor’s recovery data');
            assert.deepEqual(dialogs, ['beforeunload']);
          }
          reports.push({ width, height, scenario, dialogs: [...dialogs], recovery: true });
          const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
          fs.writeFileSync(path.join(screenshotDir, `${width}x${height}-info-exit-${scenario.toLowerCase()}.png`), Buffer.from(screenshot.result.data, 'base64'));
        } catch (error) {
          const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
          fs.writeFileSync(path.join(screenshotDir, `${width}x${height}-info-exit-${scenario.toLowerCase()}-failed.png`), Buffer.from(screenshot.result.data, 'base64'));
          throw error;
        } finally {
          unsubscribe();
          cdp.close();
          await browser.send('Target.disposeBrowserContext', { browserContextId: context });
        }
      }
    }
    fs.writeFileSync(path.join(screenshotDir, 'game-info-page-exit.json'), JSON.stringify(reports, null, 2));
    console.log('Game info page exit: latest names, komi and handicap recover; Cancel, invalid and untouched inputs stay clean; note and metadata recovery coexist on desktop and phones.');
  } finally {
    browser.close();
    fs.rmSync(filesDir, { recursive: true, force: true });
  }
}
