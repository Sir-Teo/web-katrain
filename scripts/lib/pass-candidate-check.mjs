import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { connectDevtools, evaluate, loadedModuleUrl, navigate, setViewport, waitForExpression } from './browser.mjs';

export async function assertPassCandidates(devtoolsPort, appUrl, screenshotDir) {
  const version = await (await fetch(`http://127.0.0.1:${devtoolsPort}/json/version`)).json();
  const browser = connectDevtools(version.webSocketDebuggerUrl);
  await browser.ready;
  const reports = [];
  try {
    for (const [width, height] of [[1280, 800], [390, 844], [320, 568]]) {
      for (const experience of ['coach', 'pro']) {
        const mobile = width < 1000;
        const context = (await browser.send('Target.createBrowserContext')).result.browserContextId;
        const target = (await browser.send('Target.createTarget', { url: 'about:blank', browserContextId: context })).result.targetId;
        const cdp = connectDevtools(`ws://127.0.0.1:${devtoolsPort}/devtools/page/${target}`);
        await cdp.ready;
        const wait = expression => waitForExpression(cdp, expression, { label: 'Pass candidates', timeoutMs: 15_000 });
        const key = async (key, code, modifiers = 0) => {
          for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', { type, key, windowsVirtualKeyCode: code, modifiers, text: type === 'keyDown' && key === 'Enter' ? '\r' : undefined });
        };
        const click = async expression => {
          const point = await wait(`(()=>{const e=${expression};if(!e)return false;e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return !e.disabled&&r.width&&r.height&&e.contains(document.elementFromPoint(x,y))?{x,y}:false})()`);
          if (mobile) {
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          } else {
            await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
            for (const type of ['mousePressed', 'mouseReleased']) await cdp.send('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 });
          }
        };
        const dismiss = async () => {
          const notice = `document.querySelector('[aria-label="Dismiss notification"]')`;
          if (await evaluate(cdp, `!!${notice}`)) await click(notice);
        };
        const openCandidates = async () => {
          if (mobile) await click('document.querySelector("#mobile-tab-info")');
          if (!await evaluate(cdp, 'document.querySelector(".candidate-list")?.getBoundingClientRect().width>0')) await click("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Candidates')");
          await wait('document.querySelector(".candidate-list")?.getBoundingClientRect().width>0');
        };
        const checkKeptLine = async () => {
          await wait('passCandidateStore.getState().rootNode.children[0]?.children[0]?.children.length===1');
          assert.deepEqual(await evaluate(cdp, `(()=>{const s=passCandidateStore.getState(),a=s.rootNode.children[0],b=a.children[0],c=b.children[0];return {ply:s.moveHistory.length,moves:[a.move,b.move,c.move],stone:b.gameState.board[15][3]}})()`), { ply: 0, moves: [{ x: -1, y: -1, player: 'black' }, { x: 3, y: 15, player: 'white' }, { x: -1, y: -1, player: 'black' }], stone: 'white' });
          await key('z', 90, 2);
          await wait('passCandidateStore.getState().rootNode.children.length===0');
          await dismiss();
        };
        const playPass = async ply => {
          if (mobile) {
            await click('document.querySelector(".candidate-row")');
            await wait('!!document.querySelector(".candidate-row.is-active")');
            assert.equal(await evaluate(cdp, 'passCandidateStore.getState().moveHistory.length'), ply, 'First pass-candidate tap played before confirmation');
            await click('document.querySelector(".candidate-row")');
          } else {
            await key('Tab', 9);
            await evaluate(cdp, '(()=>{document.querySelector(".candidate-row").focus();return true})()');
            await wait('!!document.querySelector(".candidate-row.is-active")');
            await key('Enter', 13);
          }
          await wait(`passCandidateStore.getState().moveHistory.length===${ply + 1}`);
          assert.deepEqual(await evaluate(cdp, 'passCandidateStore.getState().currentNode.move'), { x: -1, y: -1, player: ply % 2 ? 'white' : 'black' });
          assert.equal(await evaluate(cdp, 'passCandidateStore.getState().board.flat().filter(Boolean).length'), 0, 'Passing placed a stone');
        };
        try {
          await cdp.send('Page.enable');
          await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
          await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
            performance.setResourceTimingBufferSize(5000);
            localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');
            localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
            localStorage.setItem('web-katrain:settings:v3',JSON.stringify({soundEnabled:false,loadSgfFastAnalysis:false,analysisExperience:${JSON.stringify(experience)},animPvTimeSeconds:0}));
          ` });
          await setViewport(cdp, { width, height, mobile });
          await navigate(cdp, appUrl);
          await wait('!!document.querySelector("[data-board-snapshot=true]")');
          await evaluate(cdp, `(async()=>{const url=${loadedModuleUrl.toString()};window.passCandidateStore=(await import(url('/src/store/gameStore.ts'))).useGameStore;const s=passCandidateStore.getState();window.passCandidateAnalysis={rootWinRate:0.55,rootScoreLead:1,rootVisits:100,moves:[{x:-1,y:-1,order:0,winRate:0.55,scoreLead:1,pointsLost:0,visits:70,pv:['pass','D4','pass']},{x:9,y:9,order:1,winRate:0.5,scoreLead:0,pointsLost:1,visits:30,pv:['K10','D4']}],territory:Array.from({length:19},()=>Array(19).fill(0))};s.currentNode.analysis=passCandidateAnalysis;passCandidateStore.setState({analysisData:passCandidateAnalysis,treeVersion:s.treeVersion+1,isAnalysisMode:true,runAnalysis:async()=>{}});return true})()`);
          await openCandidates();
          await wait('document.querySelectorAll(".candidate-row").length===2');
          assert.equal(await evaluate(cdp, 'document.querySelector(".candidate-row .cl-move").textContent.trim()'), 'Pass');
          await click('document.querySelector(".cl-pv-toggle")');
          await wait('!!document.querySelector("[data-candidate-pv]")');
          assert.equal(await evaluate(cdp, 'passCandidateStore.getState().moveHistory.length'), 0, 'Opening a pass continuation played it');
          await click(`[...document.querySelectorAll('[data-candidate-pv] button')].find(b=>b.textContent.trim()==='Keep in tree')`);
          await checkKeptLine();
          if (mobile) {
            await click('document.querySelector("#mobile-tab-board")');
            const clear = `document.querySelector('[aria-label="Clear continuation preview"]')`;
            if (await evaluate(cdp, `!!${clear}`)) await click(clear);
            const tile = `document.querySelector('.candidate-pv-strip button[title^="Preview Pass continuation"]')`;
            await click(tile);
            await wait(`${tile}?.getAttribute('aria-pressed')==='true'`);
            await wait('Number(document.querySelector("[data-board-snapshot=true]").dataset.pvCount)===1');
            assert.equal(await evaluate(cdp, 'passCandidateStore.getState().moveHistory.length'), 0, 'Pinning a pass continuation played it');
            await click(`[...document.querySelectorAll('.candidate-pv-strip button')].find(b=>b.textContent.trim()==='Keep in tree')`);
            await checkKeptLine();
            await click(clear);
            await openCandidates();
          }
          // An endgame position may have no on-board suggestion at all.
          await evaluate(cdp, `(()=>{const s=passCandidateStore.getState(),a={...passCandidateAnalysis,moves:passCandidateAnalysis.moves.slice(0,1)};s.currentNode.analysis=a;passCandidateStore.setState({analysisData:a,treeVersion:s.treeVersion+1});return true})()`);
          await wait('document.querySelectorAll(".candidate-row").length===1');
          await playPass(0);
          await evaluate(cdp, `(()=>{const s=passCandidateStore.getState(),a={...passCandidateAnalysis,moves:[{...passCandidateAnalysis.moves[0],pv:['pass']}]};s.currentNode.analysis=a;passCandidateStore.setState({analysisData:a,treeVersion:s.treeVersion+1});return true})()`);
          await wait('document.querySelectorAll(".candidate-row").length===1');
          await playPass(1);
          await wait('passCandidateStore.getState().notification?.message.includes("Both players passed")');
          reports.push({ width, height, experience, passRanked: true, continuationKept: true, tilePreview: mobile, confirmedPasses: 2, stones: 0 });
          const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
          fs.writeFileSync(path.join(screenshotDir, `${width}x${height}-${experience}-pass-candidates.png`), Buffer.from(screenshot.result.data, 'base64'));
        } catch (error) {
          const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
          fs.writeFileSync(path.join(screenshotDir, `${width}x${height}-${experience}-pass-candidates-failed.png`), Buffer.from(screenshot.result.data, 'base64'));
          throw error;
        } finally {
          cdp.close();
          await browser.send('Target.disposeBrowserContext', { browserContextId: context });
        }
      }
    }
    fs.writeFileSync(path.join(screenshotDir, 'pass-candidates.json'), JSON.stringify(reports, null, 2));
    console.log('Pass candidates: ranking, continuations, undoable keep, keyboard play, touch confirmation and game end passed in Coach and Pro on desktop and phones.');
  } finally {
    browser.close();
  }
}
