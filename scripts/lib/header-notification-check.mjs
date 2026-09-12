import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { connectDevtools, evaluate, navigate, setViewport, sleep } from './browser.mjs';

// A long status toast can expand the dashboard's implicit grid column even
// while the document reports zero overflow. Check the actual panel bounds
// after native import and the second pass, with the whole message retained.
export async function assertHeaderNotificationsFit(devtoolsPort, appUrl, runDir, screenshotDir) {
  const version = await (await fetch(`http://127.0.0.1:${devtoolsPort}/json/version`)).json();
  const browser = connectDevtools(version.webSocketDebuggerUrl);
  await browser.ready;
  let cdp;
  const preload = `
    localStorage.removeItem('web-katrain:auto_saved_game:v1');
    localStorage.setItem('web-katrain:mobile_home_dismissed:v1', 'true');
    localStorage.setItem('web-katrain:library_open:v1', 'false');
    localStorage.setItem('web-katrain:sidebar_open:v1', 'true');
    localStorage.setItem('web-katrain:pwa-install-dismissed:v1', 'true');
    localStorage.setItem('web-katrain:settings:v3', JSON.stringify({soundEnabled:false, loadSgfFastAnalysis:false}));
  `;
  const wait = async expression => {
    for (let i = 0; i < 100; i++) {
      const value = await evaluate(cdp, expression);
      if (value) return value;
      await sleep(100);
    }
    throw new Error(`Header notification check timed out: ${expression}`);
  };
  const click = async selector => {
    const point = await wait(`(()=>{
      const e=document.querySelector(${JSON.stringify(selector)});if(!e)return false;
      const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
      return !e.disabled&&r.height&&e.contains(document.elementFromPoint(x,y))?{x,y}:false;
    })()`);
    for (const type of ['mousePressed', 'mouseReleased']) {
      await cdp.send('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 });
    }
  };
  const snapshot = () => evaluate(cdp, `(()=>{
    const box=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,width:r.width,height:r.height}};
    const message=document.querySelector('.notification-toast-message');
    return {
      layout:[...document.querySelectorAll('.wk-dashboard>.header,.wk-dashboard>.body,.wk-dashboard .sidebar')].map(e=>({name:e.className,...box(e)})),
      board:box(document.querySelector('[data-board-snapshot=true]')),
      inaccessibleHeaderControls:[...document.querySelectorAll('.wk-dashboard>.header button')].filter(e=>{
        const r=e.getBoundingClientRect();if(!r.width||!r.height)return false;
        return r.left<0||r.right>innerWidth+1||!e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));
      }).map(e=>e.getAttribute('aria-label')||e.title||e.textContent.trim()),
      message:message?.title,
      live:document.querySelector('[data-notification=true]')?.getAttribute('role'),
    };
  })()`);
  const reports = [];
  const failures = [];
  try {
    for (const [width, height] of [[1024, 768], [1280, 800], [1440, 900]]) {
      const context = (await browser.send('Target.createBrowserContext')).result.browserContextId;
      const target = (await browser.send('Target.createTarget', { url: 'about:blank', browserContextId: context })).result.targetId;
      cdp = connectDevtools(`ws://127.0.0.1:${devtoolsPort}/devtools/page/${target}`);
      await cdp.ready;
      try {
        await cdp.send('Runtime.enable');
        await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
        await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: preload });
        const stem = `${width}x${height}-header-notification`;
        await setViewport(cdp, { width, height, mobile: false });
        await navigate(cdp, appUrl);
        await wait('!!document.querySelector(".wk-dashboard button.pass-btn")');
        const importPath = path.join(runDir, `${stem}.sgf`);
        fs.writeFileSync(importPath, '(;GM[1]SZ[9]PL[W];W[])');
        const root = (await cdp.send('DOM.getDocument')).result.root;
        const nodeId = (await cdp.send('DOM.querySelector', {
          nodeId: root.nodeId, selector: 'input[type=file][accept^=".sgf"]:not([multiple])',
        })).result.nodeId;
        assert.ok(nodeId, 'Native SGF file input missing');
        const imported = await cdp.send('DOM.setFileInputFiles', { nodeId, files: [importPath] });
        assert.ok(!imported.error, JSON.stringify(imported.error));
        await wait(`document.querySelector('.notification-toast-message')?.title.includes(${JSON.stringify(stem)})`);
        await click('button[aria-label="Dismiss notification"]');
        for (const type of ['keyDown', 'keyUp']) {
          await cdp.send('Input.dispatchKeyEvent', { type, key: 'End', windowsVirtualKeyCode: 35 });
        }
        await sleep(250);
        const before = await snapshot();
        await click('button.pass-btn');
        await wait('document.querySelector(".notification-toast-message")?.title.startsWith("Both players passed")');
        await sleep(250);
        const during = await snapshot();
        const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(screenshotDir, `${stem}.png`), Buffer.from(screenshot.result.data, 'base64'));
        await click('button[aria-label="Dismiss notification"]');
        await sleep(250);
        const after = await snapshot();
        reports.push({ width, height, before, during, after });
        try {
          assert.equal(during.message, 'Both players passed, so the game is over. Choose Score to count the territory.');
          assert.equal(during.live, 'status');
          for (const state of [before, during, after]) {
            assert.equal(state.layout.length, 3, 'Header, body and sidebar must be present');
            for (const panel of state.layout) {
              assert.ok(panel.width > 0 && panel.left >= -1 && panel.right <= width + 1,
                `${panel.name} escapes the viewport: ${JSON.stringify(panel)}`);
            }
            assert.deepEqual(state.inaccessibleHeaderControls, [], 'Header controls must remain reachable');
            for (const key of ['left', 'top', 'width', 'height']) {
              assert.ok(Math.abs(state.board[key] - before.board[key]) <= 1, `Notification moved or resized the board (${key})`);
            }
          }
        } catch (error) {
          failures.push(`${stem}: ${error.message}`);
        }
      } finally {
        cdp.close();
        await browser.send('Target.disposeBrowserContext', { browserContextId: context });
      }
    }
    fs.writeFileSync(path.join(screenshotDir, 'header-notifications.json'), JSON.stringify(reports, null, 2));
    assert.deepEqual(failures, [], 'Long notifications must preserve the desktop layout');
    console.log('Header notifications at 1024, 1280 and 1440: panel bounds, reachable controls, and stable board passed.');
  } finally {
    browser.close();
  }
}
