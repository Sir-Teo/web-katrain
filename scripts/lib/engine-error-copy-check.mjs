import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evaluate, loadedModuleUrl, navigate, setViewport, waitForExpression } from './browser.mjs';

export async function assertEngineErrorCopy(cdp, appUrl, screenshotDir) {
  const reports = [];
  let activeCase = null;
  const wait = expression => waitForExpression(cdp, expression, {
    label: 'Engine error copy identity',
    diagnose: `({error:window.errorCopyStore?.getState().engineError,audit:window.errorCopyAudit?.writes.map(w=>({finished:w.finished,expired:w.expired})),toast:document.querySelector('.notification-toast-message')?.title,focus:document.activeElement?.outerHTML.slice(0,200)})`,
  });
  const settle = () => evaluate(cdp, 'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))');
  const click = async selector => {
    const point = await wait(`(()=>{const b=document.querySelector(${JSON.stringify(selector)});if(!b||b.disabled)return false;b.scrollIntoView({block:'nearest'});const r=b.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return r.width&&b.contains(document.elementFromPoint(x,y))?{x,y}:false})()`);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await cdp.send('Browser.grantPermissions', { origin: new URL(appUrl).origin, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] });
  try {
    for (const width of [390, 320]) for (const surface of ['bar', 'panel']) {
      activeCase = { width, surface, stage: 'setup' };
      const setup = await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
        performance.setResourceTimingBufferSize(5000);localStorage.removeItem('web-katrain:auto_saved_game:v1');
        localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
        localStorage.setItem('web-katrain:library_open:v1','false');
        localStorage.setItem('web-katrain:settings:v3',JSON.stringify({soundEnabled:false,loadSgfFastAnalysis:false,showAnalysisBar:true,analysisExperience:'pro'}));
      ` });
      try {
        await setViewport(cdp, { width, height: width === 320 ? 568 : 844, mobile: true });
        await navigate(cdp, appUrl, 15000, { acceptBeforeUnload: true });
      } finally { await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: setup.result.identifier }); }
      await wait('!!document.querySelector("[data-board-snapshot]")');
      await evaluate(cdp, `(async()=>{
        const url=${loadedModuleUrl.toString()};window.errorCopyStore=(await import(url('/src/store/gameStore.ts'))).useGameStore;
        const {parseSgf}=await import(url('/src/utils/sgf.ts'));const clipboard=await import(url('/src/utils/clipboard.ts'));
        errorCopyStore.getState().loadGame(parseSgf('(;GM[1]SZ[9];B[dd])'));errorCopyStore.getState().navigateEnd();
        const analysis={rootWinRate:.55,rootScoreLead:0,rootVisits:1,moves:[],territory:Array.from({length:9},()=>Array(9).fill(0))};
        errorCopyStore.getState().currentNode.analysis=analysis;
        errorCopyStore.setState(s=>({analysisData:analysis,treeVersion:s.treeVersion+1,engineStatus:'error',engineError:'Error A fixture',engineBackend:'wasm',engineModelName:'Fixture model'}));
        const original=navigator.clipboard,exec=document.execCommand.bind(document),timer=window.setTimeout.bind(window);
        window.errorCopyOriginals={clipboard:original,exec,timer};window.errorCopyAudit={writes:[],legacy:0,holdNext:false,failNext:false,denyLegacy:false,timeout:clipboard.CLIPBOARD_OPERATION_TIMEOUT_MS};
        Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:text=>{
          const entry={text,started:performance.now(),finished:false,expired:false};errorCopyAudit.writes.push(entry);errorCopyAudit.pending=entry;
          const hold=errorCopyAudit.holdNext,fail=errorCopyAudit.failNext;errorCopyAudit.holdNext=false;errorCopyAudit.failNext=false;
          const operation=fail?Promise.reject(new DOMException('Current copy denied','NotAllowedError')):original.writeText(text);
          return operation.then(()=>hold?new Promise((resolve,reject)=>{entry.resolve=resolve;entry.reject=reject;entry.ready=true}):undefined).finally(()=>{entry.finished=true});
        }}});
        document.execCommand=(command,...args)=>{if(command==='copy'){errorCopyAudit.legacy++;if(errorCopyAudit.denyLegacy)return false}return exec(command,...args)};
        window.setTimeout=(callback,delay,...args)=>{
          if(typeof callback!=='function')return timer(callback,delay,...args);
          const entry=delay===errorCopyAudit.timeout?errorCopyAudit.pending:null;
          return timer((...values)=>{if(entry)entry.expired=true;return callback.apply(window,values)},delay,...args);
        };
      })()`);
      await settle();
      if (surface === 'panel') {
        await click('#mobile-tab-info');
        await wait('!!document.querySelector(".analysis-panel-compact")');
        const details = '.analysis-panel-compact [aria-label="Show engine details"]';
        if (await evaluate(cdp, `!!document.querySelector(${JSON.stringify(details)})`)) {
          await click(details);
        }
      }
      const selector = surface === 'bar'
        ? '[data-analysis-command-bar] .analysis-command-bar__status-copy'
        : '.analysis-panel-compact [aria-label="Copy engine error details"]';
      const copied = `(()=>{const b=document.querySelector(${JSON.stringify(selector)});return !!b&&${surface === 'bar' ? "b.getAttribute('aria-label')==='Engine error details copied'" : "[...b.parentElement.parentElement.children].some(e=>e.textContent.trim()==='Copied')"}})()`;
      const toast = () => evaluate(cdp, 'document.querySelector(".notification-toast-message")?.title');
      const change = async (error, model = 'Fixture model') => {
        await evaluate(cdp, `errorCopyStore.setState({engineError:${JSON.stringify(error)},engineModelName:${JSON.stringify(model)}});void 0`);
        await settle();
      };
      const hold = async () => {
        const index = await evaluate(cdp, 'errorCopyAudit.writes.length');
        await evaluate(cdp, 'errorCopyAudit.holdNext=true;void 0');await click(selector);
        await wait(`errorCopyAudit.writes[${index}]?.ready`);return index;
      };
      const copyCurrent = async (keyboard = false) => {
        const index = await evaluate(cdp, 'errorCopyAudit.writes.length');
        if (keyboard) {
          await wait(`document.activeElement===document.querySelector(${JSON.stringify(selector)})`);
          for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', {
            type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, ...(type === 'keyDown' ? { text: '\r' } : {}),
          });
        } else await click(selector);
        await wait(`errorCopyAudit.writes[${index}]?.finished`);await settle();await wait(copied);
      };
      const cases = [];
      activeCase.stage = 'changed-error-completion';
      let index = await hold();
      await change('Error B fixture');
      let latestToast = await toast();
      assert.equal(await evaluate(cdp, `errorCopyAudit.writes[${index}].expired`), false);
      await evaluate(cdp, `errorCopyAudit.writes[${index}].resolve();void 0`);
      await wait(`errorCopyAudit.writes[${index}].finished`);await settle();
      assert.equal(await evaluate(cdp, copied), false);
      assert.equal(await toast(), latestToast);
      assert.ok((await evaluate(cdp, 'errorCopyOriginals.clipboard.readText()')).includes('Error A fixture'));
      cases.push('changed-error-completion');

      await copyCurrent();
      activeCase.stage = 'current-copy-and-model-change';
      await change('Error B fixture', 'Second fixture model');
      assert.equal(await evaluate(cdp, copied), false);
      await copyCurrent();
      assert.ok((await evaluate(cdp, 'errorCopyOriginals.clipboard.readText()')).includes('Second fixture model'));
      cases.push('current-copy-and-model-change');

      for (const outcome of ['rejection', 'timeout']) {
        activeCase.stage = `newer-copy-${outcome}`;
        await change('Error A fixture');index = await hold();
        await change('Error B fixture');await copyCurrent();latestToast = await toast();
        const elapsed = await evaluate(cdp, `performance.now()-errorCopyAudit.writes[${index}].started`);
        assert.ok(elapsed < 1000, `The newer copy must finish before the old 1200 ms timeout (${elapsed} ms)`);
        if (outcome === 'rejection') await evaluate(cdp, `errorCopyAudit.writes[${index}].reject(new Error('Older copy denied'));void 0`);
        else await wait(`errorCopyAudit.writes[${index}].expired`);
        await settle();assert.equal(await evaluate(cdp, copied), true);assert.equal(await toast(), latestToast);
        assert.equal(await evaluate(cdp, 'errorCopyAudit.legacy'), 0);
        assert.ok((await evaluate(cdp, 'errorCopyOriginals.clipboard.readText()')).includes('Error B fixture'));
        if (outcome === 'timeout') await evaluate(cdp, `errorCopyAudit.writes[${index}].resolve();void 0`);
        cases.push(`newer-copy-${outcome}`);
      }
      activeCase.stage = 'current-failure-and-keyboard-retry';
      await change('Current error fixture');
      const beforeFailure = await evaluate(cdp, 'errorCopyOriginals.clipboard.readText()');
      const pageBeforeFailure = await evaluate(cdp, '({x:scrollX,y:scrollY})');
      index = await evaluate(cdp, 'errorCopyAudit.writes.length');
      await evaluate(cdp, 'errorCopyAudit.failNext=true;errorCopyAudit.denyLegacy=true;void 0');
      await click(selector);await wait(`errorCopyAudit.writes[${index}].finished`);await settle();
      assert.equal(await evaluate(cdp, copied), false);
      assert.equal(await toast(), 'Could not copy engine error details.');
      assert.equal(await evaluate(cdp, 'errorCopyOriginals.clipboard.readText()'), beforeFailure);
      const failureLayout = await evaluate(cdp, `(()=>{
        const b=document.querySelector(${JSON.stringify(selector)}),r=b.getBoundingClientRect();
        const x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y),toast=document.querySelector('[data-notification]');
        return {copyRect:{x:r.x,y:r.y,width:r.width,height:r.height},coveredByToast:!!hit?.closest('[data-notification]'),tappable:b.contains(hit),focused:document.activeElement===b,page:{x:scrollX,y:scrollY},hit:hit?.outerHTML.slice(0,300),toast:toast?.innerText};
      })()`);
      fs.writeFileSync(path.join(screenshotDir, `engine-error-failure-${surface}-${width}.json`), JSON.stringify(failureLayout, null, 2));
      const failureShot = await cdp.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(screenshotDir, `engine-error-failure-${surface}-${width}.png`), Buffer.from(failureShot.result.data, 'base64'));
      assert.equal(failureLayout.coveredByToast, false, 'Failure feedback must leave its focused action exposed');
      assert.equal(failureLayout.tappable, true);
      assert.equal(failureLayout.focused, true, 'Revealing an action must preserve its focus');
      assert.deepEqual(failureLayout.page, pageBeforeFailure, 'Only the panel may scroll');
      await evaluate(cdp, 'errorCopyAudit.denyLegacy=false;void 0');
      await copyCurrent(true);
      const retry = { width, surface, copied: await evaluate(cdp, copied), toast: await toast(), clipboard: await evaluate(cdp, 'errorCopyOriginals.clipboard.readText()') };
      fs.writeFileSync(path.join(screenshotDir, `engine-error-retry-${surface}-${width}.json`), JSON.stringify(retry, null, 2));
      assert.equal(retry.toast, 'Copied engine error details.', 'A successful retry must replace its own failure message');
      assert.ok(retry.clipboard.includes('Current error fixture'));
      cases.push('current-failure-and-keyboard-retry');

      activeCase.stage = 'current-failure-and-touch-retry';
      await change('Touch retry fixture');
      index = await evaluate(cdp, 'errorCopyAudit.writes.length');
      await evaluate(cdp, 'errorCopyAudit.failNext=true;errorCopyAudit.denyLegacy=true;void 0');
      await click(selector);await wait(`errorCopyAudit.writes[${index}].finished`);await settle();
      assert.equal(await toast(), 'Could not copy engine error details.');
      await evaluate(cdp, 'errorCopyAudit.denyLegacy=false;void 0');
      await copyCurrent();
      assert.equal(await toast(), 'Copied engine error details.');
      assert.ok((await evaluate(cdp, 'errorCopyOriginals.clipboard.readText()')).includes('Touch retry fixture'));
      cases.push('current-failure-and-touch-retry');

      activeCase.stage = surface === 'bar' ? 'unmounted-view' : 'cleared-error';
      await change('Error A fixture');index = await hold();
      if (surface === 'bar') {
        await evaluate(cdp, 'errorCopyStore.getState().toggleEditMode();void 0');
        await wait('!document.querySelector("[data-analysis-command-bar]")');
      } else await change(null);
      latestToast = await toast();
      assert.equal(await evaluate(cdp, `errorCopyAudit.writes[${index}].expired`), false);
      await evaluate(cdp, `errorCopyAudit.writes[${index}].resolve();void 0`);
      await wait(`errorCopyAudit.writes[${index}].finished`);await settle();
      assert.equal(await toast(), latestToast);
      cases.push(surface === 'bar' ? 'unmounted-view' : 'cleared-error');
      const legacyAttempts = await evaluate(cdp, 'errorCopyAudit.legacy');
      assert.equal(legacyAttempts, 2, 'Only the two intentionally denied current copies may attempt the legacy route');
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(screenshotDir, `engine-error-copy-${surface}-${width}.png`), Buffer.from(shot.result.data, 'base64'));
      reports.push({ width, surface, cases, nativeClipboard: true, staleLegacyCopies: legacyAttempts - 2, deniedCurrentLegacyCopies: legacyAttempts });
      console.log('Engine error copy', JSON.stringify(reports.at(-1)));
    }
    fs.writeFileSync(path.join(screenshotDir, 'engine-error-copy.json'), JSON.stringify(reports, null, 2));
  } catch (error) {
    const state = await evaluate(cdp, `({
      error: window.errorCopyStore?.getState().engineError,
      writes: window.errorCopyAudit?.writes.map(write => ({
        text: write.text, finished: write.finished, expired: write.expired,
        elapsed: performance.now() - write.started,
      })),
      toast: document.querySelector('.notification-toast-message')?.title,
      focus: document.activeElement?.outerHTML.slice(0, 300),
    })`).catch(() => null);
    fs.writeFileSync(path.join(screenshotDir, 'engine-error-copy-failure.json'), JSON.stringify({ activeCase, error: error.stack ?? String(error), state }, null, 2));
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }).catch(() => null);
    if (shot) fs.writeFileSync(path.join(screenshotDir, 'engine-error-copy-failure.png'), Buffer.from(shot.result.data, 'base64'));
    throw error;
  } finally {
    await evaluate(cdp, `(async()=>{const o=window.errorCopyOriginals;if(!o)return;await o.clipboard.writeText('');Object.defineProperty(navigator,'clipboard',{configurable:true,value:o.clipboard});document.execCommand=o.exec;window.setTimeout=o.timer})()`).catch(() => undefined);
    await cdp.send('Browser.resetPermissions');
  }
}
