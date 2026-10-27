import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';
import { closeBrowser, chromePath, chromeTarget, connectDevtools, evaluate, freePort, loadedModuleUrl, navigate, setViewport, waitForExpression } from './lib/browser.mjs';

// Reproduce the real Print / Save PDF flow with ten known mistakes and the
// longest displayed correction. The previous layout emitted 24 pages for it.
async function main() {
  const appPort = await freePort(), devtoolsPort = await freePort();
  const runDir = fs.mkdtempSync(path.resolve('node_modules/.web-katrain-report-'));
  const output = process.env.REPORT_PRINT_OUTPUT_DIR || '/tmp/web-katrain-report-print';
  fs.mkdirSync(output, { recursive: true });
  let server, chrome, cdp;
  try {
    server = await createServer({ cacheDir: path.join(runDir, 'vite'), server: { host: '127.0.0.1', port: appPort, strictPort: true } });
    await server.listen();
    chrome = spawn(chromePath, [
      '--headless=new', '--no-first-run', '--no-default-browser-check',
      ...(process.env.CI ? ['--no-sandbox', '--disable-dev-shm-usage'] : []),
      `--remote-debugging-port=${devtoolsPort}`, `--user-data-dir=${path.join(runDir, 'chrome')}`, 'about:blank',
    ], { stdio: 'ignore' });
    cdp = connectDevtools(await chromeTarget(devtoolsPort));
    await cdp.ready;
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
      localStorage.removeItem('web-katrain:auto_saved_game:v1');
      localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');
      localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
      localStorage.setItem('web-katrain:settings:v3',JSON.stringify({soundEnabled:false,loadSgfFastAnalysis:false}));
    ` });
    const wait = expression => waitForExpression(cdp, expression, { label: 'Report PDF',
      diagnose: `({url:location.href,body:document.body.innerText.slice(0,1200),focus:document.activeElement?.tagName})` });
    const results = [];
    for (const [width, height] of [[1440, 900], [390, 844]]) {
      await setViewport(cdp, { width, height, mobile: width < 1000 });
      await navigate(cdp, `http://127.0.0.1:${appPort}/`, 15000, { acceptBeforeUnload: true });
      await wait('!!document.querySelector("[data-board-snapshot=true]")');
      await evaluate(cdp, `(async () => {
        const url=${loadedModuleUrl.toString()};
        const {useGameStore:s}=await import(url('/src/store/gameStore.ts'));
        const {parseSgf}=await import(url('/src/utils/sgf.ts'));
        const {PRELOADED_GAMES}=await import(url('/src/data/preloadedGames.ts'));
        s.getState().loadGame(parseSgf(PRELOADED_GAMES[0].sgf));
        let node=s.getState().rootNode;
        for(let i=0;node&&i<=40;i++,node=node.children[0]) {
          const score=i%2?-5:0;
          node.analysis={rootScoreLead:score,rootWinRate:.5+score/100,rootVisits:1600,
            moves:[{x:0,y:0,order:0,visits:1200,winRate:.55,scoreLead:score+1,pointsLost:0,
              pv:Array.from({length:24},(_,k)=>String.fromCharCode(65+k%8)+(19-Math.floor(k/8)))}],
            territory:Array.from({length:19},()=>Array(19).fill(0))};
        }
        s.setState({analysisData:s.getState().currentNode.analysis??null,treeVersion:s.getState().treeVersion+1});
        s.getState().navigateStart();
        window.reportPrintReady=false;
        window.print=()=>{window.reportPrintReady=true};
      })()`);
      for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', { type, key: 'F3', code: 'F3', windowsVirtualKeyCode: 114 });
      await wait('!!document.querySelector("[aria-labelledby=game-report-title]")');
      await evaluate(cdp, `[...document.querySelectorAll('[aria-labelledby="game-report-title"] button')].find(b=>b.textContent.includes('Print / Save PDF')).click()`);
      await wait('window.reportPrintReady===true');
      await wait('document.querySelectorAll(".pdf-board").length===10&&[...document.querySelectorAll(".pdf-board")].every(i=>i.complete&&i.naturalWidth>0)');
      const printed = await cdp.send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true, displayHeaderFooter: false });
      assert.ok(printed.result?.data, JSON.stringify(printed.error));
      const pdf = Buffer.from(printed.result.data, 'base64');
      fs.writeFileSync(path.join(output, `${width}x${height}-report.pdf`), pdf);
      // Chrome writes page dictionaries outside compressed streams. Count
      // those objects rather than relying on an optional external PDF reader.
      const pages = [...pdf.toString('latin1').matchAll(/\/Type\s*\/Page\b/g)].length;
      assert.ok(pages >= 11 && pages <= 13, `Expected ten mistake pages and one to three summary pages, got ${pages}`);

      // Measure the actual print layout too: all 24 correction moves must
      // fit beside their board, rather than merely producing fewer pages.
      await cdp.send('Emulation.setEmulatedMedia', { media: 'print' });
      await setViewport(cdp, { width: 1032, height: 703, mobile: false });
      const layout = await evaluate(cdp, `(() => {
        const visible=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0};
        return {headerVisible:visible(document.querySelector('.game-report-modal-header')),
          mistakes:[...document.querySelectorAll('.pdf-mistake-page')].map(page=>{
            const r=page.getBoundingClientRect(),board=page.querySelector('.pdf-board').getBoundingClientRect();
            const moves=[...page.querySelectorAll('.pdf-tree-node')];
            return {moves:moves.length,complete:moves.every(e=>{const b=e.getBoundingClientRect();return b.top>=r.top&&b.bottom<=r.bottom&&b.right<=r.right}),
              boardFits:board.top>=r.top&&board.bottom<=r.bottom&&board.left>=r.left&&board.right<=r.right};
          })};
      })()`);
      assert.equal(layout.headerVisible, false, 'Screen chrome must not duplicate the printed title');
      assert.equal(layout.mistakes.length, 10);
      assert.ok(layout.mistakes.every(m=>m.moves===24&&m.complete&&m.boardFits), JSON.stringify(layout));
      await cdp.send('Emulation.setEmulatedMedia', { media: '' });
      results.push({ width, height, pages, mistakes: layout.mistakes.length, correctionMoves: 24 });
    }
    fs.writeFileSync(path.join(output, 'report-print.json'), JSON.stringify(results, null, 2));
    console.log(`Report print checks passed. PDFs: ${output}`);
    console.log(JSON.stringify(results));
  } finally {
    await closeBrowser(cdp, chrome);
    await server?.close();
    fs.rmSync(runDir, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
