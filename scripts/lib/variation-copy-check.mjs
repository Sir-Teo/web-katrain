import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evaluate, loadedModuleUrl, navigate, setViewport, waitForExpression } from './browser.mjs';

export async function assertVariationCopy(cdp, appUrl, output) {
  const reports = [];
  let activeWidth;
  const wait = expression => waitForExpression(cdp, expression, {
    label: 'Variation copy feedback',
    diagnose: `({toast:document.querySelector('.notification-toast-message')?.title,writes:window.variationWrites?.map(w=>({text:w.text,finished:w.finished,expired:w.expired})),focus:document.activeElement?.outerHTML.slice(0,200)})`,
  });
  const settle = () => evaluate(cdp, 'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))');
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await cdp.send('Browser.grantPermissions', { origin: new URL(appUrl).origin, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] });
  try {
    for (const width of [1440, 390, 320]) {
      activeWidth = width;
      const mobile = width < 600;
      const click = async (selector, text) => {
        const point = await wait(`(()=>{const b=[...document.querySelectorAll(${JSON.stringify(selector)})].find(b=>${text ? `b.textContent.trim()===${JSON.stringify(text)}` : 'true'});if(!b||b.disabled)return false;b.scrollIntoView({block:'nearest'});const r=b.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return r.width&&b.contains(document.elementFromPoint(x,y))?{x,y}:false})()`);
        if (mobile) {
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        } else for (const type of ['mousePressed', 'mouseReleased']) {
          await cdp.send('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 });
        }
      };
      const key = async (key, code, number, modifiers = 0) => {
        for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: number, modifiers });
      };
      const setup = await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
        performance.setResourceTimingBufferSize(5000);localStorage.removeItem('web-katrain:auto_saved_game:v1');
        localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
        localStorage.setItem('web-katrain:library_open:v1','false');localStorage.setItem('web-katrain:sidebar_open:v1','true');
        localStorage.setItem('web-katrain:settings:v3',JSON.stringify({soundEnabled:false,loadSgfFastAnalysis:false,analysisExperience:'pro'}));
      ` });
      try {
        await setViewport(cdp, { width, height: mobile ? (width === 320 ? 568 : 844) : 900, mobile });
        await navigate(cdp, appUrl, 15000, { acceptBeforeUnload: true });
      } finally { await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: setup.result.identifier }); }
      await wait('!!document.querySelector("[data-board-snapshot]")');
      await evaluate(cdp, `(async()=>{
        const url=${loadedModuleUrl.toString()};window.variationStore=(await import(url('/src/store/gameStore.ts'))).useGameStore;
        const {parseSgf}=await import(url('/src/utils/sgf.ts'));const clipboard=await import(url('/src/utils/clipboard.ts'));
        variationStore.getState().loadGame(parseSgf('(;SZ[9];B[dd])'));variationStore.getState().navigateEnd();
        const analysis={rootWinRate:.55,rootScoreLead:0,rootVisits:100,moves:[{x:4,y:4,winRate:.55,scoreLead:0,visits:100,pointsLost:0,order:0,pv:['E5','F5','E6']}],territory:Array.from({length:9},()=>Array(9).fill(0))};
        variationStore.getState().currentNode.analysis=analysis;variationStore.setState(s=>({analysisData:analysis,treeVersion:s.treeVersion+1,engineStatus:'ready'}));
        const original=navigator.clipboard,exec=document.execCommand.bind(document),timer=window.setTimeout.bind(window);
        window.variationOriginals={clipboard:original,exec,timer};window.variationWrites=[];window.variationLegacy=0;window.variationHold=false;window.variationFail=false;window.variationDenyLegacy=false;
        Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:text=>{
          const hold=variationHold,fail=variationFail;variationHold=false;variationFail=false;
          const entry={text,started:performance.now(),finished:false,expired:false};variationWrites.push(entry);window.variationPending=entry;
          const operation=fail?Promise.reject(new DOMException('Current variation copy denied','NotAllowedError')):original.writeText(text);
          return operation.then(()=>hold?new Promise((resolve,reject)=>{entry.resolve=resolve;entry.reject=reject;entry.ready=true}):undefined).finally(()=>entry.finished=true);
        }}});
        document.execCommand=(command,...args)=>{if(command==='copy'){variationLegacy++;if(variationDenyLegacy)return false}return exec(command,...args)};
        window.setTimeout=(callback,delay,...args)=>{
          if(typeof callback!=='function')return timer(callback,delay,...args);
          const entry=delay===clipboard.CLIPBOARD_OPERATION_TIMEOUT_MS?variationPending:null;
          return timer((...values)=>{if(entry)entry.expired=true;return callback.apply(window,values)},delay,...args);
        };
      })()`);
      await settle();
      if (mobile) {
        await click('#mobile-tab-info');
        await wait('!![...document.querySelectorAll(".panel-section-title")].find(b=>b.textContent.trim()==="Candidates")');
        if (await evaluate(cdp, '[...document.querySelectorAll(".panel-section-title")].find(b=>b.textContent.trim()==="Candidates")?.getAttribute("aria-expanded")==="false"')) {
          await click('.panel-section-title', 'Candidates');
        }
      }
      await click('.cl-pv-toggle');
      const copy = '.cl-pv-action';
      const toast = () => evaluate(cdp, 'document.querySelector(".notification-toast-message")?.title');
      const readClipboard = () => evaluate(cdp, 'variationOriginals.clipboard.readText()');
      const copyCurrent = async () => {
        const index = await evaluate(cdp, 'variationWrites.length');
        await click(copy);await wait(`variationWrites[${index}]?.finished`);await settle();
      };
      const cases = [];
      for (const outcome of ['rejection', 'timeout', 'newer-sgf']) {
        const index = await evaluate(cdp, 'variationWrites.length');
        await evaluate(cdp, 'variationHold=true;void 0');await click(copy);await wait(`variationWrites[${index}]?.ready`);
        if (outcome === 'newer-sgf') {
          await key('k', 'KeyK', 75, 2);await click('[data-command-palette-search]');await cdp.send('Input.insertText', { text: 'Copy SGF' });await click('[data-command-palette-item=copy-sgf]');
          await wait('document.querySelector(".notification-toast-message")?.title==="Copied SGF to clipboard."');
        } else { await copyCurrent();await wait('document.querySelector(".notification-toast-message")?.title==="Variation copied."'); }
        const latestToast = await toast();
        const currentText = await readClipboard();
        const elapsed = await evaluate(cdp, `performance.now()-variationWrites[${index}].started`);
        assert.ok(elapsed < 1000, `New copy must finish before old 1200 ms timeout (${elapsed} ms)`);
        if (outcome === 'timeout') await wait(`variationWrites[${index}].expired`);
        else await evaluate(cdp, `variationWrites[${index}].reject(new Error('Older variation copy denied'));void 0`);
        await settle();assert.equal(await toast(), latestToast);assert.equal(await readClipboard(), currentText);
        assert.equal(await evaluate(cdp, 'variationLegacy'), 0);
        if (outcome === 'timeout') await evaluate(cdp, `variationWrites[${index}].resolve();void 0`);
        if (outcome === 'newer-sgf') assert.ok(currentText.includes('SZ[9]'));
        else assert.equal(currentText, 'E5 F5 E6');
        cases.push(outcome);
      }
      const beforeFailure = await readClipboard();
      await evaluate(cdp, 'variationFail=true;variationDenyLegacy=true;void 0');await copyCurrent();
      assert.equal(await toast(), 'Could not copy the variation.');assert.equal(await readClipboard(), beforeFailure);
      await evaluate(cdp, 'variationDenyLegacy=false;void 0');await copyCurrent();
      assert.equal(await toast(), 'Variation copied.');assert.equal(await readClipboard(), 'E5 F5 E6');
      assert.equal(await evaluate(cdp, 'variationLegacy'), 1);
      cases.push('current-failure-and-native-retry');
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(output, `variation-copy-${width}.png`), Buffer.from(shot.result.data, 'base64'));
      const targets = await evaluate(cdp, '[...document.querySelectorAll(".cl-pv-action")].map(b=>({label:b.textContent.trim(),width:b.offsetWidth,height:b.offsetHeight,mobilePanel:!!b.closest(".mobile-safe-bottom")}))');
      fs.writeFileSync(path.join(output, `variation-copy-targets-${width}.json`), JSON.stringify(targets, null, 2));
      if (mobile) for (const target of targets) {
        assert.ok(target.width >= 44 && target.height >= 44, `${target.label} needs a 44 px touch target; found ${target.width}×${target.height}`);
      }
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: !mobile, maxTouchPoints: mobile ? 1 : 5 });
      await settle();
      const alternate = await evaluate(cdp, '({coarse:matchMedia("(pointer:coarse)").matches,targets:[...document.querySelectorAll(".cl-pv-action")].map(b=>({label:b.textContent.trim(),width:b.offsetWidth,height:b.offsetHeight}))})');
      assert.equal(alternate.coarse, !mobile);
      for (const target of alternate.targets) assert.ok(target.width >= 44 && target.height >= 44, 'Touch devices and narrow mouse layouts both need reachable actions');
      fs.writeFileSync(path.join(output, `variation-copy-alternate-pointer-${width}.json`), JSON.stringify(alternate, null, 2));
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: mobile ? 5 : 1 });
      const beforeKeep = await evaluate(cdp, '({node:variationStore.getState().currentNode.id,stones:document.querySelector("[data-board-snapshot]").dataset.boardStones})');
      await click('.cl-pv-action:nth-child(2)');
      await wait('(()=>{const first=variationStore.getState().currentNode.children[0],second=first?.children[0],third=second?.children[0];return first?.move.x===4&&first.move.y===4&&second?.move.x===5&&second.move.y===4&&third?.move.x===4&&third.move.y===3})()');
      assert.deepEqual(await evaluate(cdp, '({node:variationStore.getState().currentNode.id,stones:document.querySelector("[data-board-snapshot]").dataset.boardStones})'), beforeKeep);
      cases.push('native-keep-in-tree');
      reports.push({ width, cases, nativeClipboard: true, staleLegacyCopies: 0, alternatePointerTargets: alternate.targets });
      fs.writeFileSync(path.join(output, 'variation-copy.json'), JSON.stringify(reports, null, 2));
      console.log('Variation copy', JSON.stringify(reports.at(-1)));
    }
  } catch (error) {
    const state = await evaluate(cdp, '({body:document.body.innerText,focus:document.activeElement?.outerHTML,toast:document.querySelector(".notification-toast-message")?.title})').catch(() => null);
    fs.writeFileSync(path.join(output, `variation-copy-failure-${activeWidth}.json`), JSON.stringify({ error: String(error), state }, null, 2));
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }).catch(() => null);
    if (shot) fs.writeFileSync(path.join(output, `variation-copy-failure-${activeWidth}.png`), Buffer.from(shot.result.data, 'base64'));
    throw error;
  } finally {
    await evaluate(cdp, `(async()=>{const o=window.variationOriginals;if(!o)return;await o.clipboard.writeText('');Object.defineProperty(navigator,'clipboard',{configurable:true,value:o.clipboard});document.execCommand=o.exec;window.setTimeout=o.timer})()`).catch(() => undefined);
    await cdp.send('Browser.resetPermissions');
  }
}
