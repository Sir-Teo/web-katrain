import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromePath, chromeTarget, closeBrowser, connectDevtools, evaluate, freePort, navigate, setViewport, waitForExpression } from './browser.mjs';

// A dedicated browser supplies a synthetic camera; the main viewport browser
// keeps its normal device/permission settings and timing behavior.
export async function assertCameraCaptureFocus(appUrl, runDir, screenshotDir) {
  const profile = fs.mkdtempSync(path.join(runDir, 'camera-focus-'));
  const port = await freePort();
  const ciFlags = process.env.CI ? ['--no-sandbox', '--disable-dev-shm-usage'] : [];
  const chrome = spawn(chromePath, ['--headless=new', ...ciFlags,
    '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
  let cdp;
  try {
    cdp = connectDevtools(await chromeTarget(port));
    await cdp.ready;
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    const wait = expression => waitForExpression(cdp, expression, { label: 'Camera capture focus' });
    const key = async (key, code, windowsVirtualKeyCode, modifiers = 0) => {
      for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', {
        type, key, code, windowsVirtualKeyCode, modifiers,
        ...(type === 'keyDown' && key === 'Enter' ? { text: '\r' } : {}),
      });
    };
    const click = async selector => {
      const point = await wait(`(() => {
        const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)return false;
        e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
        return r.width&&e.contains(document.elementFromPoint(x,y))?{x,y}:false;
      })()`);
      for (const type of ['mousePressed', 'mouseReleased']) await cdp.send('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 });
    };
    const settle = () => evaluate(cdp, 'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    const camera = '[data-camera-capture-modal]';
    const source = () => evaluate(cdp, `({
      name:document.querySelector('[data-photo-board-source-name]')?.textContent.trim(),
      image:document.querySelector('[data-photo-board-aligner] img')?.getAttribute('src'),
    })`);
    const stopped = () => wait('cameraAuditStreams.length>0&&cameraAuditStreams.every(stream=>stream.getTracks().every(track=>track.readyState==="ended"))');
    const openCamera = async () => {
      await click('[data-photo-board-live-camera=true]');
      await wait('document.querySelector("[data-camera-capture-video]")?.readyState>=2&&!document.querySelector("[data-camera-capture-shutter]").disabled');
    };
    const holdCapture = async () => {
      await click('[data-camera-capture-shutter]');
      await wait('cameraEncodingHeld.length>0');
      assert.equal(await evaluate(cdp, `document.querySelector('${camera}').contains(document.activeElement)`), true, 'Encoding must retain camera-dialog focus');
      assert.equal(await evaluate(cdp, `document.querySelector('${camera}').getAttribute('aria-busy')`), 'true');
    };
    const reports = [];
    for (const [width, height] of [[1440, 900], [390, 844], [320, 568], [568, 320]]) {
      const setup = await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
        localStorage.removeItem('web-katrain:auto_saved_game:v1');
        localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');
        localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
        localStorage.setItem('web-katrain:settings:v3',JSON.stringify({soundEnabled:false,loadSgfFastAnalysis:false}));
      ` });
      try {
        await setViewport(cdp, { width, height, mobile: width !== 1440 });
        await navigate(cdp, appUrl, 15000, { acceptBeforeUnload: true });
      } finally { await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: setup.result.identifier }); }
      await wait('!!document.querySelector("[data-board-snapshot]")');
      const board = await evaluate(cdp, `(() => {const d=document.querySelector('[data-board-snapshot]').dataset;
        return{size:d.boardSize,stones:d.boardStones,moves:d.boardMoveCount,player:d.boardCurrentPlayer};})()`);
      await key('k', 'KeyK', 75, 2);
      await click('[data-command-palette-item=photo-board]');
      await wait('!!document.querySelector("[data-photo-board-live-camera=true]")');
      await evaluate(cdp, `(() => {
        window.cameraAuditStreams=[];window.cameraEncodingHeld=[];
        const get=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia=(...args)=>get(...args).then(stream=>{cameraAuditStreams.push(stream);return stream});
        const encode=HTMLCanvasElement.prototype.toBlob;
        HTMLCanvasElement.prototype.toBlob=function(callback,...args){
          if(!document.querySelector('[data-camera-capture-modal]'))return encode.call(this,callback,...args);
          encode.call(this,blob=>cameraEncodingHeld.push({size:blob?.size??0,release:value=>callback(value===undefined?blob:value)}),...args);
        };
      })()`);
      await openCamera();
      await holdCapture();
      assert.ok(await evaluate(cdp, 'cameraEncodingHeld[0].size>0'), 'The real encoder must produce JPEG bytes');
      for (const modifiers of [0, 8]) for (let index = 0; index < 4; index++) {
        await key('Tab', 'Tab', 9, modifiers);
        assert.equal(await evaluate(cdp, `document.querySelector('${camera}').contains(document.activeElement)`), true, 'Tab and Shift+Tab must stay in the camera');
      }
      await evaluate(cdp, 'cameraEncodingHeld.shift().release();void 0');
      await wait('!document.querySelector("[data-camera-capture-modal]")&&!!document.querySelector("[data-photo-board-source-name]")');
      await stopped();
      await wait('document.activeElement===document.querySelector("[data-photo-board-live-camera=true]")');
      const captured = await source();
      assert.ok(captured.name.endsWith('.jpg'));
      assert.ok(captured.image?.startsWith('blob:'));
      // Encoding failure exposes its error and an enabled recovery action.
      for (const chosenClose of [false, true]) {
        await openCamera();
        await holdCapture();
        if (chosenClose) {
          await key('Tab', 'Tab', 9);
          assert.equal(await evaluate(cdp, 'document.activeElement?.getAttribute("aria-label")==="Close camera"'), true);
        }
        await evaluate(cdp, 'cameraEncodingHeld.shift().release(null);void 0');
        await wait('!!document.querySelector("[data-camera-capture-error]")');
        assert.equal(await evaluate(cdp, `document.querySelector('${camera}').getAttribute('aria-busy')`), 'false');
        assert.equal(await evaluate(cdp, `document.activeElement===document.querySelector(${JSON.stringify(chosenClose ? '[aria-label="Close camera"]' : '[data-camera-capture-modal] > div > .ui-bar:last-child button:first-child')})`), true);
        assert.deepEqual(await source(), captured, 'An encoding failure must retain the previous photo');
        await key('Enter', 'Enter', 13);
        await wait('!document.querySelector("[data-camera-capture-modal]")');
        await stopped();
      }
      // A dismissed capture must not replace the source or close a newly opened camera.
      await openCamera();
      await holdCapture();
      await key('Escape', 'Escape', 27);
      await wait('!document.querySelector("[data-camera-capture-modal]")');
      await stopped();
      await openCamera();
      await evaluate(cdp, 'cameraEncodingHeld.shift().release();void 0');
      await settle();
      assert.equal(await evaluate(cdp, `!!document.querySelector('${camera}')`), true, 'A late old capture must leave the new camera open');
      assert.deepEqual(await source(), captured);
      await click('[aria-label="Close camera"]');
      await wait('!document.querySelector("[data-camera-capture-modal]")');
      await stopped();
      assert.deepEqual(await evaluate(cdp, `(() => {const d=document.querySelector('[data-board-snapshot]').dataset;
        return{size:d.boardSize,stones:d.boardStones,moves:d.boardMoveCount,player:d.boardCurrentPlayer};})()`), board);
      fs.writeFileSync(path.join(screenshotDir, `${width}x${height}-camera-photo.png`), Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'));
      reports.push({ width, height, pendingTabsContained: true, successReturnsFocus: true, streamsStopped: true,
        errorRecoveryFocused: true, chosenFocusPreserved: true, lateCaptureRejectedAfterReopen: true, gameUnchanged: true });
      console.log('Camera capture focus', JSON.stringify(reports.at(-1)));
    }
    fs.writeFileSync(path.join(screenshotDir, 'camera-capture-focus.json'), JSON.stringify(reports, null, 2));
  } finally { await closeBrowser(cdp, chrome); }
}
