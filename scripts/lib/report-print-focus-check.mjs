import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { captureHistoryEntry, waitForHistoryEntry, evaluate, navigate, setViewport, waitForExpression } from './browser.mjs';

export async function assertReportPrintFocus(cdp, appUrl, runDir, screenshotDir) {
  const fixture = path.join(runDir, 'print-focus.sgf');
  fs.writeFileSync(fixture, '(;GM[1]SZ[9]GN[Print keyboard study];B[dd];W[ff])');
  let mobile = false;
  const reports = [];
  const wait = expression => waitForExpression(cdp, expression, { label: 'Report print keyboard focus',
    diagnose: `({focus:document.activeElement?.outerHTML.slice(0,250),calls:window.reportPrintCalls,held:window.reportHeldFrames?.size,report:!!document.querySelector('[aria-labelledby=game-report-title]'),history:history.state})` });
  const key = async (key, code, windowsVirtualKeyCode, modifiers = 0) => {
    for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode, modifiers });
  };
  const click = async (selector, text) => {
    const point = await wait(`(()=>{
      const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>${text ? `e.textContent.trim()===${JSON.stringify(text)}` : 'true'});
      if(!e||e.disabled)return false;e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
      return e.contains(document.elementFromPoint(x,y))?{x,y}:false;
    })()`);
    if (mobile) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else for (const type of ['mousePressed', 'mouseReleased']) {
      await cdp.send('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 });
    }
  };
  const report = '[aria-labelledby=game-report-title]';
  const inside = `document.querySelector('${report}').contains(document.activeElement)`;
  const open = async () => {
    await key('k', 'KeyK', 75, 2);await click('[data-command-palette-search]');
    await cdp.send('Input.insertText', { text: 'Open game report' });await click('[data-command-palette-item=game-report]');
    await wait(`!!document.querySelector('${report}')`);
  };
  const holdFrames = () => evaluate(cdp, `(()=>{
    window.reportNativeFrame=requestAnimationFrame;window.reportNativeCancel=cancelAnimationFrame;
    window.reportHeldFrames=new Map();let next=1000000000;
    window.requestAnimationFrame=callback=>{const id=next++;reportHeldFrames.set(id,callback);return id};
    window.cancelAnimationFrame=id=>{if(!reportHeldFrames.delete(id))reportNativeCancel(id)};
  })()`);
  const releaseFrames = () => evaluate(cdp, `(async()=>{
    window.requestAnimationFrame=reportNativeFrame;window.cancelAnimationFrame=reportNativeCancel;
    const frames=[...reportHeldFrames.values()];reportHeldFrames.clear();for(const callback of frames)callback(performance.now());
    await new Promise(resolve=>reportNativeFrame(()=>reportNativeFrame(()=>reportNativeFrame(()=>resolve(true)))));
  })()`);
  const prepare = async () => {
    await holdFrames();await click('.game-report-modal-footer button', 'Print / Save PDF');
    await wait(`reportHeldFrames.size>0&&document.querySelector('${report}').getAttribute('aria-busy')==='true'`);
    assert.equal(await evaluate(cdp, inside), true, 'Disabling Print must keep focus inside the report');
  };
  const board = () => evaluate(cdp, `(()=>{const d=document.querySelector('[data-board-snapshot]').dataset;return {size:d.boardSize,moves:d.boardMoveCount,stones:d.boardStones}})()`);
  for (const [width, height] of [[1440, 900], [390, 844], [320, 568], [568, 320]]) {
    mobile = width !== 1440;
    const setup = await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
      localStorage.removeItem('web-katrain:auto_saved_game:v1');localStorage.removeItem('web-katrain:shortcuts:v1');
      localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
      localStorage.setItem('web-katrain:settings:v3',JSON.stringify({soundEnabled:false,loadSgfFastAnalysis:false}));
    ` });
    try { await setViewport(cdp, { width, height, mobile });await navigate(cdp, appUrl, 15000, { acceptBeforeUnload: true }); }
    finally { await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: setup.result.identifier }); }
    await wait('!!document.querySelector("[data-board-snapshot]")');
    const root = (await cdp.send('DOM.getDocument')).result.root;
    const input = (await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[type=file][accept^=".sgf"]:not([multiple])' })).result.nodeId;
    await cdp.send('DOM.setFileInputFiles', { nodeId: input, files: [fixture] });
    await wait('document.querySelector("[data-board-snapshot]").dataset.boardSize==="9"');
    const original = await board(), entryHistory = await captureHistoryEntry(cdp);
    await evaluate(cdp, 'window.reportPrintCalls=0;window.print=()=>{reportPrintCalls++}');await open();
    await prepare();
    for (const modifiers of [0, 8, 0, 8]) {
      await key('Tab', 'Tab', 9, modifiers);assert.equal(await evaluate(cdp, inside), true, 'Tab navigation during preparation must remain in the report');
    }
    await evaluate(cdp, 'window.reportChosenFocus=document.activeElement;void 0');
    await releaseFrames();await wait('reportPrintCalls===1');
    assert.equal(await evaluate(cdp, 'document.activeElement===reportChosenFocus'), true, 'Printing must preserve a control chosen while waiting');
    await prepare();await releaseFrames();await wait('reportPrintCalls===2');
    assert.equal(await evaluate(cdp, `document.activeElement?.textContent.trim()==='Print / Save PDF'`), true, 'Returning from print must restore its button when focus was on the pending container');
    await prepare();await key('Escape', 'Escape', 27);
    await waitForHistoryEntry(cdp, entryHistory, `!document.querySelector('${report}')`);
    await releaseFrames();assert.equal(await evaluate(cdp, 'reportPrintCalls'), 2, 'A dismissed report must never open the delayed print dialog');
    await open();await prepare();await releaseFrames();await wait('reportPrintCalls===3');
    assert.equal(await evaluate(cdp, inside), true, 'A fresh report must still print after cancellation');
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(screenshotDir, `report-print-focus-${width}x${height}.png`), Buffer.from(shot.result.data, 'base64'));
    await click('.game-report-modal-footer button', 'Done');
    await waitForHistoryEntry(cdp, entryHistory, `!document.querySelector('${report}')`);
    assert.deepEqual(await board(), original);
    reports.push({ width, height, pendingFocus: true, tabsContained: true, chosenFocusPreserved: true, printFocusRestored: true, dismissedPrintCancelled: true, freshRetry: true, gameUnchanged: true });
    console.log('Report print focus', JSON.stringify(reports.at(-1)));
  }
  fs.writeFileSync(path.join(screenshotDir, 'report-print-focus.json'), JSON.stringify(reports, null, 2));
}
