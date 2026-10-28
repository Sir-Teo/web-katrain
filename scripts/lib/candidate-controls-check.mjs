import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { connectDevtools, evaluate, loadedModuleUrl, navigate, setViewport, waitForExpression } from './browser.mjs';
import { auditTextContrast } from './text-contrast.mjs';

// Deliberate, deterministic analysis data: this checks UI interactions without
// relying on which candidate the engine happens to produce for an empty board.
export async function assertCandidateControls(devtoolsPort, appUrl, screenshotDir) {
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
      const wait = expression => waitForExpression(cdp, expression, { label: 'Candidate controls', timeoutMs: 15_000 });
      const key = async (key, code, modifiers = 0) => {
        for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', {
          type, key, windowsVirtualKeyCode: code, modifiers,
          // Native button activation uses Enter's keypress default action.
          text: type === 'keyDown' && key === 'Enter' ? '\r' : undefined,
        });
      };
      const click = async expression => {
        const point = await wait(`(()=>{
          const e=${expression};if(!e)return false;e.scrollIntoView({block:'nearest'});
          const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
          return !e.disabled&&r.width&&r.height&&e.contains(document.elementFromPoint(x,y))?{x,y}:false;
        })()`);
        if (mobile) {
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        } else {
          await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
          for (const type of ['mousePressed', 'mouseReleased']) await cdp.send('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 });
        }
      };
      const ply = () => evaluate(cdp, 'candidateAuditStore.getState().moveHistory.length');
      try {
        await cdp.send('Page.enable');
        await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
        await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
          performance.setResourceTimingBufferSize(5000);
          localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');
          localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
          localStorage.setItem('web-katrain:settings:v3',JSON.stringify({soundEnabled:false,loadSgfFastAnalysis:false,analysisExperience:'pro'}));
        ` });
        await setViewport(cdp, { width, height, mobile });
        await navigate(cdp, appUrl);
        await wait('!!document.querySelector("[data-board-snapshot=true]")');
        await evaluate(cdp, `(async()=>{
          const url=${loadedModuleUrl.toString()};window.candidateAuditStore=(await import(url('/src/store/gameStore.ts'))).useGameStore;
          const s=candidateAuditStore.getState(),size=s.board.length;
          const a={rootWinRate:0.55,rootScoreLead:1,rootVisits:100,moves:[
            {x:3,y:3,winRate:0.55,scoreLead:1,scoreStdev:5,visits:70,order:0,prior:0.1,pointsLost:0,pv:['D16','Q4','D4','Q16','F17','C14']},
            {x:15,y:15,winRate:0.50,scoreLead:0,visits:30,order:1,pointsLost:1,pv:['Q4','D16','D4','Q16']}
          ],territory:Array.from({length:size},()=>Array(size).fill(0)),policy:Array(size*size+1).fill(0)};
          s.currentNode.analysis=a;candidateAuditStore.setState({analysisData:a,treeVersion:s.treeVersion+1});return true;
        })()`);
        if (mobile) {
          await click('document.querySelector("#mobile-tab-info")');
          await click(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Candidates')`);
        }
        await wait('!!document.querySelector(".cl-pv-toggle")');
        assert.equal(await evaluate(cdp, `!!document.querySelector('.candidate-row button,.candidate-row [role=button],.candidate-row [tabindex="0"]')`), false, 'Candidate play buttons contain another focusable control');
        await click('document.querySelector(".cl-pv-toggle")');
        await wait('!!document.querySelector("[data-candidate-pv]")');
        assert.equal(await ply(), 0, 'Opening a variation played a move');
        assert.equal(await evaluate(cdp, `(()=>{const b=document.querySelector('.cl-pv-toggle');return b.tagName==='BUTTON'&&b.getAttribute('aria-expanded')==='true'&&document.getElementById(b.getAttribute('aria-controls'))?.dataset.candidatePv==='3,3'})()`), true, 'Variation disclosure is not a named native button linked to its content');
        await key(' ', 32);
        await wait('!document.querySelector("[data-candidate-pv]")');
        assert.equal(await ply(), 0, 'Space on variation disclosure played a move');
        await key('Enter', 13);
        await wait('!!document.querySelector("[data-candidate-pv]")');
        assert.equal(await ply(), 0, 'Enter on variation disclosure played a move');
        await click('document.querySelector(".cl-detail-toggle")');
        await wait('!!document.querySelector("[data-candidate-detail=true]")');
        const columns = await evaluate(cdp, `(()=>{
          const l=document.querySelector('.candidate-list'),r=l.getBoundingClientRect(),b=l.querySelector('.cl-detail-toggle').getBoundingClientRect();
          const h=l.querySelector('.candidate-list-head').lastElementChild.getBoundingClientRect(),v=l.querySelector('.candidate-row').lastElementChild.getBoundingClientRect();
          return {width:r.width,client:l.clientWidth,scroll:l.scrollWidth,buttonWidth:b.width,buttonHeight:b.height,columnDifference:Math.abs(h.right-v.right)};
        })()`);
        assert.ok(columns.buttonWidth >= 24 && columns.buttonHeight >= 24, 'Expanded detail control shrank below 24px');
        assert.ok(columns.columnDifference <= 1, 'Detail header and candidate columns do not align');
        if (columns.scroll > columns.client + 1) {
          const point = await evaluate(cdp, `(()=>{const r=document.querySelector('.candidate-list-head').getBoundingClientRect();return {x:Math.min(innerWidth-30,r.right-30),y:r.y+r.height/2}})()`);
          await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', ...point, deltaX: 150, deltaY: 0 });
          await wait('document.querySelector(".candidate-list").scrollLeft>0');
          assert.equal(await evaluate(cdp, `(()=>{const l=document.querySelector('.candidate-list'),r=l.getBoundingClientRect(),v=l.querySelector('.candidate-row').lastElementChild.getBoundingClientRect();return v.right<=r.right+1})()`), true, 'Last detail column is not horizontally reachable');
        }
        const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(screenshotDir, `${width}x${height}-candidate-controls.png`), Buffer.from(screenshot.result.data, 'base64'));
        await click('document.querySelector(".cl-detail-toggle")');
        await wait('!!document.querySelector("[data-candidate-detail=false]")');
        // A single scroller keeps headers aligned even when both a long list
        // and expanded variation content make the list overflow vertically.
        await evaluate(cdp, `(()=>{
          const s=candidateAuditStore.getState();window.candidateOriginalAnalysis=s.currentNode.analysis;
          const first=s.currentNode.analysis.moves[0];const a={...s.currentNode.analysis,moves:[...s.currentNode.analysis.moves,...Array.from({length:24},(_,i)=>({...first,x:i%19,y:Math.floor(i/19),order:i+2}))]};
          s.currentNode.analysis=a;candidateAuditStore.setState({analysisData:a,treeVersion:s.treeVersion+1});return true;
        })()`);
        await wait('document.querySelector(".candidate-list").scrollHeight>document.querySelector(".candidate-list").clientHeight');
        const scrollPoint = await evaluate(cdp, `(()=>{const l=document.querySelector('.candidate-list');l.scrollIntoView({block:'nearest'});const r=l.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+55}})()`);
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', ...scrollPoint, deltaX: 0, deltaY: 300 });
        await wait('document.querySelector(".candidate-list").scrollTop>0');
        assert.equal(await evaluate(cdp, `(()=>{const l=document.querySelector('.candidate-list'),h=l.querySelector('.candidate-list-head');return Math.abs(l.getBoundingClientRect().top-h.getBoundingClientRect().top)<=1})()`), true, 'Candidate header scrolled out of view');
        await evaluate(cdp, `(()=>{const s=candidateAuditStore.getState();s.currentNode.analysis=candidateOriginalAnalysis;candidateAuditStore.setState({analysisData:candidateOriginalAnalysis,treeVersion:s.treeVersion+1});return true})()`);
        await wait('document.querySelectorAll(".candidate-row").length===2');
        await click('document.querySelector(".cl-pv-toggle")');
        await wait('!document.querySelector("[data-candidate-pv]")');
        // Remove pointer/focus preview left by the disclosure before playing.
        await click('document.querySelector(".candidate-list-head .cl-sort")');
        if (mobile) {
          await click('document.querySelector(".candidate-row")');
          await wait('!!document.querySelector(".candidate-row.is-active")');
          assert.equal(await ply(), 0, 'First touch played a candidate instead of previewing it');
          await click('document.querySelector(".candidate-row")');
          await wait('candidateAuditStore.getState().moveHistory.length===1');
        } else {
          // Tab from the first sort control through the remaining headers to
          // the native play button, then Enter commits its focused preview.
          for (let i = 0; i < 12; i++) {
            if (await evaluate(cdp, 'document.activeElement?.classList.contains("candidate-row")')) break;
            await key('Tab', 9);
          }
          await wait('document.activeElement?.classList.contains("candidate-row")');
          assert.equal(await ply(), 0);
          await key('Enter', 13);
          await wait('candidateAuditStore.getState().moveHistory.length===1');
        }
        assert.equal(await evaluate(cdp, 'candidateAuditStore.getState().board[3][3]'), 'black');
        await evaluate(cdp, `(()=>{
          candidateAuditStore.getState().navigateStart();
          candidateAuditStore.getState().updateSettings({analysisExperience:'coach'});return true;
        })()`);
        await wait('!!document.querySelector(".candidate-row")&&!document.querySelector(".cl-pv-toggle")');
        await click('document.querySelector(".candidate-row")');
        if (mobile) {
          await wait('!!document.querySelector(".candidate-row.is-active")');
          assert.equal(await ply(), 0, 'First touch played a Coach candidate instead of previewing it');
          await click('document.querySelector(".candidate-row")');
        }
        await wait('candidateAuditStore.getState().moveHistory.length===1');
        assert.equal(await evaluate(cdp, 'candidateAuditStore.getState().board[3][3]'), 'black');
        let contrastCombinations = 0;
        if (!mobile) {
          await evaluate(cdp, `(()=>{
            candidateAuditStore.getState().navigateStart();const s=candidateAuditStore.getState();
            const first=s.currentNode.analysis.moves[0];
            const a={...s.currentNode.analysis,moves:[0,1,2,4,8,15].map((pointsLost,i)=>({...first,x:i*2,y:3,pointsLost,order:i,visits:i?1:70}))};
            s.currentNode.analysis=a;candidateAuditStore.setState({analysisData:a,treeVersion:s.treeVersion+1});return true;
          })()`);
          for (const uiTheme of ['light', 'noir', 'kaya', 'studio']) {
            for (const analysisExperience of ['coach', 'pro']) {
              for (const trainerTheme of ['theme:normal', 'theme:red-green-colourblind']) {
                await evaluate(cdp, `(()=>{candidateAuditStore.getState().updateSettings(${JSON.stringify({ uiTheme, analysisExperience, trainerTheme, trainerLowVisits: 25 })});return true})()`);
                await wait(`document.documentElement.dataset.uiTheme===${JSON.stringify(uiTheme)}&&document.querySelector('.candidate-list').dataset.analysisExperience===${JSON.stringify(analysisExperience)}`);
                await evaluate(cdp, `(()=>{const l=document.querySelector('.candidate-list');l.scrollIntoView({block:'nearest'});l.querySelectorAll('.candidate-row')[1].focus();return new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(r,250))))})()`);
                const contrastFailures = await evaluate(cdp, `(${auditTextContrast.toString()})()`);
                assert.deepEqual(contrastFailures, [], `Unreadable analysis text in ${uiTheme}/${analysisExperience}/${trainerTheme}`);
                contrastCombinations++;
              }
            }
          }
        }
        reports.push({ width, height, separateControls: true, variationKeyboard: true, columns, stickyHeader: true, coachPlay: true, contrastCombinations, playConfirmation: mobile ? 'First tap preview, second tap play' : 'Tab/Enter and mouse play' });
      } catch (error) {
        const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(screenshotDir, `${width}x${height}-candidate-controls-failed.png`), Buffer.from(screenshot.result.data, 'base64'));
        throw error;
      } finally {
        cdp.close();
        await browser.send('Target.disposeBrowserContext', { browserContextId: context });
      }
    }
    fs.writeFileSync(path.join(screenshotDir, 'candidate-controls.json'), JSON.stringify(reports, null, 2));
    console.log('Candidate controls: separate native variation buttons, Space/Enter disclosure, keyboard play, and touch preview/confirmation passed on desktop and phones.');
  } finally {
    browser.close();
  }
}
