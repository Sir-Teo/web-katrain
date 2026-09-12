import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { connectDevtools, evaluate, loadedModuleUrl, navigate, setViewport, sleep } from './browser.mjs';

// Exercise real imports, row menus, typing and persistence. Empty tags are a
// valid edit even though the same dialog requires a name for other actions.
export async function assertLibraryTags(devtoolsPort, appUrl, runDir, screenshotDir) {
  const version = await (await fetch(`http://127.0.0.1:${devtoolsPort}/json/version`)).json();
  const browser = connectDevtools(version.webSocketDebuggerUrl);
  await browser.ready;
  const failures = [];
  const reports = [];
  const dialog = '[aria-labelledby="library-text-dialog-title"]';
  try {
    for (const [width, height] of [[1280, 800], [390, 844], [320, 568]]) {
      const context = (await browser.send('Target.createBrowserContext')).result.browserContextId;
      const target = (await browser.send('Target.createTarget', { url: 'about:blank', browserContextId: context })).result.targetId;
      const cdp = connectDevtools(`ws://127.0.0.1:${devtoolsPort}/devtools/page/${target}`);
      await cdp.ready;
      const mobile = width < 1000;
      const stem = `${width}x${height}-library-tags`;
      const name = `Tag audit ${width}`;
      const copyName = `${name} (copy)`;
      const tag = `tagcheck${width}`;
      const report = { width, height, stages: [] };
      const errors = [];
      const wait = async expression => {
        for (let i = 0; i < 150; i++) {
          const result = await evaluate(cdp, expression);
          if (result) return result;
          await sleep(100);
        }
        throw new Error(`Library tags check timed out: ${expression}`);
      };
      const clickElement = async expression => {
        const point = await wait(`(()=>{
          const e=${expression};if(!e)return false;e.scrollIntoView({block:'nearest'});
          const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
          return !e.disabled&&r.width&&r.height&&!e.closest('[inert]')&&e.contains(document.elementFromPoint(x,y))?{x,y}:false;
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
      const click = selector => clickElement(`document.querySelector(${JSON.stringify(selector)})`);
      const key = async (key, code) => {
        for (const type of ['keyDown', 'keyUp']) {
          await cdp.send('Input.dispatchKeyEvent', { type, key, windowsVirtualKeyCode: code });
        }
      };
      const menuAction = (label, menu = 'Library actions') => clickElement(
        `[...document.querySelectorAll('[role="menu"][aria-label=${JSON.stringify(menu)}] [role="menuitem"]')].find(e=>e.textContent.trim()===${JSON.stringify(label)})`
      );
      const openMenu = async itemName => {
        if (mobile) await click(`button[aria-label=${JSON.stringify(`More actions for ${itemName}`)}]`);
        else {
          const point = await wait(`(()=>{
            const e=document.querySelector(${JSON.stringify(`[data-library-row-name=${JSON.stringify(itemName)}]`)});
            if(!e)return false;e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();
            return r.width?{x:r.x+r.width/2,y:r.y+r.height/2}:false;
          })()`);
          for (const type of ['mousePressed', 'mouseReleased']) {
            await cdp.send('Input.dispatchMouseEvent', { type, ...point, button: 'right', clickCount: 1 });
          }
        }
        await wait(`!!document.querySelector('[role=menu][aria-label="Library actions"]')`);
      };
      const focusedDialog = () => wait(`(()=>{
        const input=document.querySelector('${dialog} input');
        return !!input&&document.activeElement===input&&input.selectionStart===0&&input.selectionEnd===input.value.length;
      })()`);
      const closedDialog = async () => {
        await wait(`!document.querySelector('${dialog}')`);
        // Closing a phone overlay asynchronously pops its synthetic history
        // entry. Let that finish before opening another dialog or reloading.
        if (mobile) await wait('!history.state?.webKatrainOverlay');
      };
      const dialogButton = text => clickElement(
        `[...document.querySelectorAll('${dialog} button')].find(e=>e.textContent.trim()===${JSON.stringify(text)})`
      );
      const search = async text => {
        if (await evaluate(cdp, `!!document.querySelector('button[aria-label="Clear library search"]')`)) {
          await click('button[aria-label="Clear library search"]');
          await wait(`document.querySelector('input[aria-label="Search library"]').value===''`);
        }
        await click('input[aria-label="Search library"]');
        await cdp.send('Input.insertText', { text });
        await wait(`document.querySelector('input[aria-label="Search library"]').value===${JSON.stringify(text)}`);
      };
      const loadModule = () => evaluate(cdp, `(async()=>{
        const moduleUrl=${loadedModuleUrl.toString()};window.tagAuditLibrary=await import(moduleUrl('/src/utils/library.ts'));return true;
      })()`);
      const savedItems = () => evaluate(cdp, 'tagAuditLibrary.loadLibrary()');
      const persisted = expression => wait(`(async()=>{const items=await tagAuditLibrary.loadLibrary();return ${expression}})()`);
      const tagsOf = itemName => `items.find(i=>i.name===${JSON.stringify(itemName)})?.tags`;
      const editTags = async itemName => {
        await openMenu(itemName);
        await menuAction('Edit tags');
        await focusedDialog();
      };
      const nonemptyNameRequired = async submitLabel => {
        await focusedDialog();
        await cdp.send('Input.insertText', { text: '   ' });
        assert.equal(await evaluate(cdp, `[...document.querySelectorAll('${dialog} button')].find(e=>e.textContent.trim()===${JSON.stringify(submitLabel)}).disabled`), true);
        await key('Enter', 13);
        assert.equal(await evaluate(cdp, `!!document.querySelector('${dialog}')`), true);
        await dialogButton('Cancel');
        await closedDialog();
      };
      try {
        await cdp.send('Runtime.enable');
        cdp.on(message => {
          if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
        });
        await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
        await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
          performance.setResourceTimingBufferSize(5000);
          localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');
          localStorage.setItem('web-katrain:library_open:v1','true');
          localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
          localStorage.setItem('web-katrain:settings:v3',JSON.stringify({soundEnabled:false,loadSgfFastAnalysis:false}));
        ` });
        await setViewport(cdp, { width, height, mobile });
        await navigate(cdp, appUrl);
        await wait('!!document.querySelector("[data-board-snapshot=true]")');
        if (mobile) await click('#mobile-tab-library');
        await wait('!!document.querySelector("input[type=file][multiple]")');
        const file = path.join(runDir, `${name}.sgf`);
        fs.writeFileSync(file, '(;GM[1]SZ[9]PB[Tag student]C[Saved study];B[dd];W[ff])');
        const root = (await cdp.send('DOM.getDocument')).result.root;
        const nodeId = (await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[type=file][multiple]' })).result.nodeId;
        const imported = await cdp.send('DOM.setFileInputFiles', { nodeId, files: [file] });
        assert.ok(!imported.error, JSON.stringify(imported.error));
        await loadModule();
        await persisted(`items.some(i=>i.name===${JSON.stringify(name)})`);
        await search(name);
        await openMenu(name);
        await menuAction('Star');
        await editTags(name);
        await cdp.send('Input.insertText', { text: `review, ${tag}` });
        await dialogButton('Save tags');
        await closedDialog();
        await persisted(`${tagsOf(name)}?.includes(${JSON.stringify(tag)})`);
        await openMenu(name);
        await menuAction('Duplicate');
        await persisted(`${tagsOf(copyName)}?.includes(${JSON.stringify(tag)})`);
        const originals = (await savedItems()).filter(i => i.name === name || i.name === copyName);
        assert.equal(originals.length, 2);
        assert.ok(originals.every(i => i.favorite === true && i.tags.length === 2));
        assert.deepEqual(originals[0].metadata, originals[1].metadata);
        assert.equal(originals[0].sgf, originals[1].sgf);
        report.stages.push('Imported, starred, tagged and duplicated with saved metadata');

        await editTags(copyName);
        await key('Backspace', 8);
        await dialogButton('Cancel');
        await closedDialog();
        assert.equal((await savedItems()).find(i => i.name === copyName).tags.length, 2);
        await search(tag);
        await wait('document.querySelectorAll("[data-library-row=file]").length===2');
        await editTags(copyName);
        await key('Backspace', 8);
        const clearState = await evaluate(cdp, `(()=>{
          const d=document.querySelector('${dialog}'),r=d.getBoundingClientRect();
          return {value:d.querySelector('input').value,saveDisabled:[...d.querySelectorAll('button')].find(b=>b.textContent.trim()==='Save tags').disabled,
            left:r.left,right:r.right,top:r.top,bottom:r.bottom};
        })()`);
        report.clearState = clearState;
        assert.equal(clearState.value, '');
        assert.equal(clearState.saveDisabled, false, 'An empty tag list must be saveable');
        assert.ok(clearState.left >= 0 && clearState.right <= width && clearState.top >= 0 && clearState.bottom <= height);
        await dialogButton('Save tags');
        await closedDialog();
        await persisted(`(${tagsOf(copyName)}?.length??0)===0`);
        await wait(`document.querySelectorAll('[data-library-row=file]').length===1&&!!document.querySelector('[data-library-row-name=${JSON.stringify(name)}]')`);
        assert.equal((await savedItems()).find(i => i.name === name).tags.length, 2);
        report.stages.push('Canceled clearing preserves tags; saving an empty list changes only the copy and its search result');

        await editTags(name);
        await cdp.send('Input.insertText', { text: '   ' });
        await key('Enter', 13);
        await closedDialog();
        await persisted(`(${tagsOf(name)}?.length??0)===0`);
        await wait('document.querySelectorAll("[data-library-row=file]").length===0');
        assert.equal(await evaluate(cdp, `[...document.querySelectorAll('select[aria-label="Filter by tag"] option')].some(o=>o.value===${JSON.stringify(tag)})`), false);
        await search(name);
        await openMenu(copyName);
        await menuAction('Rename');
        await nonemptyNameRequired('Rename');
        await click('button[aria-label="More library actions"]');
        await menuAction('Create new folder', 'More library actions');
        await nonemptyNameRequired('Create');
        await click('button[aria-label="Save current game to Library"]');
        await nonemptyNameRequired('Save');
        report.stages.push('Whitespace clears tags with Enter; Rename, New Folder and Save still require names');

        await navigate(cdp, appUrl);
        await wait('!!document.querySelector("[data-board-snapshot=true]")');
        if (mobile) await click('#mobile-tab-library');
        await wait(`!!document.querySelector('input[aria-label="Search library"]')`);
        await loadModule();
        await search(name);
        await wait('document.querySelectorAll("[data-library-row=file]").length===2');
        const reloaded = await savedItems();
        for (const original of originals) {
          const restored = reloaded.find(i => i.id === original.id);
          assert.ok(restored, 'The same saved item must survive reload');
          assert.equal(restored.name, original.name);
          assert.deepEqual(restored.tags ?? [], []);
          assert.equal(restored.favorite, true);
          assert.equal(restored.sgf, original.sgf);
          assert.deepEqual(restored.metadata, original.metadata);
        }
        assert.deepEqual(errors, []);
        assert.ok(await evaluate(cdp, 'document.documentElement.scrollWidth<=innerWidth+1'));
        report.stages.push('Reload retains both games, stars and metadata with all tags cleared');
        console.log(`Library tags at ${width}x${height}: copy, cancel, clear, filter, required names and reload passed.`);
      } catch (error) {
        failures.push(`${stem}: ${error.message}`);
        report.error = error.message;
      } finally {
        const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(screenshotDir, `${stem}.png`), Buffer.from(screenshot.result.data, 'base64'));
        reports.push(report);
        fs.writeFileSync(path.join(screenshotDir, 'library-tags.json'), JSON.stringify(reports, null, 2));
        cdp.close();
        await browser.send('Target.disposeBrowserContext', { browserContextId: context });
      }
    }
    assert.deepEqual(failures, [], 'Library tag editing must preserve valid empty values');
  } finally {
    browser.close();
  }
}
