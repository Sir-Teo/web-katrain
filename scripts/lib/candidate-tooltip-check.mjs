import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { connectDevtools, evaluate, loadedModuleUrl, navigate, setViewport, waitForExpression } from './browser.mjs';
import { auditTextContrast } from './text-contrast.mjs';

const DEFAULT_VIEWPORTS = [
  { width: 1280, height: 800, mobile: false },
  { width: 1024, height: 500, mobile: false },
  { width: 390, height: 844, mobile: true },
  { width: 320, height: 568, mobile: true },
  { width: 568, height: 320, mobile: true },
];

export async function assertCandidateTooltips(devtoolsPort, appUrl, screenshotDir, viewports = DEFAULT_VIEWPORTS) {
  const version = await (await fetch(`http://127.0.0.1:${devtoolsPort}/json/version`)).json();
  const browser = connectDevtools(version.webSocketDebuggerUrl);
  await browser.ready;
  const reports = [];
  try {
    for (const viewport of [...viewports, { width: 568, height: 320, mobile: true, fontSize: 20 }]) {
      const { width, height } = viewport;
      const suffix = viewport.fontSize ? `-font${viewport.fontSize}` : '';
      const context = (await browser.send('Target.createBrowserContext')).result.browserContextId;
      const target = (await browser.send('Target.createTarget', { url: 'about:blank', browserContextId: context })).result.targetId;
      const cdp = connectDevtools(`ws://127.0.0.1:${devtoolsPort}/devtools/page/${target}`);
      await cdp.ready;
      const wait = expression => waitForExpression(cdp, expression, { label: 'Candidate tooltip', timeoutMs: 15_000 });
      try {
        await cdp.send('Page.enable');
        await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
        await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
          performance.setResourceTimingBufferSize(5000);
          localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');
          localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
          localStorage.setItem('web-katrain:settings:v3',JSON.stringify({soundEnabled:false,loadSgfFastAnalysis:false,analysisExperience:'pro',analysisShowHints:true,animPvTimeSeconds:0}));
        ` });
        await setViewport(cdp, viewport);
        await navigate(cdp, appUrl);
        await wait('!!document.querySelector("[data-board-snapshot=true]")');
        if (viewport.fontSize) await evaluate(cdp, `(()=>{document.documentElement.style.fontSize='${viewport.fontSize}px';return new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))})()`);
        await evaluate(cdp, `(async()=>{
          const url=${loadedModuleUrl.toString()};window.tooltipAuditStore=(await import(url('/src/store/gameStore.ts'))).useGameStore;
          const s=tooltipAuditStore.getState();const a={rootWinRate:0.55,rootScoreLead:1,rootVisits:100,moves:
            [[9,9,'K10'],[18,18,'T1'],[0,0,'A19']].map(([x,y,label],order)=>({x,y,order,winRate:0.55,scoreLead:1,scoreStdev:5,pointsLost:0,relativePointsLost:0,winRateLost:0.05,lcb:0.45,prior:0.1,humanPrior:0.2,visits:70,pv:[label,...Array.from({length:79},(_,i)=>'ABCDEFGHJKLMNOPQRST'[i%19]+(19-Math.floor(i/19)))]})),
            territory:Array.from({length:19},()=>Array(19).fill(0))};
          s.currentNode.analysis=a;tooltipAuditStore.setState({settings:{...s.settings,analysisShowHints:true},analysisData:a,treeVersion:s.treeVersion+1,isAnalysisMode:true,runAnalysis:async()=>{}});return true;
        })()`);
        await evaluate(cdp, 'new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(r,250))))');
        await wait('Number(document.querySelector("[data-board-snapshot=true]").dataset.analysisHintCount)===3');
        const cards = [];
        for (const [x, y, label] of [[9, 9, 'K10'], [18, 18, 'T1'], [0, 0, 'A19']]) {
          const point = await wait(`(()=>{
            const b=document.querySelector('[data-board-snapshot=true]'),r=b.getBoundingClientRect(),cell=Number(b.dataset.boardCellSize);
            const x=r.x+Number(b.dataset.boardOriginX)+${x}*cell,y=r.y+Number(b.dataset.boardOriginY)+${y}*cell;
            return b.contains(document.elementFromPoint(x,y))?{x,y}:false;
          })()`);
          // Mouse input on touch-sized viewports represents an attached mouse
          // or pen; the finger path is checked separately below.
          await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
          await wait(`(()=>{const t=document.querySelector('[data-candidate-tooltip="${label}"]');return t&&getComputedStyle(t).visibility==='visible'})()`);
          const card = await evaluate(cdp, `(()=>{
            const t=document.querySelector('[data-candidate-tooltip="${label}"]'),b=document.querySelector('[data-board-snapshot=true]'),p=b.closest('[data-board-tooltip-boundary]');
            const r=t.getBoundingClientRect(),br=b.getBoundingClientRect(),v=p.getBoundingClientRect(),ps=getComputedStyle(p);
            return {label:${JSON.stringify(label)},outside:t.dataset.tooltipOutsideBoard==='true',compact:t.dataset.tooltipCompact==='true',
              rect:{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height},
              boundary:{left:v.left,top:v.top+Math.max(8,parseFloat(ps.paddingTop)||0),right:v.right,bottom:v.bottom-Math.max(8,parseFloat(ps.paddingBottom)||0)},board:{left:br.left,top:br.top,right:br.right,bottom:br.bottom},
              metrics:t.querySelectorAll('dt').length,pvText:t.querySelector('p')?.textContent??'',count:t.querySelector('[aria-label="80-move continuation"]')?.textContent,
              pointerEvents:getComputedStyle(t).pointerEvents,overflow:t.scrollWidth-t.clientWidth,fontSize:parseFloat(getComputedStyle(t).fontSize),columns:Number(t.dataset.tooltipColumns)};
          })()`);
          assert.equal(card.metrics, 10, 'A metric disappeared in a constrained viewport');
          assert.equal(card.count, 'PV 80');
          assert.equal(card.pointerEvents, 'none');
          assert.ok(card.rect.left >= card.boundary.left - 1 && card.rect.right <= card.boundary.right + 1, `Tooltip leaves horizontal bounds: ${JSON.stringify(card)}`);
          assert.ok(card.rect.top >= card.boundary.top - 1 && card.rect.bottom <= card.boundary.bottom + 1, `Tooltip leaves vertical bounds: ${JSON.stringify(card)}`);
          assert.ok(card.overflow <= 1, `Tooltip text overflows: ${JSON.stringify(card)}`);
          if (viewport.fontSize) {
            assert.ok(card.fontSize >= 13.7, 'Compact text ignored the browser font preference');
            assert.equal(card.columns, 2, 'Enlarged text did not reflow into columns');
          }
          if (card.outside) assert.ok(card.rect.right <= card.board.left || card.rect.left >= card.board.right, 'Side tooltip covers the board');
          if (!card.compact) assert.ok(card.pvText.endsWith('C15'), 'Full preview lost the end of its continuation');
          if (width === 1280 && height === 800) assert.equal(card.outside, true, 'Available desktop margin was not used');
          cards.push(card);
        }
        const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(screenshotDir, `${width}x${height}${suffix}-candidate-tooltip.png`), Buffer.from(screenshot.result.data, 'base64'));
        if (width === 1280 && height === 800) {
          for (const uiTheme of ['light', 'noir', 'kaya', 'studio']) {
            await evaluate(cdp, `(()=>{tooltipAuditStore.getState().updateSettings({uiTheme:${JSON.stringify(uiTheme)}});return new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(r,250))))})()`);
            await wait('!!document.querySelector("[data-candidate-tooltip]")');
            const failures = await evaluate(cdp, `(${auditTextContrast.toString()})(undefined, document.querySelector('[data-candidate-tooltip]'))`);
            assert.deepEqual(failures, [], `Tooltip text is unreadable in ${uiTheme}`);
          }
        }
        await evaluate(cdp, '(()=>{tooltipAuditStore.getState().rotateBoard();return new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))})()');
        // A19 rotates clockwise from display (0,0) to (18,0).
        const rotatedPoint = await evaluate(cdp, `(()=>{const b=document.querySelector('[data-board-snapshot=true]'),r=b.getBoundingClientRect();return {x:r.x+Number(b.dataset.boardOriginX)+18*Number(b.dataset.boardCellSize),y:r.y+Number(b.dataset.boardOriginY)}})()`);
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...rotatedPoint });
        await wait('document.querySelector("[data-candidate-tooltip]")?.dataset.candidateTooltip==="A19"');
        assert.equal(await evaluate(cdp, `(()=>{const t=document.querySelector('[data-candidate-tooltip]'),b=document.querySelector('[data-board-snapshot=true]').closest('[data-board-tooltip-boundary]'),r=t.getBoundingClientRect(),v=b.getBoundingClientRect();return r.top>=v.top-1&&r.bottom<=v.bottom+1&&r.left>=v.left-1&&r.right<=v.right+1})()`), true, 'Rotated tooltip leaves its boundary');
        if (width === 1280 && height === 800) assert.equal(await evaluate(cdp, `document.querySelector('[data-candidate-tooltip]').getBoundingClientRect().left>=document.querySelector('[data-board-snapshot=true]').getBoundingClientRect().right`), true, 'Rotated preview did not follow its candidate to the other side');
        if (viewport.mobile) {
          const point = await evaluate(cdp, `(()=>{const b=document.querySelector('[data-board-snapshot=true]'),r=b.getBoundingClientRect();return {x:r.x+Number(b.dataset.boardOriginX)+9*Number(b.dataset.boardCellSize),y:r.y+Number(b.dataset.boardOriginY)+9*Number(b.dataset.boardCellSize)}})()`);
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x + 1, y: point.y }] });
          await wait('!document.querySelector("[data-candidate-tooltip]")');
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
        }
        assert.equal(await evaluate(cdp, 'tooltipAuditStore.getState().moveHistory.length'), 0, 'Inspecting a tooltip played a move');
        reports.push({ width, height, fontSize: viewport.fontSize, cards, rotated: true });
      } catch (error) {
        const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(screenshotDir, `${width}x${height}${suffix}-candidate-tooltip-failed.png`), Buffer.from(screenshot.result.data, 'base64'));
        throw error;
      } finally {
        cdp.close();
        await browser.send('Target.disposeBrowserContext', { browserContextId: context });
      }
    }
    fs.writeFileSync(path.join(screenshotDir, 'candidate-tooltips.json'), JSON.stringify(reports, null, 2));
    console.log('Candidate tooltips: side margins, constrained previews, complete metrics and touch ownership passed across desktop and phone layouts.');
  } finally {
    browser.close();
  }
}
