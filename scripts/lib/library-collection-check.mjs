import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evaluate, loadedModuleUrl, navigate, setViewport, waitForExpression } from './browser.mjs';

export async function assertLibraryCollectionSplit(cdp, appUrl, runDir, screenshotDir) {
  const games = [
    '(;GM[1]SZ[9]GN[Opening]PB[Alice]PW[Bob]C[Keep \\] and (;fake)]AB[aa];B[dd](;W[ee])(;W[ff]))',
    '(;GM[1]SZ[13]PB[Carol]PW[Dan]RE[W+R];B[aa];W[])',
    '(;SZ[19]GN[Final]C[continued\\\ntext];B[qq])',
  ];
  const sgf = games.join('\n');
  const fixture = path.join(runDir, 'collection-library.json');
  fs.writeFileSync(fixture, JSON.stringify({ app: 'web-katrain', version: 2, items: [
    { id: 'reviews', name: 'Reviews', type: 'folder', parentId: null, createdAt: 1, updatedAt: 1 },
    { id: 'collection', name: 'Championship', type: 'file', parentId: 'reviews', createdAt: 1, updatedAt: 1, favorite: true, tags: ['study'], sgf },
    { id: 'existing', name: 'Championship games', type: 'folder', parentId: 'reviews', createdAt: 1, updatedAt: 1 },
    { id: 'incomplete', name: 'Incomplete', type: 'file', parentId: 'reviews', createdAt: 1, updatedAt: 1, sgf: '(;SZ[9])(;SZ[13]' },
  ] }));
  const wait = expression => waitForExpression(cdp, expression, {
    label: 'Library collection splitting',
    timeoutMs: 15000,
    diagnose: `({ storage: document.querySelector('[data-library-storage-badge]')?.textContent,
      message: document.querySelector('.notification-toast-message')?.title,
      query: document.querySelector('[data-library-search]')?.value,
      rows: [...document.querySelectorAll('[data-library-row]')].map(e => e.getAttribute('data-library-row-name')),
      breadcrumbs: document.querySelector('.library-breadcrumbs')?.textContent, messages: window.collectionSplitMessages, menus: document.querySelectorAll('[role=menu]').length })`,
  });
  let mobile = false;
  const click = async (selector, text, right = false) => {
    const point = await wait(`(() => {
      const e = [...document.querySelectorAll(${JSON.stringify(selector)})]
        .find(e => ${text ? `e.textContent.trim()===${JSON.stringify(text)}` : 'true'});
      if (!e || e.disabled) return false;
      e.scrollIntoView({ block: 'nearest' });
      const r = e.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
      return r.width && e.contains(document.elementFromPoint(x, y)) ? { x, y } : false;
    })()`);
    if (mobile && !right) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      for (const type of ['mousePressed', 'mouseReleased']) {
        await cdp.send('Input.dispatchMouseEvent', { type, ...point, button: right ? 'right' : 'left', clickCount: 1 });
      }
    }
  };
  const context = async (name) => {
    if (mobile) await click(`[data-library-row-name="${name}"] button[aria-label="More actions for ${name}"]`);
    else await click(`[data-library-row-name="${name}"]`, undefined, true);
    await wait(`!!document.querySelector('[role=menu][aria-label="Library actions"]')`);
  };
  const read = () => evaluate(cdp, '(async () => await collectionSplitLibrary.loadLibrary())()');
  const attachLibrary = () => evaluate(cdp, `(async () => {
    const url = ${loadedModuleUrl.toString()};
    window.collectionSplitLibrary = await import(url('/src/utils/library.ts'));
    window.collectionSplitStore = (await import(url('/src/store/gameStore.ts'))).useGameStore;
    window.collectionSplitMessages = [];
    new MutationObserver(() => {
      const message = document.querySelector('.notification-toast-message')?.title;
      if (message && collectionSplitMessages.at(-1) !== message) collectionSplitMessages.push(message);
    }).observe(document.body, { childList: true, subtree: true });
  })()`);
  const reports = [];
  const resources = await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: 'performance.setResourceTimingBufferSize(5000)' });
  try {
    for (const width of [1440, 390]) {
      mobile = width === 390;
      const setup = await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
        localStorage.removeItem('web-katrain:auto_saved_game:v1');
        localStorage.setItem('web-katrain:mobile_home_dismissed:v1', 'true');
        localStorage.setItem('web-katrain:pwa-install-dismissed:v1', 'true');
        localStorage.setItem('web-katrain:library_open:v1', 'true');
        localStorage.setItem('web-katrain:settings:v3', JSON.stringify({ soundEnabled: false, loadSgfFastAnalysis: false }));
      ` });
      try {
        await setViewport(cdp, { width, height: mobile ? 844 : 900, mobile });
        await navigate(cdp, appUrl, 15000, { acceptBeforeUnload: true });
      } finally {
        await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: setup.result.identifier });
      }
      await wait('!!document.querySelector("[data-board-snapshot]")');
      if (mobile) await click('#mobile-tab-library');
      await wait('document.querySelector("[data-library-storage-badge]")?.textContent==="IndexedDB"');
      const root = (await cdp.send('DOM.getDocument')).result.root;
      const input = (await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[type=file][accept=".json,application/json"]' })).result.nodeId;
      await cdp.send('DOM.setFileInputFiles', { nodeId: input, files: [fixture] });
      await wait('!!document.querySelector("[aria-labelledby=library-confirm-dialog-title]")');
      await click('[aria-labelledby=library-confirm-dialog-title] button.danger');
      await wait("document.querySelector('.notification-toast-message')?.title==='Restored 4 library items.'");
      await attachLibrary();
      const source = (await read()).find(item => item.id === 'collection');
      await click('[data-library-row-name="Reviews"]');
      await wait('!!document.querySelector("[data-library-row-name=Championship]")');
      await click('[aria-label="Show favorites only"]');
      await click('[aria-label="Search library"]');
      await cdp.send('Input.insertText', { text: 'Championship' });
      await context('Championship');
      await click('[role=menuitem]', 'Split collection (3 games)');
      await wait(`document.querySelector('[data-library-storage-badge]')?.textContent==='IndexedDB'
        && ['1. Opening', '2. Carol vs Dan', '3. Final'].every(name =>
          [...document.querySelectorAll('[data-library-row=file]')].some(e => e.dataset.libraryRowName===name))
        && document.querySelector('.library-breadcrumbs [aria-current=location]')?.getAttribute('aria-label')==='Open folder Championship games 2'`);
      await wait('document.activeElement?.getAttribute("aria-label")==="Search library"');
      assert.equal(await evaluate(cdp, `document.querySelector('[aria-label="Search library"]').value`), '');
      const items = await read();
      const folder = items.find(item => item.type === 'folder' && item.name === 'Championship games 2');
      assert.ok(folder);
      assert.equal(folder.parentId, 'reviews');
      const files = items.filter(item => item.type === 'file' && item.parentId === folder.id).sort((a, b) => a.name.localeCompare(b.name));
      assert.deepEqual(files.map(file => file.name), ['1. Opening', '2. Carol vs Dan', '3. Final']);
      assert.deepEqual(files.map(file => file.sgf), games);
      assert.deepEqual(files.map(file => file.metadata.boardSize), [9, 13, 19]);
      assert.deepEqual(files.map(file => file.moveCount), [3, 2, 1]);
      assert.ok(files.every(file => file.favorite && JSON.stringify(file.tags) === '["study"]'));
      assert.deepEqual(items.find(item => item.id === source.id), source);
      assert.equal(new Set(items.map(item => item.id)).size, items.length);
      const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(screenshotDir, `library-collection-${width}.png`), Buffer.from(screenshot.result.data, 'base64'));
      await context('1. Opening');
      assert.equal(await evaluate(cdp, `[...document.querySelectorAll('[role=menuitem]')].some(e => e.textContent.includes('Split collection'))`), false);
      for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await click('[data-library-row-name="2. Carol vs Dan"]');
      await wait('document.querySelector("[data-board-snapshot]")?.dataset.boardSize==="13"');
      assert.equal(await evaluate(cdp, `(() => {
        let node = collectionSplitStore.getState().rootNode, moves = 0;
        while (node.children[0]) { node = node.children[0]; if (node.move) moves++; }
        return moves;
      })()`), 2, 'Opening game two must load its complete move sequence');
      await navigate(cdp, appUrl, 15000, { acceptBeforeUnload: true });
      await wait('!!document.querySelector("[data-board-snapshot]")');
      if (mobile) await click('#mobile-tab-library');
      await wait(`document.querySelector('[data-library-storage-badge]')?.textContent==='IndexedDB'
        && ['1. Opening', '2. Carol vs Dan', '3. Final'].every(name =>
          [...document.querySelectorAll('[data-library-row=file]')].some(e => e.dataset.libraryRowName===name))`);
      await attachLibrary();
      assert.deepEqual((await read()).filter(item => item.parentId === folder.id).map(item => item.id).sort(), files.map(item => item.id).sort());
      await click('.library-breadcrumb-button', 'Reviews');
      await context('Incomplete');
      const menuScroll = await evaluate(cdp, `(async () => {
        const menu = document.querySelector('[role=menu][aria-label="Library actions"]');
        const before = { height: menu.clientHeight, content: menu.scrollHeight, top: menu.scrollTop };
        menu.scrollTop = menu.scrollHeight;
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return { before, remainsOpen: !!document.querySelector('[role=menu][aria-label="Library actions"]') };
      })()`);
      assert.ok(menuScroll.before.content > menuScroll.before.height, JSON.stringify(menuScroll));
      assert.ok(menuScroll.remainsOpen, `Scrolling Library actions must keep the menu open: ${JSON.stringify(menuScroll)}`);
      const beforeInvalid = (await read()).map(item => item.id).sort();
      await click('[role=menuitem]', 'Split collection (2 games)');
      await wait("collectionSplitMessages.some(message => message.includes('incomplete game'))");
      assert.deepEqual((await read()).map(item => item.id).sort(), beforeInvalid);
      assert.deepEqual((await read()).find(item => item.id === source.id), source);
      reports.push({ width, games: 3, originalRetained: true, exactGameTextAndMetadata: true, favoriteAndTagsInherited: true, queryClearedAndFocused: true, siblingFolderCollisionHandled: true, selectedGameLoaded: true, reloadRetainedFiles: true, invalidCollectionAddsNothing: true });
    }
  } catch (error) {
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(screenshotDir, `library-collection-failure-${mobile ? 390 : 1440}.png`), Buffer.from(shot.result.data, 'base64'));
    throw error;
  } finally {
    await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: resources.result.identifier });
  }
  fs.writeFileSync(path.join(screenshotDir, 'library-collection-split.json'), JSON.stringify(reports, null, 2));
  console.log('Library collections: desktop/phone split into numbered folders, preserve raw games/source/tags, clear search, handle folder collisions, load another game, survive reload, and reject incomplete input.');
}
