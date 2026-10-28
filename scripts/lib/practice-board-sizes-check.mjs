import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { connectDevtools, evaluate, loadedModuleUrl, navigate, setViewport, sleep, waitForExpression } from './browser.mjs';

// Select sizes through the real control, then use trusted pointer/key input to
// start, play (including phone tap confirmation), analyze, save and reopen them.
export async function assertPracticeBoardSizes(devtoolsPort, appUrl, runDir, screenshotDir) {
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
      const mobile = width < 1000;
      const wait = expression => waitForExpression(cdp, expression, { label: 'Practice board size', timeoutMs: 30_000 });
      const key = async (key, code, modifiers = 0) => {
        for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', { type, key, windowsVirtualKeyCode: code, modifiers });
      };
      const press = async point => {
        if (mobile) {
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        } else {
          for (const type of ['mousePressed', 'mouseReleased']) await cdp.send('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 });
        }
      };
      const click = async expression => {
        const point = await wait(`(()=>{
          const e=${expression};if(!e)return false;e.scrollIntoView({block:'nearest'});
          const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
          return !e.disabled&&r.width&&r.height&&e.contains(document.elementFromPoint(x,y))?{x,y}:false;
        })()`);
        await press(point);
      };
      const palette = async command => {
        await key('k', 75, 2);
        await click(`document.querySelector(${JSON.stringify(`[data-command-palette-item="${command}"]`)})`);
        await wait('!document.querySelector("[data-command-palette]")');
      };
      let size;
      try {
        await cdp.send('Page.enable');
        await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
        await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
          performance.setResourceTimingBufferSize(5000);
          localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');
          localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
          if(!localStorage.getItem('web-katrain:settings:v3')) localStorage.setItem('web-katrain:settings:v3',JSON.stringify({soundEnabled:false,loadSgfFastAnalysis:false,katagoBackend:'wasm',katagoVisits:16,katagoMaxTimeMs:5000}));
        ` });
        await setViewport(cdp, { width, height, mobile });
        await navigate(cdp, appUrl);
        await wait('!!document.querySelector("[data-board-snapshot=true]")');
        await evaluate(cdp, `(async()=>{const url=${loadedModuleUrl.toString()};window.practiceSizeStore=(await import(url('/src/store/gameStore.ts'))).useGameStore;return true})()`);
        for (size of [5, 7, 11, 15, 17]) {
          await key('n', 78, 2);
          await wait('!!document.querySelector("#new-game-board-size")');
          const options = await evaluate(cdp, '[...document.querySelector("#new-game-board-size").options].map(o=>Number(o.value))');
          assert.deepEqual(options, [5, 7, 9, 11, 13, 15, 17, 19]);
          await evaluate(cdp, `(()=>{const s=document.querySelector('#new-game-board-size');s.value='${size}';s.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
          await click(`[...document.querySelectorAll('.new-game-modal-footer button')].find(b=>b.textContent.trim()==='Start')`);
          await wait(`!document.querySelector('#new-game-title')&&Number(document.querySelector('[data-board-snapshot=true]')?.dataset.boardSize)===${size}`);
          const point = await wait(`(()=>{
            const b=document.querySelector('[data-board-snapshot=true]');if(!b)return false;const r=b.getBoundingClientRect(),c=Number(b.dataset.boardCellSize);
            const x=r.x+Number(b.dataset.boardOriginX)+${size - 1}*c,y=r.y+Number(b.dataset.boardOriginY)+${size - 1}*c;
            return b.contains(document.elementFromPoint(x,y))?{x,y}:false;
          })()`);
          await press(point);
          if (mobile) {
            await wait('!!document.querySelector("[data-tap-confirm]")');
            await press(point);
          }
          await wait(`practiceSizeStore.getState().board[${size - 1}][${size - 1}]==='black'`);
          await palette('toggle-analysis');
          await wait(`(()=>{const a=practiceSizeStore.getState().analysisData;return a?.policy?.length===${size * size + 1}&&(a.rootVisits??0)>=16})()`);
          const analysis = await evaluate(cdp, `(()=>{const s=practiceSizeStore.getState(),a=s.analysisData;return {backend:s.engineBackend,policy:a.policy.length,ownershipRows:a.territory.length,score:a.rootScoreLead,visits:a.rootVisits,moves:a.moves.map(m=>[m.x,m.y])}})()`);
          assert.equal(analysis.ownershipRows, size);
          assert.ok(Number.isFinite(analysis.score));
          assert.ok(analysis.moves.every(([x, y]) => x < size && y < size && x >= -1 && y >= -1));
          await palette('toggle-analysis');
          const downloadDir = fs.mkdtempSync(path.join(runDir, `${width}x${height}-board-${size}-`));
          const enabled = await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir });
          assert.ok(!enabled.error, JSON.stringify(enabled.error));
          await key('s', 83, 2);
          let downloaded;
          for (let i = 0; i < 100 && !downloaded; i++) {
            downloaded = fs.readdirSync(downloadDir).find(file => file.endsWith('.sgf'));
            if (!downloaded) await sleep(100);
          }
          assert.ok(downloaded, 'Native SGF download did not complete');
          const filename = path.join(downloadDir, downloaded);
          const saved = fs.readFileSync(filename, 'utf8');
          assert.ok(saved.includes(`SZ[${size}]`));
          const root = (await cdp.send('DOM.getDocument')).result.root;
          const input = (await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[type=file][accept^=".sgf"]:not([multiple])' })).result.nodeId;
          const beforeRoot = await evaluate(cdp, 'practiceSizeStore.getState().rootNode.id');
          const imported = await cdp.send('DOM.setFileInputFiles', { nodeId: input, files: [filename] });
          assert.ok(!imported.error, JSON.stringify(imported.error));
          await wait(`practiceSizeStore.getState().rootNode.id!==${JSON.stringify(beforeRoot)}`);
          await key('End', 35);
          await wait(`practiceSizeStore.getState().board.length===${size}&&practiceSizeStore.getState().board[${size - 1}][${size - 1}]==='black'`);
          const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
          fs.writeFileSync(path.join(screenshotDir, `${width}x${height}-board-${size}.png`), Buffer.from(screenshot.result.data, 'base64'));
          reports.push({ width, height, size, ...analysis, savedBytes: Buffer.byteLength(saved) });
        }
        await palette('settings-general');
        await click(`document.querySelector('[aria-label="Search settings"]')`);
        await cdp.send('Input.insertText', { text: '5x5' });
        await click(`document.querySelector('#settings-search-result-0')`);
        await wait('document.activeElement?.id==="settings-default-board-size"');
        await evaluate(cdp, `(()=>{const s=document.querySelector('#settings-default-board-size');s.value='5';s.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
        await wait('practiceSizeStore.getState().settings.defaultBoardSize===5');
        assert.equal(await evaluate(cdp, 'practiceSizeStore.getState().board.length'), 17, 'Changing a default replaced the live game');
        await key('Escape', 27);
        await wait('!document.querySelector("#settings-title")');
        // This private fixture intentionally discards its imported game. A
        // native touch activates the unsaved-game beforeunload confirmation.
        await navigate(cdp, appUrl, 15_000, { acceptBeforeUnload: true });
        await wait('Number(document.querySelector("[data-board-snapshot=true]")?.dataset.boardSize)===5');
      } catch (error) {
        const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(screenshotDir, `${width}x${height}-board-${size}-failed.png`), Buffer.from(screenshot.result.data, 'base64'));
        throw error;
      } finally {
        cdp.close();
        await browser.send('Target.disposeBrowserContext', { browserContextId: context });
      }
    }
    fs.writeFileSync(path.join(screenshotDir, 'practice-board-sizes.json'), JSON.stringify(reports, null, 2));
    console.log('Practice boards: 5, 7, 11, 15 and 17 lines support create, corner play, real WASM analysis, SGF download and file re-import on desktop and phones.');
  } finally {
    browser.close();
  }
}
