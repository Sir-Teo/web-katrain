import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { connectDevtools, evaluate, loadedModuleUrl, navigate, setViewport, waitForExpression } from './browser.mjs';

const pdfCounts = buffer => {
  // Chromium writes these structural PDF dictionaries outside compressed
  // content streams. Count page objects rather than guessing from DOM height.
  const raw = buffer.toString('latin1');
  return { pages: (raw.match(/\/Type\s*\/Page\b/g) ?? []).length, images: (raw.match(/\/Subtype\s*\/Image\b/g) ?? []).length };
};

export async function assertReportPrinting(devtoolsPort, appUrl, screenshotDir) {
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
      const wait = expression => waitForExpression(cdp, expression, { label: 'Report printing', timeoutMs: 20_000 });
      const key = async (key, code, modifiers = 0) => {
        for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', { type, key, windowsVirtualKeyCode: code, modifiers });
      };
      const click = async expression => {
        const point = await wait(`(()=>{const b=${expression};if(!b)return false;b.scrollIntoView({block:'nearest'});
          const r=b.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
          return !b.disabled&&r.width&&r.height&&b.contains(document.elementFromPoint(x,y))?{x,y}:false;})()`);
        for (const type of ['mousePressed', 'mouseReleased']) await cdp.send('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 });
      };
      const print = async filename => {
        const response = await cdp.send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true });
        assert.ok(response.result?.data, JSON.stringify(response.error));
        const buffer = Buffer.from(response.result.data, 'base64');
        fs.writeFileSync(path.join(screenshotDir, filename), buffer);
        return { ...pdfCounts(buffer), bytes: buffer.length };
      };
      try {
        await cdp.send('Page.enable');
        await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
        await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
          performance.setResourceTimingBufferSize(5000);
          localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');
          localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
          localStorage.setItem('web-katrain:settings:v3',JSON.stringify({soundEnabled:false,loadSgfFastAnalysis:false}));
        ` });
        await setViewport(cdp, { width, height, mobile: width < 1000 });
        await navigate(cdp, appUrl);
        await wait('!!document.querySelector("[data-board-snapshot=true]")');
        await evaluate(cdp, `(async()=>{
          const url=${loadedModuleUrl.toString()};window.printAuditStore=(await import(url('/src/store/gameStore.ts'))).useGameStore;
          const {parseSgf}=await import(url('/src/utils/sgf.ts'));
          const moves=Array.from({length:30},(_,i)=>';'+(i%2?'W':'B')+'['+String.fromCharCode(97+(i*7)%19)+String.fromCharCode(100+Math.floor(i/19)*6)+']').join('');
          printAuditStore.getState().loadGame(parseSgf('(;GM[1]SZ[19]PB[Fixture Black]PW[Fixture White]GN[Print audit]'+moves+')'));
          printAuditStore.getState().navigateEnd();const s=printAuditStore.getState();let n=s.rootNode,score=0,index=0;
          while(n){
            n.analysis={rootWinRate:Math.max(0.1,Math.min(0.9,0.5+score/100)),rootScoreLead:score,rootVisits:100,
              moves:[{x:18,y:18,winRate:0.55,scoreLead:score,visits:70,order:0,prior:0.1,pointsLost:0,
                pv:Array.from({length:24},(_,i)=>['T1','S2','S1','T2'][i%4])}],territory:Array.from({length:19},()=>Array(19).fill(0))};
            const child=n.children[0];if(child)score+=(child.move.player==='black'?-1:1)*(2+index%6);n=child;index++;
          }
          printAuditStore.setState({treeVersion:s.treeVersion+1,analysisData:s.currentNode.analysis});return true;
        })()`);
        await key('k', 75, 2);
        await click('document.querySelector(\'[data-command-palette-item="game-report"]\')');
        await wait('!!document.querySelector("#game-report-title")');
        assert.equal(await evaluate(cdp, 'document.querySelector(".report-overlay").parentElement===document.body'), true, 'Report is constrained by the app shell during printing');
        if (width >= 1000) {
          // Observe the app's preparation without opening an OS print dialog;
          // actual PDF rendering below still goes through Chromium's printer.
          await evaluate(cdp, '(()=>{window.reportPrintCalls=0;window.print=()=>{window.reportPrintCalls++};return true})()');
          await click(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Print / Save PDF')`);
          await wait('reportPrintCalls===1&&document.querySelectorAll(".pdf-board").length===10');
        } else {
          assert.equal(await evaluate(cdp, 'document.querySelectorAll(".pdf-board").length'), 0, 'Direct-print case was prepared by the app button');
        }
        const full = await print(`${width}x${height}-game-report.pdf`);
        // A summary can span two pages depending on installed font metrics.
        // Ten position pages must not become twenty plus a trailing blank.
        assert.ok(full.pages >= 11 && full.pages <= 13, `Report unexpectedly produced ${full.pages} pages`);
        assert.ok(full.images >= 10, 'Printed report omitted board diagrams');
        await wait('document.querySelectorAll(".pdf-board").length===10');
        assert.equal(await evaluate(cdp, `[...document.querySelectorAll('.pdf-position-page')].every(p=>p.querySelectorAll('.pdf-tree-node').length===24)`), true, 'Printed continuation lost moves');
        // Isolate one complete position in this private fixture to establish
        // that its board, legend and all 24 continuation moves fit one page.
        await evaluate(cdp, `(()=>{const s=document.createElement('style');s.id='report-print-fixture';s.textContent='@media print{.pdf-page:not(.pdf-position-page),.pdf-position-page~.pdf-position-page{display:none!important}.pdf-position-page{break-after:auto!important;page-break-after:auto!important}}';document.head.append(s);return true})()`);
        const position = await print(`${width}x${height}-report-position.pdf`);
        assert.equal(position.pages, 1, 'A single board and its continuation split across printed pages');
        assert.ok(position.images >= 1);
        await evaluate(cdp, '(()=>{document.querySelector("#report-print-fixture").remove();return true})()');
        // Return to the on-screen dialog, check its nested guide and close it.
        await click('document.querySelector(\'[aria-label="Open report guide"]\')');
        await wait('!!document.querySelector("#report-guide-title")');
        await key('Escape', 27);
        await wait('!document.querySelector("#report-guide-title")');
        await key('Escape', 27);
        await wait('!document.querySelector("#game-report-title")');
        assert.equal(await evaluate(cdp, 'printAuditStore.getState().moveHistory.length'), 30, 'Printing changed the live position');
        reports.push({ width, height, path: width >= 1000 ? 'App print button' : 'Browser print without preparation', full, position });
      } catch (error) {
        const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(screenshotDir, `${width}x${height}-report-print-failed.png`), Buffer.from(screenshot.result.data, 'base64'));
        throw error;
      } finally {
        cdp.close();
        await browser.send('Target.disposeBrowserContext', { browserContextId: context });
      }
    }
    fs.writeFileSync(path.join(screenshotDir, 'report-print.json'), JSON.stringify(reports, null, 2));
    console.log('Report printing: app and browser print include every board; 24-move positions fit one page, complete reports stay bounded, and the game remains unchanged.');
  } finally {
    browser.close();
  }
}
