import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evaluate, loadedModuleUrl, navigate, setViewport, waitForExpression } from './browser.mjs';

export async function assertModelReplacement(cdp, appUrl, runDir, screenshotDir) {
  const fixture = path.join(runDir, 'replacement.bin.gz');
  fs.writeFileSync(fixture, 'replacement weights fixture');
  const wait = (expression) => waitForExpression(cdp, expression, { label: 'Model replacement' });
  const click = async (selector, text) => {
    const point = await wait(`(() => {
      const e = [...document.querySelectorAll(${JSON.stringify(selector)})]
        .find(e => ${text ? `e.textContent.includes(${JSON.stringify(text)})` : 'true'});
      if (!e) return false;
      e.scrollIntoView({ block: 'center' });
      const r = e.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
      return r.width && e.contains(document.elementFromPoint(x, y)) ? { x, y } : false;
    })()`);
    for (const type of ['mousePressed', 'mouseReleased']) {
      await cdp.send('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 });
    }
  };
  const reports = [];
  for (const width of [1440, 390]) {
    const setup = await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
      performance.setResourceTimingBufferSize(5000);
      localStorage.removeItem('web-katrain:auto_saved_game:v1');
      localStorage.setItem('web-katrain:mobile_home_dismissed:v1', 'true');
      localStorage.setItem('web-katrain:pwa-install-dismissed:v1', 'true');
    ` });
    try {
      await setViewport(cdp, { width, height: width === 390 ? 844 : 900, mobile: width === 390 });
      await navigate(cdp, appUrl, 15000, { acceptBeforeUnload: true });
    } finally {
      await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: setup.result.identifier });
    }
    await wait('!!document.querySelector("[data-board-snapshot]")');
    await evaluate(cdp, `(() => {
      document.activeElement?.blur();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F8', bubbles: true }));
    })()`);
    await click('#tab-ai');
    const previous = await evaluate(cdp, `(async () => {
      const url = ${loadedModuleUrl.toString()};
      window.modelReplacementApi = await import(url('/src/utils/modelUpload.ts'));
      const { useGameStore } = await import(url('/src/store/gameStore.ts'));
      window.modelReplacementStore = useGameStore;
      window.modelReplacementFetch = window.fetch.bind(window);
      const file = new File(['previous weights fixture'], 'previous.bin.gz');
      const previousUrl = modelReplacementApi.createUploadedModelUrl(file, useGameStore.getState().settings.katagoModelUrl);
      useGameStore.getState().updateSettings({ katagoModelUrl: previousUrl });
      await modelReplacementApi.savePersistedUploadedModel(file);
      window.modelReplacementPrevious = previousUrl;
      return { url: previousUrl, info: modelReplacementApi.getUploadedModelInfo() };
    })()`);
    await click('button', 'Official model downloads');
    for (const failure of ['http', 'cors']) {
      await evaluate(cdp, `(() => {
        window.fetch = (url, ...args) => String(url).startsWith('https://media.katagotraining.org')
          ? ${failure === 'http' ? "Promise.resolve(new Response('unavailable', { status: 503 }))" : "Promise.reject(new TypeError('Failed to fetch'))"}
          : modelReplacementFetch(url, ...args);
      })()`);
      await click('button[aria-label^="Download and load"]');
      await wait(`document.querySelector('#panel-ai').textContent.includes(${JSON.stringify(failure === 'http' ? '503' : 'Download blocked by the browser')})`);
      const state = await evaluate(cdp, `(async () => ({
        selected: modelReplacementStore.getState().settings.katagoModelUrl,
        text: await (await modelReplacementFetch(modelReplacementPrevious)).text(),
        info: modelReplacementApi.getUploadedModelInfo(),
      }))()`);
      assert.equal(state.selected, previous.url);
      assert.equal(state.text, 'previous weights fixture');
      assert.deepEqual(state.info, previous.info);
    }
    await evaluate(cdp, `(() => {
      window.fetch = modelReplacementFetch;
      window.modelReplacementCreateUrl = URL.createObjectURL;
      URL.createObjectURL = () => { throw new Error('Allocation failed'); };
    })()`);
    try {
      const root = (await cdp.send('DOM.getDocument')).result.root;
      // The ordinary weights input follows its Upload Weights control; identify
      // it independently of whether the optional human-model input is mounted.
      const input = await evaluate(cdp, `(() => {
        const button = [...document.querySelectorAll('#panel-ai button')].find(e => e.textContent.trim() === 'Upload Weights');
        button.parentElement.parentElement.querySelector('input[type=file]').id = 'model-replacement-input';
        return true;
      })()`);
      assert.equal(input, true);
      const uploadNode = (await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#model-replacement-input' })).result.nodeId;
      assert.ok(uploadNode);
      await cdp.send('DOM.setFileInputFiles', { nodeId: uploadNode, files: [fixture] });
      await wait("document.querySelector('#panel-ai').textContent.includes('Browser object URLs are unavailable')");
      const restored = await evaluate(cdp, 'modelReplacementApi.restorePersistedUploadedModelUrl(modelReplacementPrevious)');
      assert.equal(restored, null);
      const state = await evaluate(cdp, `(async () => ({
        selected: modelReplacementStore.getState().settings.katagoModelUrl,
        text: await (await modelReplacementFetch(modelReplacementPrevious)).text(),
        info: modelReplacementApi.getUploadedModelInfo(),
        persisted: (await modelReplacementApi.loadPersistedUploadedModel()).name,
      }))()`);
      assert.equal(state.selected, previous.url);
      assert.equal(state.text, 'previous weights fixture');
      assert.deepEqual(state.info, previous.info);
      assert.equal(state.persisted, 'previous.bin.gz');
    } finally {
      await evaluate(cdp, 'URL.createObjectURL = modelReplacementCreateUrl; void 0');
    }
    const root = (await cdp.send('DOM.getDocument')).result.root;
    const input = (await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#model-replacement-input' })).result.nodeId;
    await cdp.send('DOM.setFileInputFiles', { nodeId: input, files: [fixture] });
    await wait("document.querySelector('[data-katago-uploaded-model-summary]')?.textContent.includes('replacement.bin.gz')");
    const result = await evaluate(cdp, `(async () => ({
      oldAvailable: await modelReplacementFetch(modelReplacementPrevious).then(() => true).catch(() => false),
      newText: await (await modelReplacementFetch(modelReplacementStore.getState().settings.katagoModelUrl)).text(),
      persisted: (await modelReplacementApi.loadPersistedUploadedModel()).name,
    }))()`);
    assert.equal(result.oldAvailable, false);
    assert.equal(result.newText, 'replacement weights fixture');
    assert.equal(result.persisted, 'replacement.bin.gz');
    const selectedBeforeDownload = await evaluate(cdp, 'modelReplacementStore.getState().settings.katagoModelUrl');
    await evaluate(cdp, `(() => {
      window.modelDownloadRequests = [];
      window.fetch = (url, ...args) => {
        if (!String(url).startsWith('https://media.katagotraining.org')) return modelReplacementFetch(url, ...args);
        return new Promise((resolve, reject) => modelDownloadRequests.push({ signal: args[0]?.signal, resolve, reject }));
      };
    })()`);
    try {
      await click('button[aria-label^="Download and load"]');
      await wait('modelDownloadRequests.length===1');
      const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(screenshotDir, `model-download-${width}.png`), Buffer.from(screenshot.result.data, 'base64'));
      await click('button[aria-label^="Cancel download of"]');
      await wait(`!!document.querySelector('button[aria-label^="Download and load"]:not(:disabled)')`);
      await wait('document.activeElement.getAttribute("aria-label")?.startsWith("Download and load")');
      assert.equal(await evaluate(cdp, 'modelDownloadRequests[0].signal.aborted'), true);
      assert.equal(await evaluate(cdp, 'document.activeElement.getAttribute("aria-label").startsWith("Download and load")'), true);
      await click('button[aria-label^="Download and load"]');
      await wait('modelDownloadRequests.length===2');
      // Intentionally ignore AbortSignal in this fetch stub: a cancelled old
      // completion must neither apply its weights nor clear the new request.
      await evaluate(cdp, `modelDownloadRequests[0].resolve(new Response('late cancelled weights')); void 0`);
      await wait(`!!document.querySelector('button[aria-label^="Cancel download of"]')`);
      assert.equal(await evaluate(cdp, 'modelReplacementStore.getState().settings.katagoModelUrl'), selectedBeforeDownload);
      for (const type of ['keyDown', 'keyUp']) {
        await cdp.send('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      }
      await wait('!document.querySelector("[aria-labelledby=settings-title]")');
      assert.equal(await evaluate(cdp, 'modelDownloadRequests[1].signal.aborted'), true);
      await evaluate(cdp, 'modelDownloadRequests[1].resolve(new Response("late closed weights")); void 0');
      await evaluate(cdp, `new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
      assert.equal(await evaluate(cdp, 'modelReplacementStore.getState().settings.katagoModelUrl'), selectedBeforeDownload);
      await evaluate(cdp, `(() => {
        document.activeElement?.blur();
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F8', bubbles: true }));
      })()`);
      await click('#tab-ai');
      await click('button', 'Official model downloads');
      await click('button[aria-label^="Download and load"]');
      await wait('modelDownloadRequests.length===3');
      await click('button[title="Lightweight test weights for trying the app"]');
      await wait('modelDownloadRequests[2].signal.aborted');
      const changedSelection = await evaluate(cdp, 'modelReplacementStore.getState().settings.katagoModelUrl');
      assert.notEqual(changedSelection, selectedBeforeDownload);
      await evaluate(cdp, 'modelDownloadRequests[2].resolve(new Response("late unselected weights")); void 0');
      await evaluate(cdp, `new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
      assert.equal(await evaluate(cdp, 'modelReplacementStore.getState().settings.katagoModelUrl'), changedSelection);
      assert.equal(await evaluate(cdp, `!!document.querySelector('button[aria-label^="Cancel download of"]')`), false);
      await click('button[aria-label^="Download and load"]');
      await wait('modelDownloadRequests.length===4');
      await evaluate(cdp, `modelDownloadRequests[3].resolve(new Response('completed download fixture', {
        headers: { 'content-type': 'application/gzip', 'content-length': '26' },
      })); void 0`);
      await wait(`modelReplacementStore.getState().settings.katagoModelUrl.startsWith('blob:')
        && !!document.querySelector('button[aria-label^="Download and load"]:not(:disabled)')`);
      const completed = await evaluate(cdp, `(async () => ({
        text: await (await modelReplacementFetch(modelReplacementStore.getState().settings.katagoModelUrl)).text(),
        persisted: await (await modelReplacementApi.loadPersistedUploadedModel()).blob.text(),
        aborted: modelDownloadRequests[3].signal.aborted,
      }))()`);
      assert.deepEqual(completed, { text: 'completed download fixture', persisted: 'completed download fixture', aborted: false });
      await click('[aria-label="Close settings"]');
      await wait('!document.querySelector("[aria-labelledby=settings-title]") && !history.state?.webKatrainOverlay');
    } finally {
      await evaluate(cdp, 'window.fetch = modelReplacementFetch; void 0');
    }
    reports.push({
      width, failedDownloadRetainedWeights: true, failedAllocationRetainedWeights: true,
      successfulReplacementRevokedPrevious: true, downloadCancellationAndLateCompletions: true, successfulDownloadPersisted: true,
    });
  }
  fs.writeFileSync(path.join(screenshotDir, 'model-replacement.json'), JSON.stringify(reports, null, 2));
  console.log('Model replacement: failures retain selected weights, successful uploads persist, and download Cancel/close/selection changes reject late completions on desktop/phone.');
}
