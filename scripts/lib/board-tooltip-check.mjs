import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evaluate, loadedModuleUrl, setViewport, sleep, waitForExpression } from './browser.mjs';

// Drive the real board with a deterministic analysis result. Neural inference
// is independent of whether its hover card covers the variation being read.
export async function assertBoardTooltipsFit(cdp, screenshotDir) {
  await evaluate(cdp, `(async () => {
    const url = ${loadedModuleUrl.toString()};
    window.tooltipCheckStore = (await import(url('/src/store/gameStore.ts'))).useGameStore;
    tooltipCheckStore.getState().startNewGame({boardSize:19,komi:6.5,rules:'japanese',handicap:0});
    tooltipCheckStore.getState().updateSettings({soundEnabled:false, analysisShowHints:true, analysisShowOwnership:false});
  })()`);
  const reports = [];
  for (const [width, height] of [[1440, 900], [1024, 768], [1024, 500]]) {
    await setViewport(cdp, { width, height, mobile: false });
    await sleep(150);
    for (const [x, y] of [[3, 15], [15, 3]]) {
      await evaluate(cdp, `(() => {
        const move = {x:${x},y:${y},winRate:.56,scoreLead:1.5,pointsLost:0,order:0,visits:1200,
          scoreStdev:8,relativePointsLost:0,winRateLost:0,lcb:.54,prior:.24,humanPrior:.15,
          pv:['D4','Q16','D16','Q4','C6','R6','C14','R14','G3','N17','G17','N3']};
        const analysis = {rootWinRate:.55,rootScoreLead:1.2,rootVisits:1600,moves:[move],
          territory:Array.from({length:19},()=>Array(19).fill(0))};
        tooltipCheckStore.getState().currentNode.analysis = analysis;
        tooltipCheckStore.setState({analysisData:analysis,isAnalysisMode:true,treeVersion:tooltipCheckStore.getState().treeVersion+1});
      })()`);
      await sleep(100);
      const point = await evaluate(cdp, `(() => {
        const b=document.querySelector('[data-board-snapshot=true]'),r=b.getBoundingClientRect();
        return {x:r.x+Number(b.dataset.boardOriginX)+${x}*Number(b.dataset.boardCellSize),
          y:r.y+Number(b.dataset.boardOriginY)+${y}*Number(b.dataset.boardCellSize)};
      })()`);
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
      await waitForExpression(cdp, `!!document.querySelector('[data-board-tooltip="candidate"]')`, { label: 'Board tooltip' });
      await sleep(50);
      const report = await evaluate(cdp, `(() => {
        const t=document.querySelector('[data-board-tooltip="candidate"]'),b=document.querySelector('[data-board-snapshot=true]');
        const r=t.getBoundingClientRect(),board=b.getBoundingClientRect(),stage=b.closest('.board-stage').getBoundingClientRect();
        return {region:t.dataset.boardTooltipRegion,text:t.innerText,
          overlapsBoard:r.right>board.left&&r.left<board.right&&r.bottom>board.top&&r.top<board.bottom,
          fits:r.left>=stage.left&&r.right<=stage.right&&r.top>=stage.top&&r.bottom<=stage.bottom};
      })()`);
      assert.ok(report.fits, `${width}x${height} tooltip must stay readable inside the board stage`);
      assert.ok(report.text.includes('Human: 15.0%') && report.text.includes('N3'), 'The complete statistics and PV must remain visible');
      if (width === 1440) {
        assert.equal(report.region, 'gutter');
        assert.equal(report.overlapsBoard, false, 'A side margin must keep hover details clear of every preview stone');
      }
      reports.push({ width, height, x, y, ...report });
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(screenshotDir, `${width}x${height}-tooltip-${x}-${y}.png`), Buffer.from(shot.result.data, 'base64'));
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 1 });
    }
  }
  fs.writeFileSync(path.join(screenshotDir, 'board-tooltips.json'), JSON.stringify(reports, null, 2));
  console.log('Board tooltips: both side margins, compact fallback, complete statistics, and resize passed.');
}
