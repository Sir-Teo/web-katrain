import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { connectDevtools, evaluate, loadedModuleUrl, navigate, setViewport, waitForExpression } from './browser.mjs';

export async function assertGameInfoReplacement(devtoolsPort, appUrl, runDir, screenshotDir) {
  const version = await (await fetch(`http://127.0.0.1:${devtoolsPort}/json/version`)).json();
  const browser = connectDevtools(version.webSocketDebuggerUrl);
  await browser.ready;
  const filesDir = fs.mkdtempSync(path.join(runDir, 'metadata-replacement-'));
  const filename = path.join(filesDir, 'Imported game.sgf');
  fs.writeFileSync(filename, '(;GM[1]SZ[9]PB[Imported Black]PW[Imported White]GN[Imported game]KM[7.5];B[dd];W[ff])');
  const reports = [];
  try {
    for (const [width, height] of [[1280, 800], [390, 844], [320, 568]]) {
      for (const [label, draft, expected] of [['Black', 'Old unsaved player', 'Imported Black'], ['Komi', '42.5', '7.5'], ['Handicap', '4', '0']]) {
        const context = (await browser.send('Target.createBrowserContext')).result.browserContextId;
        const target = (await browser.send('Target.createTarget', { url: 'about:blank', browserContextId: context })).result.targetId;
        const cdp = connectDevtools(`ws://127.0.0.1:${devtoolsPort}/devtools/page/${target}`);
        await cdp.ready;
        const wait = expression => waitForExpression(cdp, expression, { label: 'Game info replacement', timeoutMs: 15_000 });
        const key = async (key, code, modifiers = 0) => {
          for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', { type, key, windowsVirtualKeyCode: code, modifiers });
        };
        const click = async expression => {
          const point = await wait(`(()=>{const e=${expression};if(!e)return false;e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return r.width&&r.height&&e.contains(document.elementFromPoint(x,y))?{x,y}:false})()`);
          for (const type of ['mousePressed', 'mouseReleased']) await cdp.send('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 });
        };
        const field = `[...document.querySelectorAll('[data-game-info-edit-form] label')].find(e=>e.textContent.trim()===${JSON.stringify(label)})?.querySelector('input')`;
        const replace = async text => {
          await click(field);
          await key('a', 65, 2);
          await cdp.send('Input.insertText', { text });
          await wait(`${field}.value===${JSON.stringify(text)}`);
        };
        const openEditor = async () => {
          if (!await evaluate(cdp, '!!document.querySelector("[data-game-info-edit-form]")')) await click('document.querySelector("[data-game-info-edit-toggle]")');
          await wait('!!document.querySelector("[data-game-info-edit-form]")');
        };
        const dismissNotification = async () => {
          const notice = `document.querySelector('[aria-label="Dismiss notification"]')`;
          if (await evaluate(cdp, `!!${notice}`)) await click(notice);
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
          await setViewport(cdp, { width, height, mobile: width < 1000 });
          await navigate(cdp, appUrl);
          await wait('!!document.querySelector("[data-board-snapshot=true]")');
          await evaluate(cdp, `(async()=>{const url=${loadedModuleUrl.toString()};window.metadataStore=(await import(url('/src/store/gameStore.ts'))).useGameStore;return true})()`);
          if (width < 1000) await click('document.querySelector("#mobile-tab-info")');
          if (!await evaluate(cdp, 'document.querySelector("[data-game-info-panel]")?.getBoundingClientRect().height>0')) await click("[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Game info')");
          await openEditor();
          await replace(draft);
          const previous = await evaluate(cdp, 'metadataStore.getState().rootNode.id');
          const doc = (await cdp.send('DOM.getDocument')).result.root;
          const nodeId = (await cdp.send('DOM.querySelector', { nodeId: doc.nodeId, selector: 'input[type=file][accept^=".sgf"]:not([multiple])' })).result.nodeId;
          const imported = await cdp.send('DOM.setFileInputFiles', { nodeId, files: [filename] });
          assert.ok(!imported.error, JSON.stringify(imported.error));
          await wait(`metadataStore.getState().rootNode.id!==${JSON.stringify(previous)}`);
          await key('Tab', 9);
          await evaluate(cdp, 'new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
          const actual = await evaluate(cdp, `(()=>{const s=metadataStore.getState(),r=s.rootNode;return {black:r.properties.PB?.[0],white:r.properties.PW?.[0],komi:s.komi,handicap:r.properties.HA?.[0]??'0',size:r.gameState.board.length,setupStones:r.gameState.board.flat().filter(Boolean).length,undo:s.editUndoCount,moves:[r.children[0]?.move,r.children[0]?.children[0]?.move]}})()`);
          assert.deepEqual(actual, { black: 'Imported Black', white: 'Imported White', komi: 7.5, handicap: '0', size: 9, setupStones: 0, undo: 0, moves: [{ x: 3, y: 3, player: 'black' }, { x: 5, y: 5, player: 'white' }] }, `${label} draft changed the imported game at ${width}px`);
          await dismissNotification();
          await openEditor();
          assert.equal(await evaluate(cdp, `${field}.value`), expected, `${label} kept its old draft`);
          if (label === 'Black') {
            await replace('Lee Sedol');
            await key('Enter', 13);
            await wait('metadataStore.getState().rootNode.properties.PB?.[0]==="Lee Sedol"');
            assert.equal(await evaluate(cdp, 'metadataStore.getState().editUndoCount'), 1, 'Typing a name produced multiple undo entries');
            await key('z', 90, 2);
            await wait('metadataStore.getState().rootNode.properties.PB?.[0]==="Imported Black"');
            await dismissNotification();
            await replace('Saved on Done');
            await click('document.querySelector("[data-game-info-edit-toggle]")');
            await wait('metadataStore.getState().rootNode.properties.PB?.[0]==="Saved on Done"');
          }
          reports.push({ width, height, field: label, nativeFileImport: true, importedMetadataRetained: true });
          const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
          fs.writeFileSync(path.join(screenshotDir, `${width}x${height}-metadata-${label.toLowerCase()}.png`), Buffer.from(screenshot.result.data, 'base64'));
        } catch (error) {
          const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
          fs.writeFileSync(path.join(screenshotDir, `${width}x${height}-metadata-${label.toLowerCase()}-failed.png`), Buffer.from(screenshot.result.data, 'base64'));
          throw error;
        } finally {
          cdp.close();
          await browser.send('Target.disposeBrowserContext', { browserContextId: context });
        }
      }
    }
    fs.writeFileSync(path.join(screenshotDir, 'game-info-replacement.json'), JSON.stringify(reports, null, 2));
    console.log('Game info: player, komi and handicap drafts stay with their original game through native SGF import; new-game editing and Undo still work.');
  } finally {
    browser.close();
    fs.rmSync(filesDir, { recursive: true, force: true });
  }
}
