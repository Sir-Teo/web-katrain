import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evaluate, loadedModuleUrl, navigate, setViewport, waitForExpression } from './browser.mjs';

export async function assertModelStorageOrdering(cdp, appUrl, runDir, screenshotDir) {
  const files = ['A', 'B'].map(name => {
    const file = path.join(runDir, `storage-${name}.bin.gz`);
    fs.writeFileSync(file, `storage weights ${name}`);
    return file;
  });
  const wait = (expression) => waitForExpression(cdp, expression, { label: 'Model storage ordering' });
  const click = async (selector, text) => {
    const point = await wait(`(() => {
      const e = [...document.querySelectorAll(${JSON.stringify(selector)})]
        .find(e => ${text ? `e.textContent.trim()===${JSON.stringify(text)}` : 'true'});
      if (!e) return false;
      e.scrollIntoView({ block: 'center' });
      const r = e.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
      return r.width && e.contains(document.elementFromPoint(x, y)) ? { x, y } : false;
    })()`);
    for (const type of ['mousePressed', 'mouseReleased']) {
      await cdp.send('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 });
    }
  };
  const openSettings = async () => {
    await wait('!!document.querySelector("[data-board-snapshot]")');
    await evaluate(cdp, `(() => {
      document.activeElement?.blur();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F8', bubbles: true }));
    })()`);
    await click('#tab-ai');
    await wait('!!document.querySelector("#settings-katago-model-url")');
    await evaluate(cdp, `(async () => {
      const url = ${loadedModuleUrl.toString()};
      window.modelStorageApi = await import(url('/src/utils/modelUpload.ts'));
      window.modelStorageStore = (await import(url('/src/store/gameStore.ts'))).useGameStore;
    })()`);
  };
  const closeSettings = async () => {
    await click('[aria-label="Close settings"]');
    await wait('!document.querySelector("[aria-labelledby=settings-title]") && !history.state?.webKatrainOverlay');
  };
  const installHold = () => evaluate(cdp, `(() => {
    const open = indexedDB.open.bind(indexedDB);
    window.modelStorageAudit = { open, holdNext: true, held: [] };
    indexedDB.open = (...args) => {
      const request = open(...args);
      if (args[0] === 'web-katrain-models' && modelStorageAudit.holdNext) {
        modelStorageAudit.holdNext = false;
        Object.defineProperty(request, 'onsuccess', { set(fn) {
          request.addEventListener('success', event => modelStorageAudit.held.push(() => fn.call(request, event)), { once: true });
        } });
      }
      return request;
    };
  })()`);
  const upload = async (file) => {
    await evaluate(cdp, `(() => {
      const button = [...document.querySelectorAll('#panel-ai button')].find(e => e.textContent.trim() === 'Upload Weights');
      button.parentElement.parentElement.querySelector('input[type=file]').id = 'model-storage-input';
    })()`);
    const root = (await cdp.send('DOM.getDocument')).result.root;
    const node = (await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#model-storage-input' })).result.nodeId;
    await cdp.send('DOM.setFileInputFiles', { nodeId: node, files: [file] });
  };
  const stored = `new Promise((resolve, reject) => {
    const request = modelStorageAudit.open('web-katrain-models');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, get = db.transaction('uploaded-models', 'readonly').objectStore('uploaded-models').get('current');
      get.onerror = () => { db.close(); reject(get.error); };
      get.onsuccess = async () => { db.close(); resolve(get.result ? { name: get.result.name, text: await get.result.blob.text() } : null); };
    };
  })`;
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
    // Resource records must also survive each explicit reload below.
    const recorder = await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: 'performance.setResourceTimingBufferSize(5000)' });
    try {
      await openSettings();
      await installHold();
      await upload(files[0]);
      await wait('modelStorageAudit.held.length===1');
      await upload(files[1]);
      await wait("document.querySelector('[data-katago-uploaded-model-summary]')?.textContent.includes('storage-B.bin.gz')");
      assert.equal(await evaluate(cdp, 'localStorage.getItem("web-katrain:uploaded_model_selected:v1")'), null);
      await evaluate(cdp, 'modelStorageAudit.held.splice(0).forEach(release => release()); void 0');
      await wait('localStorage.getItem("web-katrain:uploaded_model_selected:v1")==="true"');
      assert.deepEqual(await evaluate(cdp, stored), { name: 'storage-B.bin.gz', text: 'storage weights B' });
      assert.equal(await evaluate(cdp, 'modelStorageApi.getUploadedModelInfo().name'), 'storage-B.bin.gz');
      assert.equal(await evaluate(cdp, `document.querySelector('#panel-ai').textContent.includes('could not save')`), false);
      await closeSettings();
      await navigate(cdp, appUrl, 15000, { acceptBeforeUnload: true });
      await openSettings();
      await wait("document.querySelector('[data-katago-uploaded-model-summary]')?.textContent.includes('storage-B.bin.gz')");
      assert.equal(await evaluate(cdp, '(async () => (await fetch(modelStorageStore.getState().settings.katagoModelUrl)).text())()'), 'storage weights B');
      await installHold();
      await upload(files[0]);
      await wait('modelStorageAudit.held.length===1');
      await click('button', 'Clear Upload');
      await wait('!document.querySelector("[data-katago-uploaded-model-summary]")');
      await evaluate(cdp, 'modelStorageAudit.held.splice(0).forEach(release => release()); void 0');
      await wait(`(async () => (await ${stored}) === null)()`);
      assert.equal(await evaluate(cdp, 'localStorage.getItem("web-katrain:uploaded_model_selected:v1")'), null);
      assert.equal(await evaluate(cdp, 'modelStorageApi.getUploadedModelInfo()'), null);
      assert.equal(await evaluate(cdp, `document.querySelector('#panel-ai').textContent.includes('could not save')`), false);
      await closeSettings();
      await navigate(cdp, appUrl, 15000, { acceptBeforeUnload: true });
      await openSettings();
      assert.equal(await evaluate(cdp, '!!document.querySelector("[data-katago-uploaded-model-summary]")'), false);
      assert.equal(await evaluate(cdp, 'modelStorageStore.getState().settings.katagoModelUrl.startsWith("blob:")'), false);
      await closeSettings();
    } finally {
      await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: recorder.result.identifier });
    }
    reports.push({ width, newerUploadSurvivesReload: true, clearDuringPendingSaveSurvivesReload: true, staleStorageErrors: 0 });
  }
  fs.writeFileSync(path.join(screenshotDir, 'model-storage-ordering.json'), JSON.stringify(reports, null, 2));
  console.log('Model storage: newer uploads and Clear Upload overtake held saves, preserve metadata, and survive reload on desktop/phone.');
}
