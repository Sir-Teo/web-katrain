import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { connectDevtools, evaluate, loadedModuleUrl, navigate, setViewport, waitForExpression } from './browser.mjs';

export async function assertDraftSaveSnapshots(devtoolsPort, appUrl, runDir, screenshotDir) {
  const version = await (await fetch(`http://127.0.0.1:${devtoolsPort}/json/version`)).json();
  const browser = connectDevtools(version.webSocketDebuggerUrl);
  await browser.ready;
  const filesDir = fs.mkdtempSync(path.join(runDir, 'draft-save-'));
  const filename = path.join(filesDir, 'Saved note.sgf');
  const baseline = 'Saved baseline note';
  fs.writeFileSync(filename, `(;GM[1]SZ[9]KM[7.5]PB[Original Black]C[${baseline}])`);
  const reports = [];
  const scenarios = [
    ...[[1280, 800], [390, 844], [320, 568]].flatMap(([width, height]) =>
      ['download', 'copy-sgf', 'copy-share-link', 'library-copy', 'cancel'].map(action => ({ width, height, action }))),
    { width: 1280, height: 800, action: 'library-panel' },
    { width: 1280, height: 800, action: 'copy-shortcut' },
  ];
  try {
    for (const { width, height, action } of scenarios) {
      const mobile = width < 1000;
      const context = (await browser.send('Target.createBrowserContext')).result.browserContextId;
      const target = (await browser.send('Target.createTarget', { url: 'about:blank', browserContextId: context })).result.targetId;
      const cdp = connectDevtools(`ws://127.0.0.1:${devtoolsPort}/devtools/page/${target}`);
      await cdp.ready;
      const downloads = path.join(filesDir, `${width}-${action}`);
      fs.mkdirSync(downloads);
      const wait = expression => waitForExpression(cdp, expression, { label: `Draft save ${action}`, timeoutMs: 15_000 });
      const key = async (key, code, modifiers = 0) => {
        for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', { type, key, windowsVirtualKeyCode: code, modifiers, ...(type === 'keyDown' && key === 'Enter' ? { text: '\r' } : {}) });
      };
      const click = async expression => {
        const point = await wait(`(async()=>{const e=${expression};if(!e)return false;e.scrollIntoView({block:'nearest'});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));if(!e.isConnected)return false;const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return !e.disabled&&r.width&&r.height&&e.contains(document.elementFromPoint(x,y))?{x,y}:false})()`);
        if (mobile) {
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        } else for (const type of ['mousePressed', 'mouseReleased']) await cdp.send('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 });
      };
      const edit = async text => {
        if (mobile) await click('document.querySelector("#mobile-tab-info")');
        const notice = `document.querySelector('[aria-label="Dismiss notification"]')`;
        if (await evaluate(cdp, `!!${notice}`)) await click(notice);
        const comment = `[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Comment')`;
        if (await evaluate(cdp, `${comment}?.getAttribute('aria-expanded')!=='true'`)) await click(comment);
        await click('document.querySelector("[data-note-preview]")');
        await wait('document.querySelector("[data-note-editor]")===document.activeElement');
        await key('a', 65, 2);
        if (text) await cdp.send('Input.insertText', { text });
        else await key('Backspace', 8);
        await wait(`document.querySelector('[data-note-editor]').value===${JSON.stringify(text)}`);
      };
      const run = async id => {
        if (mobile) {
          // Review deliberately covers the app header. Returning to Board is
          // the phone's route to File actions and must retain the draft too.
          await click('document.querySelector("#mobile-tab-board")');
          await click(`document.querySelector('button[aria-label="Menu"]')`);
          const label = id === 'save-sgf' ? 'Save SGF,' : id === 'save-library' ? 'Save a copy to Library,' : id === 'copy-sgf' ? 'Copy SGF,' : null;
          await click(label
            ? `document.querySelector('[aria-labelledby="menu-title"] button[aria-label^=${JSON.stringify(label)}]')`
            : `[...document.querySelectorAll('[aria-labelledby="menu-title"] button')].find(e=>e.textContent.trim()==='Copy share link')`);
          await wait(id === 'save-library' ? '!document.querySelector("#menu-title")' : '!document.querySelector("#menu-title")&&!history.state?.webKatrainOverlay');
        } else if (id === 'save-sgf') {
          await click(`document.querySelector('button[aria-label="Save SGF"]')`);
        } else {
          await click(`document.querySelector('button[aria-label="Command palette"]')`);
          await wait('!!document.querySelector("[data-command-palette-search]")');
          await click(`document.querySelector('[data-command-palette-item="${id}"]')`);
          await wait(id === 'save-library' ? '!document.querySelector("#command-palette-title")' : '!document.querySelector("#command-palette-title")&&!history.state?.webKatrainOverlay');
        }
      };
      const savedNote = () => evaluate(cdp, 'draftSaveStore.getState().rootNode.note??""');
      const inspectSgf = sgf => evaluate(cdp, `(()=>{const g=draftSaveParse(${JSON.stringify(sgf)});return {note:draftSaveExtractNote(g.tree.props.C),black:g.tree.props.PB?.[0],size:g.tree.props.SZ?.[0]}})()`);
      const assertSgf = async (sgf, expected) => assert.deepEqual(await inspectSgf(sgf), { note: expected, black: 'Original Black', size: '9' });
      const readDownload = async previousCount => {
        let names = [];
        const deadline = Date.now() + 15_000;
        while (Date.now() < deadline) {
          names = fs.readdirSync(downloads).filter(name => !name.endsWith('.crdownload'));
          if (names.length > previousCount) break;
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        assert.equal(names.length, previousCount + 1, 'Save did not download one SGF');
        return fs.readFileSync(path.join(downloads, names.sort((a, b) => fs.statSync(path.join(downloads, b)).mtimeMs - fs.statSync(path.join(downloads, a)).mtimeMs)[0]), 'utf8');
      };
      const recovery = 'JSON.parse(localStorage.getItem("web-katrain:auto_saved_game:v1")??"null")?.sgf';
      try {
        await cdp.send('Page.enable');
        await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
        // GUID names retain both downloads when the app suggests the same
        // filename for the edited game and its later comment deletion.
        await browser.send('Browser.setDownloadBehavior', { behavior: 'allowAndName', downloadPath: downloads, browserContextId: context });
        await browser.send('Browser.grantPermissions', { origin: new URL(appUrl).origin, browserContextId: context, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] });
        await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
          performance.setResourceTimingBufferSize(5000);
          localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');
          localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
          localStorage.setItem('web-katrain:settings:v3',JSON.stringify({soundEnabled:false,loadSgfFastAnalysis:false}));
        ` });
        await setViewport(cdp, { width, height, mobile });
        await navigate(cdp, appUrl);
        await wait('!!document.querySelector("[data-board-snapshot=true]")');
        await evaluate(cdp, `(async()=>{const url=${loadedModuleUrl.toString()};window.draftSaveStore=(await import(url('/src/store/gameStore.ts'))).useGameStore;const sgf=await import(url('/src/utils/sgf.ts'));window.draftSaveParse=sgf.parseSgf;window.draftSaveExtractNote=sgf.extractKaTrainUserNoteFromSgfComment;window.draftSaveLibrary=(await import(url('/src/utils/library.ts'))).loadLibrary;return true})()`);
        const rootId = await evaluate(cdp, 'draftSaveStore.getState().rootNode.id');
        const doc = (await cdp.send('DOM.getDocument')).result.root;
        const nodeId = (await cdp.send('DOM.querySelector', { nodeId: doc.nodeId, selector: 'input[type=file][accept^=".sgf"]:not([multiple])' })).result.nodeId;
        await cdp.send('DOM.setFileInputFiles', { nodeId, files: [filename] });
        await wait(`draftSaveStore.getState().rootNode.id!==${JSON.stringify(rootId)}`);
        if (action === 'library-panel') {
          await click(`document.querySelector('button[aria-label="Library"]')`);
          await wait(`document.querySelector('[data-library-storage-badge=true]')?.textContent==='IndexedDB'`);
        }
        const latest = `Latest ${action} thought — 厚み`;
        await edit(latest);
        assert.equal(await savedNote(), baseline, 'The fixture had already committed its editor before Save');
        if (action === 'download' || action === 'cancel') {
          if (action === 'cancel') await click('document.querySelector("[data-note-cancel]")');
          await run('save-sgf');
          await assertSgf(await readDownload(0), action === 'cancel' ? baseline : latest);
          await wait(`!(${recovery})`);
          if (action === 'download') {
            await edit('');
            await run('save-sgf');
            await assertSgf(await readDownload(1), '');
            await wait(`!(${recovery})`);
          } else assert.equal(await evaluate(cdp, 'draftSaveStore.getState().editUndoCount'), 0, 'Canceled text was recorded as an edit');
        } else if (action === 'copy-sgf' || action === 'copy-share-link' || action === 'copy-shortcut') {
          if (action === 'copy-shortcut') {
            await key('Tab', 9);
            await wait('document.activeElement?.tagName!=="TEXTAREA"');
            await key('c', 67, 2);
          } else await run(action);
          const copied = await wait(`(async()=>{const text=await navigator.clipboard.readText();return text.startsWith(${JSON.stringify(action === 'copy-share-link' ? 'http' : '(;')})?text:false})()`);
          const sgf = action !== 'copy-share-link' ? copied : await evaluate(cdp, `(async()=>{const url=${loadedModuleUrl.toString()};return(await import(url('/src/utils/shareLink.ts'))).decodeSgfFromFragment(new URL(${JSON.stringify(copied)}).hash)})()`);
          await assertSgf(sgf, latest);
          await wait(`(${recovery})?.includes(${JSON.stringify(latest)})`);
          assert.equal(await savedNote(), latest);
        } else {
          const name = `Draft ${action} ${width}`;
          if (action === 'library-panel') {
            await click(`document.querySelector('button[aria-label="Save current game to Library"]')`);
            await wait(`document.activeElement===document.querySelector('[aria-labelledby="library-text-dialog-title"] input')`);
            await cdp.send('Input.insertText', { text: name });
            await key('Enter', 13);
          } else {
            await run('save-library');
            await wait('document.activeElement===document.querySelector("#save-to-library-name")');
            await cdp.send('Input.insertText', { text: name });
            await key('Enter', 13);
          }
          const stored = await wait(`(async()=>{const item=(await draftSaveLibrary()).find(e=>e.type==='file'&&e.name===${JSON.stringify(name)});return item?.sgf?item:false})()`);
          await assertSgf(stored.sgf, latest);
          await wait('!document.querySelector("#save-to-library-title,#library-text-dialog-title")&&!history.state?.webKatrainOverlay');
          await wait(`!(${recovery})`);
          await edit(`${latest} updated`);
          if (mobile) {
            await click('document.querySelector("#mobile-tab-board")');
            await click(`document.querySelector('button[aria-label="Menu"]')`);
            await click(`document.querySelector('[aria-labelledby="menu-title"] button[aria-label^="Save to Library,"]')`);
            await wait('!document.querySelector("#menu-title")&&!history.state?.webKatrainOverlay');
          } else if (action === 'library-panel') await click(`document.querySelector('button[aria-label="Update loaded library game"]')`);
          else await run('save-sgf');
          const updated = await wait(`(async()=>{const item=(await draftSaveLibrary()).find(e=>e.id===${JSON.stringify(stored.id)});return item?.sgf.includes('updated')?item:false})()`);
          await assertSgf(updated.sgf, `${latest} updated`);
          await wait(`!(${recovery})`);
        }
        assert.equal(await evaluate(cdp, 'draftSaveStore.getState().board.length'), 9);
        assert.equal(await evaluate(cdp, 'draftSaveStore.getState().moveHistory.length'), 0);
        reports.push({ width, height, action, latestDraftIncluded: true });
        const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(screenshotDir, `${width}x${height}-draft-save-${action}.png`), Buffer.from(screenshot.result.data, 'base64'));
      } catch (error) {
        const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(screenshotDir, `${width}x${height}-draft-save-${action}-failed.png`), Buffer.from(screenshot.result.data, 'base64'));
        throw error;
      } finally {
        cdp.close();
        await browser.send('Target.disposeBrowserContext', { browserContextId: context });
      }
    }
    fs.writeFileSync(path.join(screenshotDir, 'draft-save.json'), JSON.stringify(reports, null, 2));
    console.log('Draft saves: SGF downloads, clipboard copies, share links and Library saves include the latest note; Cancel, deletion, updates and mobile handoff passed.');
  } finally {
    browser.close();
    fs.rmSync(filesDir, { recursive: true, force: true });
  }
}
