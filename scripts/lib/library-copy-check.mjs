import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evaluate, navigate, setViewport, waitForExpression } from './browser.mjs';

export async function assertLibraryCopy(cdp, appUrl, runDir, screenshotDir) {
  const sgf = '(;GM[1]FF[4]CA[UTF-8]SZ[9]GN[Annotated study]C[Notes: Éloïse];B[dd](;W[ee])(;W[ff]))(;GM[1]FF[4]CA[UTF-8]SZ[13]GN[Second game];B[gg])';
  const fixture = path.join(runDir, 'library-copy-fixture.json');
  fs.writeFileSync(fixture, JSON.stringify({ app: 'web-katrain', version: 2, items: [
    { id: 'copy-folder', type: 'folder', name: 'Copy folder', parentId: null, createdAt: 1, updatedAt: 1 },
    { id: 'copy-game', type: 'file', name: 'Copy archive', sgf, parentId: null, createdAt: 1, updatedAt: 1 },
  ] }));
  const wait = expression => waitForExpression(cdp, expression, { label: 'Library clipboard', diagnose: `({focus:document.activeElement?.getAttribute('aria-label'),toast:document.querySelector('.notification-toast-message')?.title,clipboard:window.libraryCopyAudit})` });
  let mobile = false;
  const click = async selector => {
    const point = await wait(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)return false;e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return r.width&&e.contains(document.elementFromPoint(x,y))?{x,y}:false})()`);
    if (mobile) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else for (const type of ['mousePressed', 'mouseReleased']) await cdp.send('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 });
  };
  const press = async (key, code, windowsVirtualKeyCode) => {
    for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode, ...(type === 'keyDown' && key === 'Enter' ? { text: '\r' } : {}) });
  };
  const reports = [];
  for (const width of [1440, 390, 320]) {
    mobile = width < 1000;
    const setup = await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
      localStorage.removeItem('web-katrain:auto_saved_game:v1');
      localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');
      localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
      localStorage.setItem('web-katrain:library_open:v1','true');
      localStorage.setItem('web-katrain:settings:v3',JSON.stringify({soundEnabled:false,loadSgfFastAnalysis:false}));
    ` });
    try { await setViewport(cdp, { width, height: width === 320 ? 568 : mobile ? 844 : 900, mobile }); await navigate(cdp, appUrl, 15000, { acceptBeforeUnload: true }); }
    finally { await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: setup.result.identifier }); }
    await wait('!!document.querySelector("[data-board-snapshot]")'); if (mobile) await click('#mobile-tab-library');
    await wait('document.querySelector("[data-library-storage-badge]")?.textContent==="IndexedDB"');
    const root = (await cdp.send('DOM.getDocument')).result.root;
    const input = (await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[type=file][accept=".json,application/json"]' })).result.nodeId;
    await cdp.send('DOM.setFileInputFiles', { nodeId: input, files: [fixture] });
    await wait('!!document.querySelector("[aria-labelledby=library-confirm-dialog-title]")');
    await click('[aria-labelledby=library-confirm-dialog-title] button.danger');
    await wait('!!document.querySelector("[data-library-row-id=copy-game]")&&!document.querySelector("[role=dialog]")&&!history.state?.webKatrainOverlay&&document.querySelector("[data-library-storage-badge]")?.textContent==="IndexedDB"');
    const readStored = `new Promise((resolve,reject)=>{const r=indexedDB.open('web-katrain-library');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,q=db.transaction('items').objectStore('items').getAll();q.onsuccess=()=>{db.close();resolve(q.result)}}})`;
    const beforeItems = await evaluate(cdp, readStored);
    const beforeBoard = await evaluate(cdp, '({...document.querySelector("[data-board-snapshot]").dataset})');
    await evaluate(cdp, `(()=>{
      window.libraryCopyAudit={mode:'modern',width:${width},modern:[],legacy:[],attempts:[],clicks:[]};
      document.addEventListener('click',event=>{const e=event.target instanceof Element?event.target.closest('[role=menuitem]'):null;if(e)libraryCopyAudit.clicks.push({label:e.textContent.trim(),mode:libraryCopyAudit.mode,trusted:event.isTrusted})},true);
      Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{
        libraryCopyAudit.attempts.push({route:'modern',mode:libraryCopyAudit.mode});
        if(libraryCopyAudit.mode!=='modern')throw new DOMException('Clipboard access denied','NotAllowedError');
        libraryCopyAudit.modern.push(text);
      }}});
      document.execCommand=command=>{
        libraryCopyAudit.attempts.push({route:'legacy',mode:libraryCopyAudit.mode});
        if(command!=='copy'||libraryCopyAudit.mode!=='legacy')return false;
        libraryCopyAudit.legacy.push(document.activeElement.value);return true;
      };return true;
    })()`);
    for (const mode of ['modern', 'legacy', 'denied', 'modern']) {
      await evaluate(cdp, `libraryCopyAudit.mode=${JSON.stringify(mode)};void 0`);
      await click('[data-library-row-id=copy-game] .library-tree-node-more');
      await wait('!!document.querySelector("[data-library-copy-sgf]")');
      assert.equal(await evaluate(cdp, 'document.querySelector("[role=menu]").contains(document.activeElement)'), true, 'Copy menu must be ready for keyboard navigation when it appears');
      if (mode === 'legacy') {
        await press('Home', 'Home', 36);
        const index = await evaluate(cdp, '[...document.querySelectorAll("[role=menu] [role=menuitem]")].findIndex(e=>e.matches("[data-library-copy-sgf]"))');
        for (let i = 0; i < index; i++) await press('ArrowDown', 'ArrowDown', 40);
        await press('Enter', 'Enter', 13);
      } else await click('[data-library-copy-sgf]');
      await wait('!document.querySelector("[role=menu]")');
      await wait(mode === 'denied'
        ? 'document.querySelector(".notification-toast-message")?.title.startsWith("Could not copy SGF.")'
        : 'document.querySelector(".notification-toast-message")?.title===\'Copied "Copy archive" as SGF.\'');
      await wait('document.activeElement===document.querySelector("[data-library-row-id=copy-game] .library-tree-node-more")');
    }
    assert.deepEqual(await evaluate(cdp, 'libraryCopyAudit.modern'), [sgf, sgf]);
    assert.deepEqual(await evaluate(cdp, 'libraryCopyAudit.legacy'), [sgf]);
    assert.deepEqual(await evaluate(cdp, readStored), beforeItems, 'Copy must preserve every stored record');
    assert.deepEqual(await evaluate(cdp, '({...document.querySelector("[data-board-snapshot]").dataset})'), beforeBoard, 'Copy must not load the archived game');
    await click('[data-library-row-id=copy-folder] .library-tree-node-more'); await wait('!!document.querySelector("[role=menu]")');
    assert.equal(await evaluate(cdp, '!!document.querySelector("[data-library-copy-sgf]")'), false);
    await press('Escape', 'Escape', 27);
    await click('[aria-label="Select all"]');
    await click('[data-library-row-id=copy-game] .library-tree-node-more'); await wait('!!document.querySelector("[role=menu]")');
    assert.equal(await evaluate(cdp, '!!document.querySelector("[data-library-copy-sgf]")'), false);
    await press('Escape', 'Escape', 27);
    reports.push({ width, completeCollectionCopied: true, modernAndLegacyRoutes: true, deniedCopyHasNoSuccess: true, retryReplacesError: true, nativePointerAndEnter: true, focusRestored: true, boardAndStorageUnchanged: true, absentForFoldersAndBulk: true });
  }
  fs.writeFileSync(path.join(screenshotDir, 'library-copy.json'), JSON.stringify(reports, null, 2));
  console.log('Library Copy SGF: desktop/phone/compact complete collections, modern and legacy clipboard routes, denied-copy retry, native input, focus and unchanged board/storage passed.');
}
