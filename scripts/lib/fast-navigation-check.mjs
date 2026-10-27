import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evaluate, loadedModuleUrl, navigate, setViewport, waitForExpression } from './browser.mjs';

export async function assertFastNavigation(cdp, appUrl, screenshotDir) {
  const sgf = '(;GM[1]SZ[9]GN[Fast navigation]' + Array.from({ length: 20 }, (_, index) =>
    `;${index % 2 ? 'W' : 'B'}[${String.fromCharCode(97 + index % 9)}${String.fromCharCode(97 + Math.floor(index / 9))}]`
  ).join('') + ')';
  const reports = [];
  let mobile = false;
  const wait = expression => waitForExpression(cdp, expression, {
    label: 'Fast navigation',
    diagnose: `({moves:document.querySelector('[data-board-snapshot]')?.dataset.boardMoveCount,dialog:document.querySelector('[role=dialog]')?.innerText,transitions:window.fastNavigationAudit,focus:document.activeElement?.outerHTML.slice(0,200)})`,
  });
  const click = async (selector, text) => {
    const point = await wait(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>${text ? `e.textContent.trim()===${JSON.stringify(text)}` : 'true'});if(!e||e.disabled)return false;e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return r.width&&e.contains(document.elementFromPoint(x,y))?{x,y}:false})()`);
    if (mobile) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else for (const type of ['mousePressed', 'mouseReleased']) {
      await cdp.send('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 });
    }
  };
  const key = async (key, code, windowsVirtualKeyCode, modifiers = 0) => {
    for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode, modifiers });
  };
  try {
    for (const width of [1440, 390, 320]) {
      mobile = width < 600;
      const setup = await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
        performance.setResourceTimingBufferSize(5000);
        localStorage.removeItem('web-katrain:auto_saved_game:v1');
        localStorage.removeItem('web-katrain:shortcuts:v1');
        localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');
        localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
        localStorage.setItem('web-katrain:library_open:v1','false');
        localStorage.setItem('web-katrain:settings:v3',JSON.stringify({soundEnabled:false,loadSgfFastAnalysis:false,loadSgfRewind:true}));
      ` });
      try {
        await setViewport(cdp, { width, height: mobile ? (width === 320 ? 568 : 844) : 900, mobile });
        await navigate(cdp, appUrl, 15000, { acceptBeforeUnload: true });
      } finally { await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: setup.result.identifier }); }
      await wait('!!document.querySelector("[data-board-snapshot]")');
      await evaluate(cdp, `(async()=>{
        const url=${loadedModuleUrl.toString()};
        window.fastNavigationStore=(await import(url('/src/store/gameStore.ts'))).useGameStore;
        const {parseSgf}=await import(url('/src/utils/sgf.ts'));
        fastNavigationStore.getState().loadGame(parseSgf(${JSON.stringify(sgf)}));
        window.fastNavigationAudit=[];
        window.stopFastNavigationAudit=fastNavigationStore.subscribe((state,previous)=>{
          if(state.currentNode!==previous.currentNode)fastNavigationAudit.push({from:previous.currentNode.id,to:state.currentNode.id,moves:state.moveHistory.length});
        });
      })()`);
      const cases = [];
      for (const entry of ['toolbar', 'keyboard', 'palette']) for (const direction of ['back', 'forward']) {
        await evaluate(cdp, `fastNavigationStore.getState().${direction === 'back' ? 'navigateEnd' : 'navigateStart'}();void 0`);
        await wait(`document.querySelector('[data-board-snapshot]').dataset.boardMoveCount===${JSON.stringify(direction === 'back' ? '20' : '0')}`);
        await evaluate(cdp, 'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>{fastNavigationAudit=[];resolve(true)})))');
        if (entry === 'toolbar') {
          if (mobile) {
            await click('button[aria-label="More controls"]');
            await click('[data-bottom-more-grid] button', direction === 'back' ? 'Back 10 moves' : 'Forward 10 moves');
            await wait('!document.querySelector("[data-bottom-more-sheet]")');
          } else await click(`button[aria-label="${direction === 'back' ? 'Back' : 'Forward'} 10"]`);
        } else if (entry === 'keyboard') {
          const arrow = direction === 'back' ? 'ArrowLeft' : 'ArrowRight';
          await key(arrow, arrow, direction === 'back' ? 37 : 39, 8);
        } else {
          await key('k', 'KeyK', 75, 2);
          await click('[data-command-palette-search]');
          await cdp.send('Input.insertText', { text: direction === 'back' ? 'Back 10 moves' : 'Forward 10 moves' });
          await key('Enter', 'Enter', 13);
          await wait('!document.querySelector("[data-command-palette-search]")');
        }
        await wait('document.querySelector("[data-board-snapshot]").dataset.boardMoveCount==="10"');
        const transitions = await evaluate(cdp, 'fastNavigationAudit');
        assert.equal(transitions.length, 1, `${width}px ${entry} ${direction} must publish one final position`);
        assert.equal(transitions[0].moves, 10);
        cases.push({ entry, direction, positionPublications: transitions.length });
      }
      await evaluate(cdp, 'stopFastNavigationAudit();void 0');
      const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(screenshotDir, `fast-navigation-${width}.png`), Buffer.from(screenshot.result.data, 'base64'));
      reports.push({ width, cases });
      console.log('Fast navigation', JSON.stringify(reports.at(-1)));
    }
    fs.writeFileSync(path.join(screenshotDir, 'fast-navigation.json'), JSON.stringify(reports, null, 2));
  } finally { await evaluate(cdp, 'window.stopFastNavigationAudit?.();void 0').catch(() => undefined); }
}
