import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evaluate, loadedModuleUrl, navigate, setViewport, waitForExpression } from './browser.mjs';

export async function assertNotificationCopyOrder(cdp, appUrl, output) {
  const reports = [];
  let activeWidth;
  const wait = expression => waitForExpression(cdp, expression, {
    label: 'Notification copy ordering',
    diagnose: `({label:document.querySelector('[data-notification-copy]')?.getAttribute('aria-label'),message:document.querySelector('.notification-toast-message')?.title,writes:window.noticeWrites?.map(w=>({finished:w.finished,expired:w.expired})),dialog:document.querySelector('[role=dialog]')?.getAttribute('aria-labelledby')})`,
  });
  const settle = () => evaluate(cdp, 'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))');
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await cdp.send('Browser.grantPermissions', { origin: new URL(appUrl).origin, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] });
  try {
    for (const width of [1440, 390, 320]) {
      activeWidth = width;
      const mobile = width < 600;
      const click = async (selector, text) => {
        const p = await wait(`(()=>{const b=[...document.querySelectorAll(${JSON.stringify(selector)})].find(b=>${text ? `b.textContent.includes(${JSON.stringify(text)})` : 'true'});if(!b||b.disabled)return false;b.scrollIntoView({block:'nearest'});const r=b.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return r.width&&b.contains(document.elementFromPoint(x,y))?{x,y}:false})()`);
        if (mobile) {
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] });
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        } else for (const type of ['mousePressed', 'mouseReleased']) await cdp.send('Input.dispatchMouseEvent', { type, ...p, button: 'left', clickCount: 1 });
      };
      const openModels = async () => {
        for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', { type, key: 'F8', code: 'F8', windowsVirtualKeyCode: 119 });
        await click('#tab-ai');await click('button', 'Official model downloads');
      };
      const setup = await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
        performance.setResourceTimingBufferSize(5000);localStorage.removeItem('web-katrain:auto_saved_game:v1');
        localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
        localStorage.setItem('web-katrain:settings:v3',JSON.stringify({soundEnabled:false,loadSgfFastAnalysis:false}));
      ` });
      try {
        await setViewport(cdp, { width, height: mobile ? (width === 320 ? 568 : 844) : 900, mobile });
        await navigate(cdp, appUrl, 15000, { acceptBeforeUnload: true });
      } finally { await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: setup.result.identifier }); }
      await wait('!!document.querySelector("[data-board-snapshot]")');await settle();
      await openModels();
      const modelName = await evaluate(cdp, 'document.querySelector("#panel-ai button[aria-label^=\\"Copy URL for\\"]")?.getAttribute("aria-label").replace(/^Copy URL for /,"")');
      assert.ok(modelName);
      const modelCopy = `#panel-ai button[aria-label$=${JSON.stringify(`URL for ${modelName}`)}]`;
      await click('[aria-label="Close settings"]');
      await evaluate(cdp, `(async()=>{
        const url=${loadedModuleUrl.toString()};window.noticeStore=(await import(url('/src/store/gameStore.ts'))).useGameStore;
        const clipboard=await import(url('/src/utils/clipboard.ts'));
        const original=navigator.clipboard,exec=document.execCommand.bind(document),timer=window.setTimeout.bind(window);
        window.noticeOriginals={clipboard:original,exec,timer};window.noticeWrites=[];window.noticeLegacy=0;window.noticeHold=false;window.noticeFail=false;window.noticeDenyLegacy=false;
        Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:text=>{
          const hold=noticeHold,fail=noticeFail;noticeHold=false;noticeFail=false;
          const entry={text,started:performance.now(),finished:false,expired:false};noticeWrites.push(entry);window.noticePending=entry;
          const operation=fail?Promise.reject(new DOMException('Copy denied','NotAllowedError')):original.writeText(text);
          return operation.then(()=>hold?new Promise((resolve,reject)=>{entry.resolve=resolve;entry.reject=reject;entry.ready=true}):undefined).finally(()=>entry.finished=true);
        }}});
        document.execCommand=(command,...args)=>{if(command==='copy'){noticeLegacy++;if(noticeDenyLegacy)return false}return exec(command,...args)};
        window.setTimeout=(callback,delay,...args)=>{
          if(typeof callback!=='function')return timer(callback,delay,...args);
          const entry=delay===clipboard.CLIPBOARD_OPERATION_TIMEOUT_MS?noticePending:null;
          return timer((...values)=>{if(entry)entry.expired=true;return callback.apply(window,values)},delay,...args);
        };
      })()`);
      const control = '[data-notification-copy]';
      const copyLabel = () => evaluate(cdp, 'document.querySelector("[data-notification-copy]")?.getAttribute("aria-label")');
      const clipboard = () => evaluate(cdp, 'noticeOriginals.clipboard.readText()');
      const seed = async suffix => {
        await evaluate(cdp, `noticeStore.setState({notification:{message:${JSON.stringify(`Notification ${suffix}`)},copyText:${JSON.stringify(`Notification details ${suffix}`)},type:'error',operationId:'notification-copy-native'}});void 0`);await settle();
        await wait(`document.querySelector('.notification-toast-message')?.title===${JSON.stringify(`Notification ${suffix}`)}`);
      };
      const hold = async () => {
        const index = await evaluate(cdp, 'noticeWrites.length');
        await evaluate(cdp, 'noticeHold=true;void 0');await click(control);await wait(`noticeWrites[${index}]?.ready`);return index;
      };
      const copy = async () => {
        const index = await evaluate(cdp, 'noticeWrites.length');
        await click(control);await wait(`noticeWrites[${index}]?.finished`);await settle();
      };
      const cases = [];
      for (const outcome of ['success', 'rejection', 'timeout']) {
        await seed(outcome);const index = await hold();await openModels();await click(modelCopy);
        await wait(`document.querySelector(${JSON.stringify(modelCopy)})?.textContent.trim()==='Copied'`);
        const current = await clipboard();
        const elapsed = await evaluate(cdp, `performance.now()-noticeWrites[${index}].started`);
        assert.ok(elapsed < 1000, `New URL must finish before old 1200 ms timeout (${elapsed} ms)`);
        if (outcome === 'timeout') await wait(`noticeWrites[${index}].expired`);
        else await evaluate(cdp, `noticeWrites[${index}].${outcome === 'success' ? 'resolve()' : "reject(new Error('Old notice copy denied'))"};void 0`);
        await settle();await click('[aria-label="Close settings"]');
        assert.equal(await copyLabel(), 'Copy notification');assert.equal(await clipboard(), current);
        assert.equal(await evaluate(cdp, 'noticeLegacy'), 0);
        if (outcome === 'timeout') await evaluate(cdp, `noticeWrites[${index}].resolve();void 0`);
        cases.push(`newer-model-url-${outcome}`);
      }
      await seed('old report');let index = await hold();await seed('new report');
      assert.equal(await evaluate(cdp, `noticeWrites[${index}].expired`), false);
      await evaluate(cdp, `noticeWrites[${index}].resolve();void 0`);await wait(`noticeWrites[${index}].finished`);await settle();
      assert.equal(await copyLabel(), 'Copy notification');cases.push('changed-notification');
      await seed('same report');index = await hold();await copy();await wait('document.querySelector("[data-notification-copy]")?.getAttribute("aria-label")==="Notification copied"');
      assert.equal(await evaluate(cdp, `noticeWrites[${index}].expired`), false);
      await evaluate(cdp, `noticeWrites[${index}].reject(new Error('Old copy denied'));void 0`);await wait(`noticeWrites[${index}].finished`);await settle();
      assert.equal(await copyLabel(), 'Notification copied');assert.equal(await evaluate(cdp, 'noticeLegacy'), 0);cases.push('newer-notification-copy');
      await seed('retry');const before = await clipboard();await evaluate(cdp, 'noticeFail=true;noticeDenyLegacy=true;void 0');await copy();
      assert.equal(await copyLabel(), 'Copy notification failed');assert.equal(await clipboard(), before);
      await evaluate(cdp, 'noticeDenyLegacy=false;void 0');await copy();
      assert.equal(await copyLabel(), 'Notification copied');assert.equal(await clipboard(), 'Notification details retry');
      assert.equal(await evaluate(cdp, 'noticeLegacy'), 1);cases.push('current-denial-and-native-retry');
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(output, `notification-copy-order-${width}.png`), Buffer.from(shot.result.data, 'base64'));
      reports.push({ width, cases, nativeClipboard: true, staleLegacyCopies: 0 });
      fs.writeFileSync(path.join(output, 'notification-copy-order.json'), JSON.stringify(reports, null, 2));
      console.log('Notification copy ordering', JSON.stringify(reports.at(-1)));
    }
  } catch (error) {
    const state = await evaluate(cdp, '({body:document.body.innerText,focus:document.activeElement?.outerHTML})').catch(() => null);
    fs.writeFileSync(path.join(output, `notification-copy-order-failure-${activeWidth}.json`), JSON.stringify({ error: String(error), state }, null, 2));
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }).catch(() => null);
    if (shot) fs.writeFileSync(path.join(output, `notification-copy-order-failure-${activeWidth}.png`), Buffer.from(shot.result.data, 'base64'));
    throw error;
  } finally {
    await evaluate(cdp, `(async()=>{const o=window.noticeOriginals;if(!o)return;await o.clipboard.writeText('');Object.defineProperty(navigator,'clipboard',{configurable:true,value:o.clipboard});document.execCommand=o.exec;window.setTimeout=o.timer})()`).catch(() => undefined);
    await cdp.send('Browser.resetPermissions');
  }
}
