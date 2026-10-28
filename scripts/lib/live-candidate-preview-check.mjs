import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { connectDevtools, evaluate, loadedModuleUrl, navigate, setViewport, waitForExpression } from './browser.mjs';

export async function assertLiveCandidatePreviews(devtoolsPort, appUrl, screenshotDir) {
  const version = await (await fetch(`http://127.0.0.1:${devtoolsPort}/json/version`)).json();
  const browser = connectDevtools(version.webSocketDebuggerUrl);
  await browser.ready;
  const reports = [];
  try {
    for (const [width, height] of [[1280, 800], [390, 844]]) {
      const context = (await browser.send('Target.createBrowserContext')).result.browserContextId;
      const target = (await browser.send('Target.createTarget', { url: 'about:blank', browserContextId: context })).result.targetId;
      const cdp = connectDevtools(`ws://127.0.0.1:${devtoolsPort}/devtools/page/${target}`);
      await cdp.ready;
      const wait = expression => waitForExpression(cdp, expression, { label: 'Live candidate preview', timeoutMs: 15_000 });
      const pvCount = 'Number(document.querySelector("[data-board-snapshot=true]").dataset.pvCount)';
      let lastPoint;
      const move = async expression => {
        const point = await wait(expression);
        lastPoint = point;
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
      };
      const click = async expression => {
        await move(`(()=>{const b=${expression};if(!b)return false;b.scrollIntoView({block:'nearest'});const r=b.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return !b.disabled&&r.width&&b.contains(document.elementFromPoint(x,y))?{x,y}:false})()`);
        for (const type of ['mousePressed', 'mouseReleased']) await cdp.send('Input.dispatchMouseEvent', { type, ...lastPoint, button: 'left', clickCount: 1 });
      };
      const key = async (key, code, modifiers = 0) => {
        for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', { type, key, windowsVirtualKeyCode: code, modifiers });
      };
      const boardPoint = `(()=>{const b=document.querySelector('[data-board-snapshot=true]'),r=b.getBoundingClientRect();return r.width?{x:r.x+Number(b.dataset.boardOriginX)+9*Number(b.dataset.boardCellSize),y:r.y+Number(b.dataset.boardOriginY)+9*Number(b.dataset.boardCellSize)}:false})()`;
      const hoverBoard = async () => {
        // Toolbars and the empty-game strip resize the board through a
        // ResizeObserver; use the settled geometry for trusted pointer input.
        await evaluate(cdp, 'new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(r,250))))');
        await move(boardPoint);
      };
      const cardVisits = `[...document.querySelectorAll('[data-candidate-tooltip] dt')].find(e=>e.textContent==='Visits')?.nextElementSibling.textContent`;
      const update = async (visits, length, score = 2, win = 0.6) => {
        await evaluate(cdp, `(()=>{const s=livePreviewStore.getState();const a={...s.currentNode.analysis,moves:s.currentNode.analysis.moves.map(m=>m.x===9&&m.y===9?{...m,visits:${visits},scoreLead:${score},winRate:${win},pv:['K10',...Array.from({length:${length - 1}},(_,i)=>'ABCDEFGHJKLMNOPQRST'[i%19]+(19-Math.floor(i/19)))]}:m)};s.currentNode.analysis=a;livePreviewStore.setState({analysisData:a,treeVersion:s.treeVersion+1});return true})()`);
      };
      try {
        await cdp.send('Page.enable');
        await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
        await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
          performance.setResourceTimingBufferSize(5000);
          localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');
          localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
          localStorage.setItem('web-katrain:settings:v3',JSON.stringify({soundEnabled:false,loadSgfFastAnalysis:false,analysisExperience:'pro',animPvTimeSeconds:0.1}));
          window.addEventListener('pointermove',e=>{window.livePointerEvent={x:e.clientX,y:e.clientY,type:e.pointerType,target:e.target.tagName,ply:e.target.closest('[data-board-snapshot=true]')?.dataset.boardMoveCount,at:performance.now()};});
        ` });
        await setViewport(cdp, { width, height, mobile: width < 1000 });
        await navigate(cdp, appUrl);
        await wait('!!document.querySelector("[data-board-snapshot=true]")');
        await evaluate(cdp, `(async()=>{
          const url=${loadedModuleUrl.toString()};window.livePreviewStore=(await import(url('/src/store/gameStore.ts'))).useGameStore;
          const initial=livePreviewStore.getState();initial.playMove(3,3,true);window.livePreviewChild=livePreviewStore.getState().currentNode;livePreviewStore.getState().playMove(15,15,true);window.livePreviewSecond=livePreviewStore.getState().currentNode;livePreviewStore.getState().navigateStart();
          const s=livePreviewStore.getState();const a={rootWinRate:0.55,rootScoreLead:1,rootVisits:100,moves:[
            {x:9,y:9,order:0,winRate:0.55,scoreLead:1,pointsLost:0,visits:70,pv:['K10','D16','Q4','Q16','D4','C3','R17','C17']},
            {x:15,y:15,order:1,winRate:0.5,scoreLead:0,pointsLost:1,visits:40,pv:['Q4','D16']}
          ],territory:Array.from({length:19},()=>Array(19).fill(0))};
          s.currentNode.analysis=a;livePreviewChild.analysis={...a,moves:a.moves.map(m=>({...m,visits:900}))};
          livePreviewSecond.analysis={...a,moves:a.moves.map(m=>({...m,visits:1200}))};
          livePreviewStore.setState({settings:{...s.settings,analysisShowHints:true},analysisData:a,treeVersion:s.treeVersion+1,isAnalysisMode:true,runAnalysis:async()=>{}});return true;
        })()`);
        await wait('Number(document.querySelector("[data-board-snapshot=true]").dataset.analysisHintCount)===2');
        await evaluate(cdp, 'new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(r,250))))');
        await hoverBoard();
        await wait(`${cardVisits}==='70'`);
        const animatedBefore = await wait(`(()=>{const n=${pvCount};return n>=4?n:false})()`);
        await update(12345, 20);
        await wait(`${cardVisits}==='12345'`);
        const animatedAfter = await evaluate(cdp, pvCount);
        assert.ok(animatedAfter >= animatedBefore, `PV refinement restarted animation: ${animatedBefore} -> ${animatedAfter}`);
        assert.equal(await evaluate(cdp, `[...document.querySelectorAll('[data-candidate-tooltip] dt')].find(e=>e.textContent==='B win')?.nextElementSibling.textContent`), '60.0%');
        assert.equal(await evaluate(cdp, `document.querySelector('[data-candidate-tooltip] [aria-label="20-move continuation"]')?.textContent`), 'PV 20');
        // Removing a candidate must remove its snapshot, even with the pointer
        // stationary; a result from an earlier search is no longer a preview.
        await evaluate(cdp, `(()=>{const s=livePreviewStore.getState();window.livePreviewAnalysis=s.currentNode.analysis;const a={...s.currentNode.analysis,moves:s.currentNode.analysis.moves.slice(1)};s.currentNode.analysis=a;livePreviewStore.setState({analysisData:a,treeVersion:s.treeVersion+1});return true})()`);
        await wait('!document.querySelector("[data-candidate-tooltip]")');
        await wait(`${pvCount}===0`);
        await evaluate(cdp, '(()=>{const s=livePreviewStore.getState();s.currentNode.analysis=livePreviewAnalysis;livePreviewStore.setState({analysisData:livePreviewAnalysis,treeVersion:s.treeVersion+1});return true})()');
        if (width >= 1000) {
          const rowPoint = `(()=>{const b=document.querySelector('.candidate-row');if(!b)return false;b.scrollIntoView({block:'nearest'});const r=b.getBoundingClientRect();return r.width?{x:r.x+80,y:r.y+r.height/2}:false})()`;
          await move(rowPoint);
          await wait('!!document.querySelector(".candidate-row.is-active")');
          await wait(`${pvCount}===20`);
          await update(54321, 3, 3, 0.65);
          await wait(`${pvCount}===3`);
          assert.equal(await evaluate(cdp, 'document.querySelector(".candidate-row .cl-num").textContent'), '65.0%');
          for (const flag of ['isEditMode', 'isSelectingRegionOfInterest']) {
            await evaluate(cdp, `(()=>{livePreviewStore.setState({${flag}:true});return true})()`);
            await wait(`${pvCount}===0`);
            assert.equal(await evaluate(cdp, '!!document.querySelector(".candidate-row.is-active")'), true, 'Ownership check lost its pinned selection');
            await evaluate(cdp, `(()=>{livePreviewStore.setState({${flag}:false});return true})()`);
            await wait(`${pvCount}===3`);
          }
          for (let i = 0; i < 2; i++) {
            for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', { type, key: 'S', windowsVirtualKeyCode: 83, modifiers: 8 });
            await wait(`${pvCount}===${i === 0 ? 0 : 3}`);
          }
          // Move out and back so the subsequent navigation checks the board
          // hover, rather than the explicitly selected candidate-panel row.
          await hoverBoard();
          await wait(`${cardVisits}==='54321'`);
        } else {
          await hoverBoard();
          await wait(`${cardVisits}==='12345'`);
        }
        await evaluate(cdp, '(()=>{livePreviewStore.getState().navigateForward();return true})()');
        await wait('livePreviewStore.getState().currentNode.id===livePreviewChild.id');
        await wait('!document.querySelector("[data-candidate-tooltip]")');
        await wait(`${pvCount}===0`);
        assert.equal(await evaluate(cdp, 'livePreviewStore.getState().moveHistory.length'), 1);
        await evaluate(cdp, '(()=>{livePreviewStore.getState().navigateStart();return true})()');
        await wait('livePreviewStore.getState().moveHistory.length===0');
        await wait('!document.querySelector("[data-candidate-tooltip]")');
        await wait(`${pvCount}===0`);
        await evaluate(cdp, '(()=>{livePreviewStore.getState().navigateForward();return true})()');
        await wait('livePreviewStore.getState().currentNode.id===livePreviewChild.id');
        if (width >= 1000) {
          await key('k', 75, 2);
          await click('document.querySelector(\'[data-command-palette-item="game-report"]\')');
          await wait('!!document.querySelector("#game-report-title")');
          await evaluate(cdp, 'new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(r,250))))');
          await move(`(()=>{const b=[...document.querySelectorAll('.report-print div.contents')].find(e=>e.firstElementChild?.textContent.trim()==='#1')?.firstElementChild;if(!b)return false;b.scrollIntoView({block:'nearest'});const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
          await wait(`${pvCount}===3`);
          await click(`[...document.querySelectorAll('.report-print button')].find(b=>b.textContent.trim()==='Review 2')`);
          await wait(`[...document.querySelectorAll('.report-print span')].some(e=>e.textContent.trim()==='1/2')`);
          await click(`[...document.querySelectorAll('.report-print button')].find(b=>b.textContent.trim()==='Next')`);
          await wait(`[...document.querySelectorAll('.report-print span')].some(e=>e.textContent.trim()==='2/2')`);
          assert.equal(await evaluate(cdp, 'livePreviewStore.getState().currentNode.id===livePreviewSecond.id'), true, 'Report queue did not survive position navigation');
          await key('Escape', 27);
          await wait('!document.querySelector("#game-report-title")');
          await wait(`${pvCount}===0`);
        }
        await evaluate(cdp, '(()=>{livePreviewStore.getState().navigateStart();return new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))})()');
        await hoverBoard();
        await wait('!!document.querySelector("[data-candidate-tooltip]")');
        await evaluate(cdp, '(()=>{const s=livePreviewStore.getState();delete s.currentNode.analysis;livePreviewStore.setState({analysisData:null,treeVersion:s.treeVersion+1});return true})()');
        await wait('!document.querySelector("[data-candidate-tooltip]")');
        await wait(`${pvCount}===0`);
        assert.equal(await evaluate(cdp, 'livePreviewStore.getState().moveHistory.length'), 0, 'Preview work modified the game');
        reports.push({ width, height, animatedBefore, animatedAfter, liveValues: true, cachedNavigation: true, clearedAnalysis: true, explicitPreview: width >= 1000 });
        const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(screenshotDir, `${width}x${height}-live-candidate-preview.png`), Buffer.from(screenshot.result.data, 'base64'));
      } catch (error) {
        console.log('Live preview failure state:', await evaluate(cdp, `(()=>{const s=livePreviewStore.getState(),b=document.querySelector('[data-board-snapshot=true]'),p=${JSON.stringify(lastPoint ?? null)};return {pointer:window.livePointerEvent,last:p,hit:p?document.elementFromPoint(p.x,p.y)?.outerHTML.slice(0,160):null,mode:s.isAnalysisMode,edit:s.isEditMode,roi:s.isSelectingRegionOfInterest,hints:s.settings.analysisShowHints,policy:s.settings.analysisShowPolicy,analysis:s.analysisData?.moves.map(m=>[m.x,m.y,m.visits]),pv:b?.dataset.pvCount,ply:b?.dataset.boardMoveCount,pinned:!!document.querySelector('.candidate-row.is-active'),tooltip:document.querySelector('[data-candidate-tooltip]')?.textContent}})()`));
        const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(screenshotDir, `${width}x${height}-live-candidate-preview-failed.png`), Buffer.from(screenshot.result.data, 'base64'));
        throw error;
      } finally {
        cdp.close();
        await browser.send('Target.disposeBrowserContext', { browserContextId: context });
      }
    }
    fs.writeFileSync(path.join(screenshotDir, 'live-candidate-previews.json'), JSON.stringify(reports, null, 2));
    console.log('Live candidate previews: stationary hover values and PV refresh, animation continues, cached-node navigation clears old previews, and temporary tools retain a quiet board.');
  } finally {
    browser.close();
  }
}
