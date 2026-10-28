import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { connectDevtools, evaluate, loadedModuleUrl, navigate, setViewport, waitForExpression } from './browser.mjs';

export async function assertSearchPasteLimits(devtoolsPort, appUrl, screenshotDir) {
  const version = await (await fetch(`http://127.0.0.1:${devtoolsPort}/json/version`)).json();
  const browser = connectDevtools(version.webSocketDebuggerUrl);
  await browser.ready;
  const reports = [];
  const dialogs = [
    { id: 'palette', label: 'Search commands', close: 'Close command palette', query: 'sgf' },
    { id: 'keyboard-help', label: 'Search shortcuts', close: 'Close keyboard shortcuts', query: 'undo' },
    { id: 'settings', label: 'Search settings', close: 'Close settings', query: 'visits' },
    { id: 'pro-games', label: 'Search pro games', close: 'Close pro game library', query: 'Lee' },
    { id: 'find-notes', label: 'Search game notes', close: 'Close find notes', query: 'baseline' },
  ];
  try {
    for (const [width, height] of [[1280, 800], [390, 844], [320, 568]]) {
      const mobile = width < 1000;
      const context = (await browser.send('Target.createBrowserContext')).result.browserContextId;
      const target = (await browser.send('Target.createTarget', { url: 'about:blank', browserContextId: context })).result.targetId;
      const cdp = connectDevtools(`ws://127.0.0.1:${devtoolsPort}/devtools/page/${target}`);
      await cdp.ready;
      const wait = expression => waitForExpression(cdp, expression, { label: 'Search paste limit', timeoutMs: 15_000 });
      const key = async (key, code, modifiers = 0) => {
        for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', { type, key, windowsVirtualKeyCode: code, modifiers });
      };
      const click = async expression => {
        const point = await wait(`(async()=>{const e=${expression};if(!e)return false;e.scrollIntoView({block:'nearest'});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));if(!e.isConnected)return false;const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return !e.disabled&&r.width&&r.height&&e.contains(document.elementFromPoint(x,y))?{x,y}:false})()`);
        if (mobile) {
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        } else for (const type of ['mousePressed', 'mouseReleased']) await cdp.send('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 });
      };
      const snapshot = () => evaluate(cdp, `(()=>{const s=searchPasteStore.getState();return {root:s.rootNode.id,note:s.rootNode.note,version:s.treeVersion,size:s.board.length,moves:s.moveHistory.length}})()`);
      let activeDialog = 'startup';
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
        const limit = await evaluate(cdp, `(async()=>{const url=${loadedModuleUrl.toString()};window.searchPasteStore=(await import(url('/src/store/gameStore.ts'))).useGameStore;const {parseSgf}=await import(url('/src/utils/sgf.ts'));searchPasteStore.getState().loadGame(parseSgf('(;GM[1]SZ[9]C[Recorded baseline note])'));return (await import(url('/src/utils/searchTerms.ts'))).MAX_SEARCH_QUERY_LENGTH})()`);
        const before = await snapshot();
        for (const dialog of dialogs) {
          activeDialog = dialog.id;
          await key('k', 75, 2);
          await wait('!!document.querySelector("[data-command-palette-search]")');
          if (dialog.id !== 'palette') await click(`document.querySelector('[data-command-palette-item="${dialog.id}"]')`);
          const input = `document.querySelector('[aria-label="${dialog.label}"]')`;
          await click(input);
          await cdp.send('Input.insertText', { text: 'z'.repeat(10_000) });
          await wait(`!!document.querySelector('[role=dialog] [data-search-empty]')`);
          const actual = await evaluate(cdp, `(()=>{const e=${input},d=e.closest('[role=dialog]'),n=d.querySelector('[data-search-empty]');return {length:e.value.length,maxLength:e.maxLength,errorLength:n.textContent.length,scrollWidth:n.scrollWidth,width:n.clientWidth,dialogWidth:d.clientWidth,dialogScrollWidth:d.scrollWidth,wrap:getComputedStyle(n).overflowWrap}})()`);
          assert.equal(actual.maxLength, limit, `${dialog.id} does not cap native input`);
          assert.equal(actual.length, limit, `${dialog.id} accepted the full pasted record`);
          assert.ok(actual.errorLength <= limit + 64, `${dialog.id} rendered the full pasted query`);
          assert.equal(actual.wrap, 'anywhere');
          assert.ok(actual.scrollWidth <= actual.width + 1, `${dialog.id} empty message overflows horizontally`);
          assert.ok(actual.dialogScrollWidth <= actual.dialogWidth + 1, `${dialog.id} dialog overflows horizontally`);
          reports.push({ width, height, dialog: dialog.id, ...actual });
          const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
          fs.writeFileSync(path.join(screenshotDir, `${width}x${height}-search-paste-${dialog.id}.png`), Buffer.from(screenshot.result.data, 'base64'));
          await key('a', 65, 2);
          await cdp.send('Input.insertText', { text: dialog.query });
          await wait(`${input}?.value===${JSON.stringify(dialog.query)}&&!document.querySelector('[role=dialog] [data-search-empty]')`);
          await click(`document.querySelector('[aria-label="${dialog.close}"]')`);
          await wait('!document.querySelector("[role=dialog]")&&!history.state?.webKatrainOverlay');
          assert.deepEqual(await snapshot(), before, 'Searching changed the current game');
        }
      } catch (error) {
        const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(screenshotDir, `${width}x${height}-search-paste-${activeDialog}-failed.png`), Buffer.from(screenshot.result.data, 'base64'));
        throw error;
      } finally {
        cdp.close();
        await browser.send('Target.disposeBrowserContext', { browserContextId: context });
      }
    }
    fs.writeFileSync(path.join(screenshotDir, 'search-paste.json'), JSON.stringify(reports, null, 2));
    console.log('Search paste: five dialogs cap a 10,000-character native paste, wrap empty messages, recover ordinary results and leave the game unchanged on desktop and phones.');
  } finally {
    browser.close();
  }
}
