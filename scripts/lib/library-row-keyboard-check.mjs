import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evaluate, navigate, setViewport, waitForExpression } from './browser.mjs';

export async function assertLibraryRowKeyboard(cdp, appUrl, runDir, screenshotDir) {
  const fixture = path.join(runDir, 'library-row-keyboard.json');
  fs.writeFileSync(fixture, JSON.stringify({ app: 'web-katrain', version: 2, items: [
    { id: 'keys-folder', name: 'Keyboard studies', type: 'folder', parentId: null, createdAt: 1, updatedAt: 1 },
    { id: 'keys-game', name: 'Keyboard game', type: 'file', parentId: 'keys-folder', createdAt: 1, updatedAt: 1, sgf: '(;GM[1]SZ[9];B[dd];W[ee])' },
    { id: 'keys-other', name: 'Keyboard other', type: 'file', parentId: null, createdAt: 1, updatedAt: 1, sgf: '(;GM[1]SZ[13];B[dd])' },
  ] }));
  const wait = expression => waitForExpression(cdp, expression, {
    label: 'Library row keyboard controls',
    diagnose: `({focus:document.activeElement?.getAttribute('aria-label'),path:document.querySelector('.library-breadcrumbs')?.innerText,
      menus:document.querySelectorAll('[role=menu]').length,events:window.libraryRowKeyEvents?.slice(-20),rows:[...document.querySelectorAll('[data-library-row]')].map(e=>({name:e.dataset.libraryRowName,selected:e.getAttribute('aria-selected'),expanded:e.getAttribute('aria-expanded')}))})`,
  });
  const press = async (key, shiftKey = false) => {
    const code = key === ' ' ? 'Space' : key;
    const windowsVirtualKeyCode = { Enter: 13, ' ': 32, Escape: 27, F10: 121, Home: 36, End: 35, ArrowLeft: 37, ArrowRight: 39, ArrowUp: 38, ArrowDown: 40 }[key];
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode,
      modifiers: shiftKey ? 8 : 0, ...(key === 'Enter' ? { text: '\r' } : key === ' ' ? { text: ' ' } : {}) });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode });
  };
  const click = async selector => {
    const point = await wait(`(()=>{
      const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)return false;
      e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
      return r.width&&e.contains(document.elementFromPoint(x,y))?{x,y}:false;
    })()`);
    for (const type of ['mousePressed', 'mouseReleased']) await cdp.send('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 });
  };
  const focus = async selector => {
    await evaluate(cdp, `document.querySelector(${JSON.stringify(selector)}).focus()`);
    await wait(`document.activeElement===document.querySelector(${JSON.stringify(selector)})`);
  };
  const folder = '[data-library-row-name="Keyboard studies"]';
  const file = '[data-library-row-name="Keyboard game"]';
  const board = () => evaluate(cdp, '({...document.querySelector("[data-board-snapshot]")?.dataset})');
  const reports = [];
  for (const width of [1440, 390]) {
    const setup = await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
      localStorage.removeItem('web-katrain:auto_saved_game:v1');
      localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');
      localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
      localStorage.setItem('web-katrain:library_open:v1','true');
      localStorage.setItem('web-katrain:library_sort:v1','name');
      localStorage.setItem('web-katrain:settings:v3',JSON.stringify({soundEnabled:false,loadSgfFastAnalysis:false}));
      window.libraryRowKeyEvents=[];
      for(const type of ['keydown','scroll','focusin','contextmenu'])document.addEventListener(type,e=>{
        libraryRowKeyEvents.push({type,key:e.key,shift:e.shiftKey,target:e.target?.getAttribute?.('aria-label')||e.target?.className||e.target?.tagName});
        if(libraryRowKeyEvents.length>50)libraryRowKeyEvents.shift();
      },true);
    ` });
    try {
      await setViewport(cdp, { width, height: width === 390 ? 844 : 900, mobile: width === 390 });
      await navigate(cdp, appUrl, 15000, { acceptBeforeUnload: true });
    } finally { await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: setup.result.identifier }); }
    await wait('!!document.querySelector("[data-board-snapshot]")');
    if (width === 390) await click('#mobile-tab-library');
    await wait('document.querySelector("[data-library-storage-badge]")?.textContent==="IndexedDB"');
    const root = (await cdp.send('DOM.getDocument')).result.root;
    const input = (await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[type=file][accept=".json,application/json"]' })).result.nodeId;
    await cdp.send('DOM.setFileInputFiles', { nodeId: input, files: [fixture] });
    await wait('!!document.querySelector("[aria-labelledby=library-confirm-dialog-title]")');
    await click('[aria-labelledby=library-confirm-dialog-title] button.danger');
    await wait(`!document.querySelector('[role=dialog]')&&!history.state?.webKatrainOverlay&&!!document.querySelector('${folder}')&&document.querySelector('[data-library-storage-badge]')?.textContent==='IndexedDB'`);
    const accessibleTree = (await cdp.send('Accessibility.getFullAXTree')).result.nodes
      .find(node => node.role?.value === 'tree' && node.name?.value === 'Library games');
    assert.match(accessibleTree?.description?.value ?? '', /Up and Down arrows/, 'Screen readers must receive the row navigation instructions');
    const before = await board();
    const pathBefore = await evaluate(cdp, 'document.querySelector(".library-breadcrumbs")?.innerText');
    // Nested native controls own Enter/Space; neither should activate the row.
    for (const key of ['Enter', ' ']) {
      await focus(`${folder} button[aria-label="More actions for Keyboard studies"]`); await press(key);
      await wait(`document.querySelector('[role=menu][aria-label="Library actions"]')?.contains(document.activeElement)`);
      assert.equal(await evaluate(cdp, 'document.querySelector(".library-breadcrumbs")?.innerText'), pathBefore);
      await press('Escape'); await wait('!document.querySelector("[role=menu]")');
      assert.equal(await evaluate(cdp, `document.activeElement===document.querySelector('${folder} button[aria-label="More actions for Keyboard studies"]')`),true,'Closing the folder menu must restore its opener');
      await focus(`${folder} button[aria-label="Select Keyboard studies"]`); await press(key);
      await wait(`document.querySelector('${folder}').getAttribute('aria-selected')==='true'`);
      assert.equal(await evaluate(cdp, 'document.querySelector(".library-breadcrumbs")?.innerText'), pathBefore);
      await focus(`${folder} button[aria-label="Deselect Keyboard studies"]`); await press(key);
      await wait(`document.querySelector('${folder}').getAttribute('aria-selected')==='false'`);
      if (await evaluate(cdp, `document.querySelector('${folder}').getAttribute('aria-expanded')==='true'`)) {
        await focus(`${folder} .library-tree-node-arrow`); await press(key);
        await wait(`!document.querySelector('${file}')`);
        await focus(folder); await press('ArrowDown');
        assert.equal(await evaluate(cdp, `document.activeElement===document.querySelector('[data-library-row-name="Keyboard other"]')`), true, 'Collapsed descendants must not receive row navigation');
      }
      await focus(`${folder} .library-tree-node-arrow`); await press(key); await wait(`!!document.querySelector('${file}')`);
      if (key === 'Enter') {
        const other = '[data-library-row-name="Keyboard other"]';
        await focus(folder); await press('ArrowDown');
        assert.equal(await evaluate(cdp, `document.activeElement===document.querySelector('${file}')`), true, 'Down must browse the next visible row without loading it');
        await press('ArrowDown'); await press('ArrowDown');
        assert.equal(await evaluate(cdp, `document.activeElement===document.querySelector('${other}')`), true, 'Down must stop at the last visible row');
        await press('ArrowUp');
        assert.equal(await evaluate(cdp, `document.activeElement===document.querySelector('${file}')`), true);
        await press('Home'); await press('ArrowUp');
        assert.equal(await evaluate(cdp, `document.activeElement===document.querySelector('${folder}')`), true);
        await press('End');
        assert.equal(await evaluate(cdp, `document.activeElement===document.querySelector('${other}')`), true);
        await focus(folder); await press('ArrowRight');
        assert.equal(await evaluate(cdp, `document.activeElement===document.querySelector('${file}')`), true, 'Right must enter the first child of an expanded folder');
        await press('ArrowLeft');
        assert.equal(await evaluate(cdp, `document.activeElement===document.querySelector('${folder}')`), true, 'Left must return to the visible parent folder');
        await press('ArrowLeft'); await wait(`!document.querySelector('${file}')`);
        await press('ArrowRight'); await wait(`!!document.querySelector('${file}')`);
        assert.equal(await evaluate(cdp, `document.activeElement===document.querySelector('${folder}')`), true, 'Right must expand a collapsed folder before entering it');
        assert.deepEqual(await evaluate(cdp, `[...document.querySelectorAll('[data-library-row]')].map(e=>e.getAttribute('aria-level'))`), ['1','2','1']);
        assert.deepEqual(await board(), before);
        assert.equal(await evaluate(cdp, 'document.querySelector(".library-breadcrumbs")?.innerText'), pathBefore);
      }
      await focus(`${file} button[aria-label="More actions for Keyboard game"]`); await press(key);
      await wait(`document.querySelector('[role=menu][aria-label="Library actions"]')?.contains(document.activeElement)`);
      await press('Escape'); await wait('!document.querySelector("[role=menu]")');
      assert.equal(await evaluate(cdp, `document.activeElement===document.querySelector('${file} button[aria-label="More actions for Keyboard game"]')`), true);
      await focus(`${file} button[aria-label="Select Keyboard game"]`); await press(key);
      await wait(`document.querySelector('${file}').getAttribute('aria-selected')==='true'`);
      await focus(`${file} button[aria-label="Deselect Keyboard game"]`); await press(key);
      await wait(`document.querySelector('${file}').getAttribute('aria-selected')==='false'`);
      assert.deepEqual(await board(), before, 'Nested buttons must not load a game');
      assert.equal(await evaluate(cdp, 'document.querySelector(".library-breadcrumbs")?.innerText'), pathBefore);
    }
    for (const selector of [folder, file]) {
      await focus(selector);
      await evaluate(cdp, `(()=>{
        const row=document.querySelector(${JSON.stringify(selector)});
        for(const key of ['Enter',' ','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','ContextMenu','F10']) {
          for(const composition of [{isComposing:true},{keyCode:229}]) row.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,cancelable:true,key,...composition}));
        }
        for(const modifier of ['ctrlKey','altKey','metaKey'])row.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,cancelable:true,key:'Enter',[modifier]:true}));
      })()`);
      assert.deepEqual(await board(), before);
      assert.equal(await evaluate(cdp, 'document.querySelector(".library-breadcrumbs")?.innerText'), pathBefore);
      assert.equal(await evaluate(cdp, 'document.querySelectorAll("[role=menu]").length'), 0);
      assert.equal(await evaluate(cdp, `document.activeElement===document.querySelector(${JSON.stringify(selector)})`), true);
    }
    await click('[aria-label="Search library"]'); await cdp.send('Input.insertText', { text: 'Keyboard game' });
    await wait('document.querySelectorAll("[data-library-row]").length===1');
    await focus(file);
    for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End']) {
      await press(key);
      assert.equal(await evaluate(cdp, `document.activeElement===document.querySelector('${file}')`), true, 'Navigation must stay within matching search results');
    }
    assert.equal(await evaluate(cdp, `document.querySelector('${file}').getAttribute('aria-level')`), '1', 'Search results form a flat list');
    await click('[aria-label="Clear library search"]');
    await wait('document.querySelectorAll("[data-library-row]").length===3');
    for (const [selector, name] of [[folder, 'Keyboard studies'], [file, 'Keyboard game']]) {
      const opener = `${selector} button[aria-label="More actions for ${name}"]`;
      await focus(opener); await press('Enter');
      await wait(`document.querySelector('[role=menu][aria-label="Library actions"]')?.contains(document.activeElement)`);
      for (const composition of [{ isComposing: true }, { keyCode: 229 }]) {
        await evaluate(cdp, `document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,cancelable:true,key:'Escape',...${JSON.stringify(composition)}}))`);
        assert.equal(await evaluate(cdp, '!!document.querySelector("[role=menu]")'), true, 'Composition Escape must not dismiss the menu');
      }
      await evaluate(cdp, `(()=>{[...document.querySelectorAll('[role=menu] button')].find(e=>e.textContent.trim()==='Rename').focus()})()`);
      await press('Enter');
      await wait(`document.querySelector('[aria-labelledby=library-text-dialog-title]')?.contains(document.activeElement)`);
      await press('Escape');
      await wait(`!document.querySelector('[aria-labelledby=library-text-dialog-title]')&&document.activeElement===document.querySelector(${JSON.stringify(opener)})`);
      await wait('!history.state?.webKatrainOverlay');
    }
    await focus(folder); await press('Enter');
    await wait('document.querySelector(".library-breadcrumbs")?.innerText.includes("Keyboard studies")');
    await focus(file); await press('F10', true);
    await wait(`document.querySelector('[role=menu][aria-label="Library actions"]')?.contains(document.activeElement)`);
    await press('Escape'); await wait('!document.querySelector("[role=menu]")');
    assert.equal(await evaluate(cdp, `document.activeElement===document.querySelector('${file}')`), true);
    await focus(file); await press('Enter');
    if (width === 390) await wait('!history.state?.webKatrainOverlay');
    await wait('document.querySelector("[data-board-snapshot]")?.dataset.boardSize==="9"');
    reports.push({ width, enterAndSpaceReachNestedControls:true,compositionAndModifierKeysDoNotActivateRows:true,rowActivationAndKeyboardContextMenuPreserved:true,menuAndRenameDialogRestoreOrigin:true,arrowsAndHomeEndBrowseVisibleRows:true,collapsedAndFilteredRowsExcluded:true,folderDepthAnnounced:true,parentAndFirstChildNavigation:true });
  }
  fs.writeFileSync(path.join(screenshotDir,'library-row-keyboard.json'),JSON.stringify(reports,null,2));
  console.log('Library row keyboard: desktop/phone nested controls, menu/dialog focus return, visible-row arrows/Home/End, folder depth, collapsed/search filtering, composition guards and ordinary activation passed.');
}
