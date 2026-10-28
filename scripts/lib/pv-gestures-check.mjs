import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { connectDevtools, evaluate, loadedModuleUrl, navigate, setViewport, waitForExpression } from './browser.mjs';

export async function assertPvGestures(devtoolsPort, appUrl, screenshotDir) {
  const version = await (await fetch(`http://127.0.0.1:${devtoolsPort}/json/version`)).json();
  const browser = connectDevtools(version.webSocketDebuggerUrl);
  await browser.ready;
  const reports = [];
  try {
    for (const [width, height, fontSize = 16] of [[1280, 800], [390, 844], [568, 320], [568, 320, 20]]) {
      const caseName = `${width}x${height}${fontSize === 16 ? '' : `-font-${fontSize}`}`;
      const context = (await browser.send('Target.createBrowserContext')).result.browserContextId;
      const target = (await browser.send('Target.createTarget', { url: 'about:blank', browserContextId: context })).result.targetId;
      const cdp = connectDevtools(`ws://127.0.0.1:${devtoolsPort}/devtools/page/${target}`);
      await cdp.ready;
      const wait = expression => waitForExpression(cdp, expression, { label: 'Candidate variation gesture', timeoutMs: 15_000 });
      const count = 'Number(document.querySelector("[data-board-snapshot=true]").dataset.pvCount)';
      let point;
      const wheel = async (deltaY, expected, modifiers = 0) => {
        await evaluate(cdp, 'new Promise(r=>setTimeout(r,75))');
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', ...point, deltaX: 0, deltaY, modifiers });
        await wait(`${count}===${expected}`);
        assert.equal(await evaluate(cdp, 'pvGestureStore.getState().moveHistory.length'), 0, 'Reading a continuation navigated the game');
      };
      const key = async (key, code, modifiers = 0) => {
        for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', { type, key, windowsVirtualKeyCode: code, modifiers });
      };
      const middleClick = async () => {
        for (const type of ['mousePressed', 'mouseReleased']) await cdp.send('Input.dispatchMouseEvent', { type, ...point, button: 'middle', clickCount: 1 });
      };
      const treeCount = `(()=>{let n=0,stack=[pvGestureStore.getState().rootNode];while(stack.length){const x=stack.pop();n++;stack.push(...x.children)}return n})()`;
      try {
        await cdp.send('Page.enable');
        await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
        await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
          performance.setResourceTimingBufferSize(5000);
          localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');
          localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
          localStorage.setItem('web-katrain:settings:v3',JSON.stringify({soundEnabled:false,loadSgfFastAnalysis:false,analysisExperience:'pro',animPvTimeSeconds:0.1}));
        ` });
        await setViewport(cdp, { width, height, mobile: width < 1000 });
        await navigate(cdp, appUrl);
        await wait('!!document.querySelector("[data-board-snapshot=true]")');
        if (fontSize !== 16) await evaluate(cdp, `(()=>{document.documentElement.style.fontSize='${fontSize}px';return true})()`);
        await evaluate(cdp, `(async()=>{
          const url=${loadedModuleUrl.toString()};window.pvGestureStore=(await import(url('/src/store/gameStore.ts'))).useGameStore;
          pvGestureStore.getState().playMove(3,3,true);pvGestureStore.getState().navigateStart();
          const s=pvGestureStore.getState();const a={rootWinRate:0.55,rootScoreLead:1,rootVisits:100,moves:[
            {x:9,y:9,order:0,winRate:0.55,scoreLead:1,pointsLost:0,visits:70,scoreStdev:5,relativePointsLost:0,winRateLost:0.05,lcb:0.45,prior:0.1,humanPrior:0.2,pv:['K10','D16','Q4','Q16','D4','C3','R17','C17']}
          ],territory:Array.from({length:19},()=>Array(19).fill(0))};
          s.currentNode.analysis=a;pvGestureStore.setState({settings:{...s.settings,analysisShowHints:true},analysisData:a,treeVersion:s.treeVersion+1,isAnalysisMode:true,runAnalysis:async()=>{}});return true;
        })()`);
        await wait('Number(document.querySelector("[data-board-snapshot=true]").dataset.analysisHintCount)===1');
        await evaluate(cdp, 'new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(r,250))))');
        point = await evaluate(cdp, `(()=>{const b=document.querySelector('[data-board-snapshot=true]'),r=b.getBoundingClientRect();return {x:r.x+Number(b.dataset.boardOriginX)+9*Number(b.dataset.boardCellSize),y:r.y+Number(b.dataset.boardOriginY)+9*Number(b.dataset.boardCellSize)}})()`);
        // An attached mouse on a phone-sized screen uses the same gestures.
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
        await wait(`${count}===8`);
        await wheel(-120, 7);
        await wait('document.querySelector("[data-pv-scroll-hint]")?.textContent.includes("7 / 8")');
        await evaluate(cdp, 'new Promise(r=>setTimeout(r,350))');
        assert.equal(await evaluate(cdp, count), 7, 'Manual stepping did not pause the automatic reveal');
        await wheel(-120, 6);
        await wheel(120, 7);
        await wheel(120, 8);
        await wheel(120, 8);
        for (let expected = 7; expected >= 1; expected--) await wheel(-120, expected);
        await wheel(-120, 1);
        for (let expected = 2; expected <= 7; expected++) await wheel(120, expected);
        await evaluate(cdp, `(()=>{const s=pvGestureStore.getState();window.pvGestureFullAnalysis=s.currentNode.analysis;const a={...s.currentNode.analysis,moves:s.currentNode.analysis.moves.map(m=>({...m,pv:m.pv.slice(0,3)}))};s.currentNode.analysis=a;pvGestureStore.setState({analysisData:a,treeVersion:s.treeVersion+1});return true})()`);
        await wait(`${count}===3`);
        await wait('document.querySelector("[data-pv-scroll-hint]")?.textContent.includes("3 / 3")');
        await evaluate(cdp, '(()=>{const s=pvGestureStore.getState();s.currentNode.analysis=pvGestureFullAnalysis;pvGestureStore.setState({analysisData:pvGestureFullAnalysis,treeVersion:s.treeVersion+1});return true})()');
        await wait(`${count}===7`);
        await wait('document.querySelector("[data-pv-scroll-hint]")?.textContent.includes("7 / 8")');
        await wait('getComputedStyle(document.querySelector("[data-candidate-tooltip]")).visibility==="visible"');
        const hint = await evaluate(cdp, `(()=>{const e=document.querySelector('[data-candidate-tooltip]'),r=e.getBoundingClientRect(),b=e.closest('[data-board-tooltip-boundary]').getBoundingClientRect();return {inside:r.left>=b.left-1&&r.right<=b.right+1&&r.top>=b.top-1&&r.bottom<=b.bottom+1,overflow:e.scrollWidth-e.clientWidth,pointerEvents:getComputedStyle(e).pointerEvents}})()`);
        assert.equal(hint.inside, true, 'Variation readout leaves its available space');
        assert.ok(hint.overflow <= 1, 'Variation readout clips its text');
        assert.equal(hint.pointerEvents, 'none', 'Variation readout captures board input');
        assert.equal(await evaluate(cdp, 'document.querySelectorAll("[data-candidate-tooltip] dt").length'), 10, 'Manual stepping hid candidate metrics');
        const steppedScreenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(screenshotDir, `${caseName}-pv-stepped.png`), Buffer.from(steppedScreenshot.result.data, 'base64'));
        await middleClick();
        await wait(`${treeCount}===9`);
        const kept = await evaluate(cdp, `(()=>{const s=pvGestureStore.getState();let n=s.rootNode.children.find(c=>c.move.x===9&&c.move.y===9),length=0,last;while(n){length++;last=n.move;n=n.children[0]}return {ply:s.moveHistory.length,branches:s.rootNode.children.length,length,last}})()`);
        assert.equal(kept.ply, 0);
        assert.equal(kept.branches, 2, 'Keeping a preview replaced the existing game continuation');
        assert.equal(kept.length, 7, 'Kept moves beyond the visible continuation');
        assert.deepEqual(kept.last, { x: 16, y: 2, player: 'black' });
        await middleClick();
        assert.equal(await evaluate(cdp, treeCount), 9, 'Repeated keep duplicated a variation');
        await key('z', 90, 2);
        await wait(`${treeCount}===2`);
        await key('z', 90, 10);
        await wait(`${treeCount}===9`);
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x + 30, y: point.y + 30 });
        await wait(`${count}===0`);
        await wait('!document.querySelector("[data-pv-scroll-hint]")');
        await evaluate(cdp, 'new Promise(r=>setTimeout(r,75))');
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: point.x + 30, y: point.y + 30, deltaX: 0, deltaY: 120 });
        await wait('pvGestureStore.getState().moveHistory.length===1');
        reports.push({ width, height, fontSize, boundedSteps: true, pausedAnimation: true, liveRefinement: true, visiblePrefixKept: kept.length, undoRedo: true, normalNavigation: true });
        const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(screenshotDir, `${caseName}-pv-gestures.png`), Buffer.from(screenshot.result.data, 'base64'));
      } catch (error) {
        const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(screenshotDir, `${caseName}-pv-gestures-failed.png`), Buffer.from(screenshot.result.data, 'base64'));
        throw error;
      } finally {
        cdp.close();
        await browser.send('Target.disposeBrowserContext', { browserContextId: context });
      }
    }
    fs.writeFileSync(path.join(screenshotDir, 'pv-gestures.json'), JSON.stringify(reports, null, 2));
    console.log('Variation gestures: bounded wheel steps, paused animation, visible-prefix middle-click, undo/redo and ordinary navigation pass.');
  } finally {
    browser.close();
  }
}
