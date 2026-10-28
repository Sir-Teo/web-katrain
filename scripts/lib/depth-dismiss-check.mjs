import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { connectDevtools, evaluate, loadedModuleUrl, navigate, setViewport, waitForExpression } from './browser.mjs';

export async function assertDepthDismissal(devtoolsPort, appUrl, screenshotDir) {
  const version = await (await fetch(`http://127.0.0.1:${devtoolsPort}/json/version`)).json();
  const browser = connectDevtools(version.webSocketDebuggerUrl);
  await browser.ready;
  const reports = [];
  try {
    for (const [width, height] of [[390, 844], [320, 568], [768, 1024]]) {
      const context = (await browser.send('Target.createBrowserContext')).result.browserContextId;
      const target = (await browser.send('Target.createTarget', { url: 'about:blank', browserContextId: context })).result.targetId;
      const cdp = connectDevtools(`ws://127.0.0.1:${devtoolsPort}/devtools/page/${target}`);
      await cdp.ready;
      const wait = expression => waitForExpression(cdp, expression, { label: 'Depth dismissal', timeoutMs: 15_000 });
      const key = async (key, code, modifiers = 0) => {
        for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', { type, key, windowsVirtualKeyCode: code, modifiers, ...(type === 'keyDown' && key === 'Enter' ? { text: '\r' } : {}) });
      };
      const click = async expression => {
        // Keep the full control inside the scrollport while the enlarged dock
        // settles. A nearest-edge position can be clipped before the tap lands.
        const point = await wait(`(async()=>{const e=${expression};if(!e)return false;e.scrollIntoView({block:'center',inline:'nearest'});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));if(!e.isConnected)return false;const r=e.getBoundingClientRect(),p=e.closest('[data-analysis-live-depth-popover]')?.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;if(p&&(r.top<p.top+1||r.bottom>p.bottom-1))return false;return !e.disabled&&r.width&&r.height&&e.contains(document.elementFromPoint(x,y))?{x,y}:false})()`);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      };
      const trigger = 'document.querySelector("[data-analysis-live-depth=true]")';
      const input = `document.querySelector('input[aria-label="Exact live analysis visits"]')`;
      const close = `document.querySelector('button[aria-label="Close live depth selector"]')`;
      const edit = async text => {
        await click(trigger);
        await wait(`${close}===document.activeElement`);
        await click(input);
        await wait(`${input}===document.activeElement`);
        await key('a', 65, 2);
        if (text) await cdp.send('Input.insertText', { text });
        else await key('Backspace', 8);
        await wait(`${input}.value===${JSON.stringify(text)}`);
      };
      const check = async (action, visits) => {
        await wait(`depthDismissStore.getState().settings.katagoVisits===${visits}`);
        await wait(`JSON.parse(localStorage.getItem('web-katrain:settings:v3')).katagoVisits===${visits}`);
        assert.equal(await evaluate(cdp, 'depthDismissStore.getState().isAnalysisMode'), false, 'Editing depth restarted stopped analysis');
        reports.push({ width, height, action, visits, persisted: true });
      };
      const outside = () => click('document.querySelector("#mobile-tab-board")');
      const closed = () => wait('!document.querySelector("[data-analysis-live-depth-popover]")');
      const checkLayout = async () => {
        const box = await evaluate(cdp, `(()=>{const e=document.querySelector('[data-analysis-live-depth-popover]'),r=e.getBoundingClientRect(),s=e.querySelector('.analysis-command-bar__depth-scale').getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,viewport:innerHeight,dockTop:document.querySelector('.mobile-bottom-dock').getBoundingClientRect().top,scrolls:e.scrollHeight>e.clientHeight+1,gap:r.bottom-s.bottom,padding:Number.parseFloat(getComputedStyle(e).paddingBottom)}})()`);
        assert.ok(box.left >= 0 && box.right <= width + 1 && box.top >= 0 && box.bottom <= box.viewport + 1, 'Depth selector escapes the viewport');
        assert.ok(box.bottom <= box.dockTop + 1, 'Bottom controls cover the depth selector');
        if (!box.scrolls) assert.ok(box.gap <= box.padding + 2, `Depth selector retains ${Math.round(box.gap - box.padding)}px of blank space`);
      };
      try {
        await cdp.send('Page.enable');
        await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
        await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
          performance.setResourceTimingBufferSize(5000);
          localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');
          localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
          localStorage.setItem('web-katrain:ui_state:v1',JSON.stringify({mode:'analyze'}));
          localStorage.setItem('web-katrain:settings:v3',JSON.stringify({soundEnabled:false,defaultBoardSize:9,katagoVisits:16,katagoMaxTimeMs:500}));
        ` });
        await setViewport(cdp, { width, height, mobile: true });
        await navigate(cdp, appUrl);
        await wait('!!document.querySelector("[data-board-snapshot=true]")');
        await evaluate(cdp, `(async()=>{const url=${loadedModuleUrl.toString()};window.depthDismissStore=(await import(url('/src/store/gameStore.ts'))).useGameStore;return true})()`);
        // Saved Review mode exposes depth configuration before analysis starts.
        await wait('!depthDismissStore.getState().isAnalysisMode');
        const rootId = await evaluate(cdp, 'depthDismissStore.getState().rootNode.id');

        await edit('37');
        await checkLayout();
        await outside();
        await closed();
        await check('outside', 37);
        await edit('55');
        await key('Escape', 27);
        await closed();
        await wait(`${trigger}===document.activeElement`);
        await check('Escape cancels', 37);
        await edit('63');
        await key('Enter', 13);
        await check('Enter', 63);
        await click(close);
        await closed();
        await edit('79');
        await key('Tab', 9);
        await check('Tab', 79);
        await click(close);
        await closed();
        await edit('101');
        await click(close);
        await closed();
        await check('close button', 101);
        await edit('137');
        await click(`document.querySelector('[data-analysis-live-depth-option="250"]')`);
        await check('preset overrides draft', 250);
        await outside();
        await closed();
        await check('outside retains preset', 250);
        await edit('');
        await outside();
        await closed();
        await check('empty retains current depth', 250);

        await click(trigger);
        await wait(`${close}===document.activeElement`);
        await evaluate(cdp, 'document.documentElement.style.fontSize="200%";new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
        await checkLayout();
        await click(input);
        await wait(`${input}===document.activeElement`);
        await key('a', 65, 2);
        await cdp.send('Input.insertText', { text: '251' });
        await wait(`${input}.value==='251'`);
        await outside();
        await closed();
        await check('large text outside', 251);
        await evaluate(cdp, 'document.documentElement.style.fontSize=""');
        await click(trigger);
        await checkLayout();

        assert.equal(await evaluate(cdp, 'depthDismissStore.getState().rootNode.id'), rootId);
        assert.equal(await evaluate(cdp, 'depthDismissStore.getState().board.length'), 9);
        assert.equal(await evaluate(cdp, 'depthDismissStore.getState().moveHistory.length'), 0);
        const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(screenshotDir, `${width}x${height}-depth-dismiss.png`), Buffer.from(screenshot.result.data, 'base64'));
      } catch (error) {
        const state = await evaluate(cdp, `({width:innerWidth,height:innerHeight,active:document.activeElement?.getAttribute('aria-label')||document.activeElement?.tagName,inputValue:${input}?.value,popoverOpen:!!document.querySelector('[data-analysis-live-depth-popover]'),visits:window.depthDismissStore?.getState().settings.katagoVisits})`);
        console.error('Depth dismissal failure state:', JSON.stringify(state));
        const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(screenshotDir, `${width}x${height}-depth-dismiss-failed.png`), Buffer.from(screenshot.result.data, 'base64'));
        throw error;
      } finally {
        cdp.close();
        await browser.send('Target.disposeBrowserContext', { browserContextId: context });
      }
    }
    fs.writeFileSync(path.join(screenshotDir, 'depth-dismiss.json'), JSON.stringify(reports, null, 2));
    console.log('Analysis depth: touch dismissal preserves exact visits, Escape cancels, other commit paths agree, and compact selectors stay reachable at 100% and 200% text on phones and tablet.');
  } finally {
    browser.close();
  }
}
