import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evaluate, loadedModuleUrl, navigate, setViewport, waitForExpression } from './browser.mjs';

export async function assertModelUrlCopy(cdp, appUrl, output) {
  const reports = [];
  let activeWidth;
  const wait = expression => waitForExpression(cdp, expression, {
    label: 'Model URL copy feedback',
    diagnose: `({buttons:[...document.querySelectorAll('#panel-ai button[aria-label*="URL for"]')].map(b=>b.getAttribute('aria-label')),writes:window.modelUrlWrites?.map(w=>({finished:w.finished,expired:w.expired})),focus:document.activeElement?.outerHTML.slice(0,160)})`,
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
      for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', { type, key: 'F8', code: 'F8', windowsVirtualKeyCode: 119 });
      await click('#tab-ai');await click('button', 'Official model downloads');
      const names = await evaluate(cdp, '[...document.querySelectorAll("#panel-ai button[aria-label^=\\"Copy URL for\\"]")].slice(0,2).map(b=>b.getAttribute("aria-label").replace(/^Copy URL for /,""))');
      assert.equal(names.length, 2);
      const selector = name => `#panel-ai button[aria-label$=${JSON.stringify(`URL for ${name}`)}]`;
      const label = name => `document.querySelector(${JSON.stringify(selector(name))})?.textContent.trim()`;
      await evaluate(cdp, `(async()=>{
        const url=${loadedModuleUrl.toString()};const clipboard=await import(url('/src/utils/clipboard.ts'));
        const original=navigator.clipboard,exec=document.execCommand.bind(document),timer=window.setTimeout.bind(window);
        window.modelUrlOriginals={clipboard:original,exec,timer};window.modelUrlWrites=[];window.modelUrlLegacy=0;window.modelUrlAckTimers=0;
        window.modelUrlHold=false;window.modelUrlFail=false;window.modelUrlDenyLegacy=false;
        Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:text=>{
          const hold=modelUrlHold,fail=modelUrlFail;modelUrlHold=false;modelUrlFail=false;
          const entry={text,started:performance.now(),finished:false,expired:false};modelUrlWrites.push(entry);window.modelUrlPending=entry;
          const operation=fail?Promise.reject(new DOMException('Copy denied','NotAllowedError')):original.writeText(text);
          return operation.then(()=>hold?new Promise((resolve,reject)=>{entry.resolve=resolve;entry.reject=reject;entry.ready=true}):undefined).finally(()=>entry.finished=true);
        }}});
        document.execCommand=(command,...args)=>{if(command==='copy'){modelUrlLegacy++;if(modelUrlDenyLegacy)return false}return exec(command,...args)};
        window.setTimeout=(callback,delay,...args)=>{
          if(typeof callback!=='function')return timer(callback,delay,...args);
          if(delay===2000)modelUrlAckTimers++;
          const entry=delay===clipboard.CLIPBOARD_OPERATION_TIMEOUT_MS?modelUrlPending:null;
          return timer((...values)=>{if(entry)entry.expired=true;return callback.apply(window,values)},delay,...args);
        };
      })()`);
      const copy = async name => {
        const index = await evaluate(cdp, 'modelUrlWrites.length');
        await click(selector(name));await wait(`modelUrlWrites[${index}]?.finished`);await settle();
      };
      const hold = async name => {
        const index = await evaluate(cdp, 'modelUrlWrites.length');
        await evaluate(cdp, 'modelUrlHold=true;void 0');await click(selector(name));await wait(`modelUrlWrites[${index}]?.ready`);
        return index;
      };
      const readClipboard = () => evaluate(cdp, 'modelUrlOriginals.clipboard.readText()');
      const cases = [];
      for (const outcome of ['success', 'rejection', 'timeout']) {
        const index = await hold(names[0]);await copy(names[1]);await wait(`${label(names[1])}==='Copied'`);
        const current = await readClipboard();
        const elapsed = await evaluate(cdp, `performance.now()-modelUrlWrites[${index}].started`);
        assert.ok(elapsed < 1000, `New URL must finish before old 1200 ms timeout (${elapsed} ms)`);
        if (outcome === 'timeout') await wait(`modelUrlWrites[${index}].expired`);
        else await evaluate(cdp, `modelUrlWrites[${index}].${outcome === 'success' ? 'resolve()' : "reject(new Error('Older copy denied'))"};void 0`);
        await settle();assert.equal(await evaluate(cdp, label(names[1])), 'Copied');assert.equal(await evaluate(cdp, label(names[0])), 'Copy URL');
        assert.equal(await readClipboard(), current);assert.equal(await evaluate(cdp, 'modelUrlLegacy'), 0);
        if (outcome === 'timeout') await evaluate(cdp, `modelUrlWrites[${index}].resolve();void 0`);
        cases.push(`newer-url-${outcome}`);
      }
      await copy(names[0]);await wait(`${label(names[0])}==='Copied'`);
      await evaluate(cdp, 'window.firstModelAck=performance.now();void 0');
      await wait('performance.now()-firstModelAck>=1000');await copy(names[0]);await wait(`${label(names[0])}==='Copied'`);
      await wait('performance.now()-firstModelAck>=2100');assert.equal(await evaluate(cdp, label(names[0])), 'Copied');
      await wait(`${label(names[0])}==='Copy URL'`);cases.push('repeat-copy-keeps-full-feedback-lifetime');
      const previous = await readClipboard();
      await evaluate(cdp, 'modelUrlFail=true;modelUrlDenyLegacy=true;void 0');await copy(names[0]);
      assert.equal(await evaluate(cdp, label(names[0])), 'Copy URL');assert.equal(await readClipboard(), previous);
      await evaluate(cdp, 'modelUrlDenyLegacy=false;void 0');await copy(names[0]);await wait(`${label(names[0])}==='Copied'`);
      assert.equal(await evaluate(cdp, 'modelUrlLegacy'), 1);cases.push('current-denial-and-native-retry');
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(output, `model-url-copy-${width}.png`), Buffer.from(shot.result.data, 'base64'));
      const index = await hold(names[1]);await click('[aria-label="Close settings"]');await wait('!document.querySelector("[aria-labelledby=settings-title]")');
      const timers = await evaluate(cdp, 'modelUrlAckTimers');
      assert.equal(await evaluate(cdp, `modelUrlWrites[${index}].expired`), false);
      await evaluate(cdp, `modelUrlWrites[${index}].resolve();void 0`);await wait(`modelUrlWrites[${index}].finished`);await settle();
      assert.equal(await evaluate(cdp, 'modelUrlAckTimers'), timers, 'A closed Settings panel must not schedule stale acknowledgement timers');
      cases.push('closed-settings');
      reports.push({ width, cases, nativeClipboard: true, staleLegacyCopies: 0 });
      fs.writeFileSync(path.join(output, 'model-url-copy.json'), JSON.stringify(reports, null, 2));
      console.log('Model URL copy', JSON.stringify(reports.at(-1)));
    }
  } catch (error) {
    const state = await evaluate(cdp, '({body:document.body.innerText,focus:document.activeElement?.outerHTML})').catch(() => null);
    fs.writeFileSync(path.join(output, `model-url-copy-failure-${activeWidth}.json`), JSON.stringify({ error: String(error), state }, null, 2));
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }).catch(() => null);
    if (shot) fs.writeFileSync(path.join(output, `model-url-copy-failure-${activeWidth}.png`), Buffer.from(shot.result.data, 'base64'));
    throw error;
  } finally {
    await evaluate(cdp, `(async()=>{const o=window.modelUrlOriginals;if(!o)return;await o.clipboard.writeText('');Object.defineProperty(navigator,'clipboard',{configurable:true,value:o.clipboard});document.execCommand=o.exec;window.setTimeout=o.timer})()`).catch(() => undefined);
    await cdp.send('Browser.resetPermissions');
  }
}
