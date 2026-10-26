import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evaluate, navigate, setViewport, waitForExpression } from './browser.mjs';

export async function assertPhotoTraceRaces(cdp, appUrl, runDir, screenshotDir) {
  const wait = (expression) => waitForExpression(cdp, expression, { label: 'Photo trace requests' });
  let mobile = false;
  const click = async (selector, text) => {
    const point = await wait(`(() => {
      const e = [...document.querySelectorAll(${JSON.stringify(selector)})]
        .find(e => ${text ? `e.textContent.includes(${JSON.stringify(text)})` : 'true'});
      if (!e || e.disabled) return false;
      e.scrollIntoView({ block: 'center' });
      const r = e.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
      return r.width && e.contains(document.elementFromPoint(x, y)) ? { x, y } : false;
    })()`);
    if (mobile) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      for (const type of ['mousePressed', 'mouseReleased']) {
        await cdp.send('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 });
      }
    }
  };
  const choose = async (file) => {
    const root = (await cdp.send('DOM.getDocument')).result.root;
    const node = (await cdp.send('DOM.querySelector', {
      nodeId: root.nodeId, selector: '[aria-labelledby=photo-board-title] input[type=file]',
    })).result.nodeId;
    await cdp.send('DOM.setFileInputFiles', { nodeId: node, files: [file] });
  };
  const panel = async (name) => {
    if (mobile) await click(`[data-photo-board-mobile-tab=${name}]`);
  };
  const traceState = () => evaluate(cdp, `({
    points: document.querySelectorAll('[data-photo-board-point]').length,
    stones: [...document.querySelectorAll('[data-photo-board-point]')].filter(e => !e.getAttribute('aria-label').endsWith('empty')).map(e => e.getAttribute('aria-label')),
  })`);
  const hold = async () => {
    await panel('trace');
    await click('[data-photo-board-auto-trace]');
    await wait('photoTraceHeld.length > 0');
  };
  const release = async (count = 1) => {
    await evaluate(cdp, `photoTraceHeld.splice(0, ${count}).forEach(release => release()); void 0`);
    await evaluate(cdp, 'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  };
  const reports = [];
  for (const width of [1440, 390]) {
    mobile = width === 390;
    const setup = await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
      localStorage.removeItem('web-katrain:auto_saved_game:v1');
      localStorage.setItem('web-katrain:mobile_home_dismissed:v1', 'true');
      localStorage.setItem('web-katrain:pwa-install-dismissed:v1', 'true');
    ` });
    try {
      await setViewport(cdp, { width, height: mobile ? 844 : 900, mobile });
      await navigate(cdp, appUrl, 15000, { acceptBeforeUnload: true });
    } finally {
      await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: setup.result.identifier });
    }
    await wait('!!document.querySelector("[data-board-snapshot]")');
    if (mobile) {
      await click('[aria-label=Menu]');
      await click('[aria-label="Open photo board"]');
    } else {
      await click('[aria-label="More file actions"]');
      await click('button', 'Board from photo');
    }
    await wait('!!document.querySelector("[aria-labelledby=photo-board-title]")');
    const images = await evaluate(cdp, `(() => ['black', 'white'].map(color => {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 380;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#d6ad68'; ctx.fillRect(0, 0, 380, 380);
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(190, 190, 10, 0, Math.PI * 2); ctx.fill();
      return canvas.toDataURL('image/png').split(',')[1];
    }))()`);
    const photos = images.map((data, i) => {
      const file = path.join(runDir, `trace-${i}.png`);
      fs.writeFileSync(file, Buffer.from(data, 'base64'));
      return file;
    });
    const unsupported = path.join(runDir, 'unsupported.svg');
    fs.writeFileSync(unsupported, '<svg xmlns="http://www.w3.org/2000/svg"/>');
    await choose(photos[0]);
    await wait('!!document.querySelector("[data-photo-board-corner]")');
    await evaluate(cdp, `(() => {
      window.photoTraceOriginalImage = window.Image;
      window.photoTraceHeld = [];
      window.Image = function(...args) {
        const image = new photoTraceOriginalImage(...args);
        Object.defineProperty(image, 'onload', { set(fn) {
          image.addEventListener('load', event => photoTraceHeld.push(() => fn.call(image, event)), { once: true });
        } });
        return image;
      };
    })()`);
    try {
      await hold();
      await panel('photo');
      await evaluate(cdp, `(() => {
        const select = [...document.querySelectorAll('[aria-labelledby=photo-board-title] select')].find(e => [...e.options].some(o => o.value === '9'));
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, '9');
        select.dispatchEvent(new Event('change', { bubbles: true }));
      })()`);
      await wait('document.querySelectorAll("[data-photo-board-point]").length===81');
      await release();
      assert.deepEqual(await traceState(), { points: 81, stones: [] });
      await hold();
      await click('[data-photo-board-index="0"]');
      await wait(`document.querySelector('[data-photo-board-index="0"]').getAttribute('aria-label').endsWith('black')`);
      await evaluate(cdp, `document.querySelector('[data-photo-board-index="0"]').focus(); void 0`);
      for (const expected of ['empty', 'black']) {
        for (const type of ['keyDown', 'keyUp']) {
          await cdp.send('Input.dispatchKeyEvent', {
            type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13,
            ...(type === 'keyDown' ? { text: '\r' } : {}),
          });
        }
        await wait(`document.querySelector('[data-photo-board-index="0"]').getAttribute('aria-label').endsWith('${expected}')`);
      }
      const manual = await traceState();
      assert.equal(manual.stones.length, 1);
      // Retry while the old request is still held. Its completion must leave
      // the current request busy and the manually placed stone untouched.
      await hold();
      await wait('photoTraceHeld.length===2');
      await release();
      assert.deepEqual(await traceState(), manual);
      assert.equal(await evaluate(cdp, 'document.querySelector("[data-photo-board-auto-trace]").disabled'), true);
      await release();
      await wait("document.querySelector('[data-photo-board-auto-trace-status]')?.textContent.includes('Auto traced')");
      assert.equal((await traceState()).stones.length, 1);
      await hold();
      await click('[data-photo-board-clear]');
      await release();
      assert.deepEqual(await traceState(), { points: 81, stones: [] });
      await hold();
      await evaluate(cdp, `(() => {
        const input = document.querySelector('[data-photo-board-auto-trace-sensitivity]');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '60');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      })()`);
      await wait('document.querySelector("[data-photo-board-auto-trace]").disabled===false');
      await release();
      assert.deepEqual(await traceState(), { points: 81, stones: [] });
      await hold();
      await panel('photo');
      await choose(photos[1]);
      await wait("document.querySelector('[data-photo-board-source-name]')?.textContent.includes('trace-1.png')");
      await release();
      assert.deepEqual(await traceState(), { points: 81, stones: [] });
      await wait('!!document.querySelector("[data-photo-board-corner]")');
      await hold();
      await click('[data-photo-board-reset-corners]');
      await release();
      assert.deepEqual(await traceState(), { points: 81, stones: [] });
      await panel('photo');
      const photoState = () => evaluate(cdp, `({
        source: document.querySelector('[data-photo-board-aligner] img').src,
        name: document.querySelector('[data-photo-board-source-name]').textContent,
        corners: [...document.querySelectorAll('[data-photo-board-corner]')].map(e => [e.style.left, e.style.top]),
      })`);
      const valid = await photoState();
      await choose(unsupported);
      await wait("document.querySelector('[data-photo-board-photo-error]')?.textContent.includes('Board photos must be')");
      assert.deepEqual(await photoState(), valid);
      await evaluate(cdp, `(() => {
        window.photoTraceCreateUrl = URL.createObjectURL;
        URL.createObjectURL = () => { throw new Error('Allocation failed'); };
      })()`);
      try {
        await choose(photos[0]);
        await wait("document.querySelector('[data-photo-board-photo-error]')?.textContent.includes('Photo preview is unavailable')");
        assert.deepEqual(await photoState(), valid);
      } finally {
        await evaluate(cdp, 'URL.createObjectURL = photoTraceCreateUrl; void 0');
      }
      const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(screenshotDir, `photo-trace-races-${width}.png`), Buffer.from(screenshot.result.data, 'base64'));
    } finally {
      await evaluate(cdp, 'window.Image = photoTraceOriginalImage; void 0');
    }
    await click('[aria-label="Close photo board"]');
    await wait('!document.querySelector("[aria-labelledby=photo-board-title]") && !history.state?.webKatrainOverlay');
    reports.push({ width, staleSizeManualRetryClearSensitivityAndSourceResultsRejected: true, failedPhotoSelectionPreservesSourceAndAlignment: true });
  }
  fs.writeFileSync(path.join(screenshotDir, 'photo-trace-races.json'), JSON.stringify(reports, null, 2));
  console.log('Photo trace: late size/manual/retry/clear/sensitivity/source results rejected; invalid photos and URL failures retain the source and alignment on desktop/phone.');
}
