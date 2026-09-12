import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import { evaluate, loadedModuleUrl, navigate, setViewport, sleep } from './browser.mjs';

// A toast in an inert, hidden board can have correct text while being invisible
// in Library. Use real file input and hit-test its actions on the active panel.
export async function assertLibraryImportFailures(cdp, appUrl, runDir, screenshotDir) {
  const zip = new JSZip();
  zip.file('Malformed.gib', 'INI 0 1 0\nSTO 0 1 1 19 3');
  zip.file('Encoding.sgf', '(;SZ[9]CA[Unsupported])');
  const zipPath = path.join(runDir, 'partial.zip');
  const preload = await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    localStorage.removeItem('web-katrain:auto_saved_game:v1');
    localStorage.setItem('web-katrain:mobile_home_dismissed:v1', 'true');
    localStorage.setItem('web-katrain:library_open:v1', 'true');
    localStorage.setItem('web-katrain:settings:v3', JSON.stringify({soundEnabled:false, loadSgfFastAnalysis:false}));
  ` });
  const errors = [];
  const unsubscribe = cdp.on((message) => {
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
  });
  const wait = async (expression) => {
    for (let i = 0; i < 100; i++) {
      const value = await evaluate(cdp, expression);
      if (value) return value;
      await sleep(100);
    }
    throw new Error(`Library import check timed out: ${expression}`);
  };
  const click = async (selector) => {
    const point = await wait(`(()=>{
      const e=document.querySelector(${JSON.stringify(selector)});
      if(!e)return false;
      const r=e.getBoundingClientRect(), x=r.x+r.width/2, y=r.y+r.height/2;
      return r.width&&r.height&&!e.closest('[inert]')&&e.contains(document.elementFromPoint(x,y))?{x,y}:false;
    })()`);
    for (const type of ['mousePressed', 'mouseReleased']) {
      await cdp.send('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 });
    }
  };
  try {
    for (const [width, height] of [[1440, 900], [390, 844], [320, 568]]) {
      try {
        zip.file('Kept.sgf', `(;SZ[9]CA[UTF-8]PB[Archive browser check ${width}];B[cc])`);
        fs.writeFileSync(zipPath, await zip.generateAsync({ type: 'nodebuffer' }));
        await setViewport(cdp, { width, height, mobile: width < 1000 });
        await navigate(cdp, appUrl);
        await wait('!!document.querySelector("[data-board-snapshot=true]")');
        if (width < 1000) await click('#mobile-tab-library');
        await wait('!!document.querySelector("input[type=file][multiple]")');
        const root = (await cdp.send('DOM.getDocument')).result.root;
        const input = (await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[type=file][multiple]' })).result.nodeId;
        const fileSelection = await cdp.send('DOM.setFileInputFiles', { nodeId: input, files: [zipPath] });
        assert.ok(!fileSelection.error, JSON.stringify(fileSelection.error));
        await wait(`document.querySelector('.notification-toast-error')?.textContent.includes('Imported 1 file. Skipped 2 archive games.')`);
        await sleep(200); // finish the toast's entry animation before measuring
        const result = await evaluate(cdp, `(()=>{
          const toast=document.querySelector('.notification-toast');
          const r=toast.getBoundingClientRect();
          return {message:toast.textContent,inert:!!toast.closest('[inert]'),left:r.left,right:r.right,top:r.top,bottom:r.bottom};
        })()`);
        assert.ok(result.message.includes('partial.zip/Encoding.sgf') && result.message.includes('Unsupported SGF character encoding'), result.message);
        assert.ok(!result.inert && result.left >= 0 && result.right <= width && result.top >= 0 && result.bottom <= height,
          `Library notification at ${width}x${height}: ${JSON.stringify(result)}`);
        const hasGame = await wait(`(async()=>{
          const moduleUrl=${loadedModuleUrl.toString()};
          const {loadLibrary}=await import(moduleUrl('/src/utils/library.ts'));
          return (await loadLibrary()).some(item=>item.type==='file'&&item.metadata.black===${JSON.stringify('Archive browser check ' + width)});
        })()`);
        assert.ok(hasGame);
        await click('.notification-toast button[aria-label="Copy notification"]');
        await wait(`!!document.querySelector('.notification-toast button[aria-label="Notification copied"]')`);
        await click('.notification-toast button[aria-label="Dismiss notification"]');
        await wait('!document.querySelector(".notification-toast")');
      } finally {
        const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(screenshotDir, `${width}x${height}-library-import.png`), Buffer.from(screenshot.result.data, 'base64'));
      }
    }
    assert.deepEqual(errors, []);
  } finally {
    unsubscribe();
    await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: preload.result.identifier });
  }
}
