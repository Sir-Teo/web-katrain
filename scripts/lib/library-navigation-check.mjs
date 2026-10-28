import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { connectDevtools, evaluate, loadedModuleUrl, navigate, setViewport, waitForExpression } from './browser.mjs';

// A long path used to wrap into a 783px toolbar on a phone, pushing the games
// below the viewport. Keep every ancestor reachable without growing the bar.
export async function assertLibraryNavigation(devtoolsPort, appUrl, screenshotDir) {
  const version = await (await fetch(`http://127.0.0.1:${devtoolsPort}/json/version`)).json();
  const browser = connectDevtools(version.webSocketDebuggerUrl);
  await browser.ready;
  const folders = Array.from({ length: 40 }, (_, index) => ({
    id: `path-${index}`, name: `Study folder ${index + 1}`, type: 'folder',
    parentId: index ? `path-${index - 1}` : null, createdAt: 1, updatedAt: 1,
  }));
  const games = Array.from({ length: 105 }, (_, index) => {
    const name = `Deep study ${String(index + 1).padStart(3, '0')}`;
    const sgf = `(;GM[1]SZ[9]C[${name}];B[dd])`;
    return { id: `deep-game-${index}`, name, type: 'file', parentId: 'path-39', createdAt: 1, updatedAt: 1, sgf, size: sgf.length, moveCount: 1, metadata: { boardSize: 9 } };
  });
  const reports = [];
  try {
    for (const [width, height] of [[1280, 800], [390, 844], [320, 568]]) {
      const context = (await browser.send('Target.createBrowserContext')).result.browserContextId;
      const target = (await browser.send('Target.createTarget', { url: 'about:blank', browserContextId: context })).result.targetId;
      const cdp = connectDevtools(`ws://127.0.0.1:${devtoolsPort}/devtools/page/${target}`);
      await cdp.ready;
      const mobile = width < 1000;
      const wait = expression => waitForExpression(cdp, expression, { label: 'Library navigation', timeoutMs: 15_000 });
      const key = async (key, code, modifiers = 0) => {
        for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', { type, key, windowsVirtualKeyCode: code, modifiers });
      };
      const click = async selector => {
        const point = await wait(`(async()=>{
          const e=document.querySelector(${JSON.stringify(selector)});if(!e)return false;e.scrollIntoView({block:'nearest'});
          await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));if(!e.isConnected)return false;
          const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
          return r.width&&r.height&&e.contains(document.elementFromPoint(x,y))?{x,y}:false;
        })()`);
        if (mobile) {
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        } else for (const type of ['mousePressed', 'mouseReleased']) await cdp.send('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 });
      };
      try {
        await cdp.send('Page.enable');
        await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
        await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
          Object.defineProperty(window,'indexedDB',{configurable:true,get:()=>undefined});
          localStorage.setItem('web-katrain:library:v1',${JSON.stringify(JSON.stringify([...folders, ...games]))});
          localStorage.setItem('web-katrain:library_preloaded_version:v1','3');
          localStorage.setItem('web-katrain:library_current_folder:v1','path-39');
          localStorage.setItem('web-katrain:library_folders_expanded:v1',${JSON.stringify(JSON.stringify(folders.map(folder => folder.id)))});
          localStorage.setItem('web-katrain:library_open:v1','true');
          localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');
          localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
          localStorage.setItem('web-katrain:settings:v3',JSON.stringify({soundEnabled:false,loadSgfFastAnalysis:false}));
        ` });
        await setViewport(cdp, { width, height, mobile });
        await navigate(cdp, appUrl);
        if (mobile) await click('#mobile-tab-library');
        await wait('document.querySelectorAll(".library-breadcrumb-button").length===40');
        if (mobile) assert.equal(await evaluate(cdp, `!!document.querySelector('#mobile-panel-library').closest('section[aria-label="Game library"]')`), true);
        await wait(`(()=>{
          const trail=document.querySelector('.library-breadcrumbs'),last=trail.lastElementChild;
          const r=last.getBoundingClientRect(),v=trail.getBoundingClientRect();
          return trail.scrollLeft>0&&r.left>=v.left-1&&r.right<=v.right+1;
        })()`);
        const bounds = await evaluate(cdp, `(()=>{
          const bar=document.querySelector('[data-library-toolbar]'),tree=document.querySelector('.library-tree');
          return {toolbarHeight:bar.getBoundingClientRect().height,treeTop:tree.getBoundingClientRect().top,documentOverflow:document.scrollingElement.scrollWidth-innerWidth};
        })()`);
        assert.ok(bounds.toolbarHeight < 260, JSON.stringify(bounds));
        assert.ok(bounds.treeTop < height - 100, JSON.stringify(bounds));
        assert.ok(bounds.documentOverflow <= 1, JSON.stringify(bounds));
        if (mobile) assert.equal(await evaluate(cdp, '[...document.querySelectorAll(".library-breadcrumb-button")].every(e=>e.getBoundingClientRect().height>=44)'), true);
        assert.equal(await evaluate(cdp, 'document.querySelector(".library-breadcrumb-button:last-child").getAttribute("aria-current")'), 'location');
        const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(screenshotDir, `${width}x${height}-library-path.png`), Buffer.from(screenshot.result.data, 'base64'));
        // Native Shift+Tab must reveal every earlier ancestor in the scroller.
        await evaluate(cdp, 'document.querySelector(".library-breadcrumb-button:last-child").focus()');
        for (let i = 0; i < 39; i++) await key('Tab', 9, 8);
        await wait('document.activeElement===document.querySelector(".library-breadcrumb-button")');
        await click('.library-breadcrumb-button');
        await wait('document.querySelectorAll(".library-breadcrumb-button").length===1');
        assert.equal(await evaluate(cdp, 'localStorage.getItem("web-katrain:library_current_folder:v1")'), 'path-0');
        await click('[aria-label="Search library"]');
        await cdp.send('Input.insertText', { text: 'folder 39' });
        await click('[aria-label="Clear library search"]');
        await wait('document.activeElement===document.querySelector("[data-library-search]")&&document.activeElement.value===""');
        await cdp.send('Input.insertText', { text: 'folder 40' });
        await wait(`!!document.querySelector('[data-library-row-name="Study folder 40"]')`);
        await key('a', 65, 2);
        await cdp.send('Input.insertText', { text: 'no matching folder here' });
        await wait('document.querySelector(".library-tree").textContent.includes("No matches")');
        assert.equal(await evaluate(cdp, 'document.querySelector(".library-tree").getAttribute("role")'), null, 'An empty result must not expose a tree with no treeitems');
        await click('[aria-label="Clear library search"]');
        await wait('document.querySelector(".library-tree").getAttribute("role")==="tree"');
        await wait('document.querySelectorAll("[data-library-row]").length===140');
        const nested = await evaluate(cdp, `(()=>{
          const tree=document.querySelector('.library-tree'),rows=[...tree.querySelectorAll('[data-library-row]')];
          return {width:tree.clientWidth,scroll:tree.scrollWidth,minNameWidth:Math.min(...rows.map(e=>e.querySelector('.library-tree-node-name').getBoundingClientRect().width)),levels:rows.filter(e=>e.dataset.libraryRow==='folder').map(e=>Number(e.getAttribute('aria-level')))};
        })()`);
        assert.ok(nested.scroll <= nested.width + 1, 'Expanded folders overflow the library horizontally');
        assert.ok(nested.minNameWidth >= 60, `Nested names have only ${nested.minNameWidth}px`);
        assert.deepEqual(nested.levels, folders.map((_, index) => index + 1), 'Capped indentation changed the announced hierarchy');
        const more = '[data-library-show-more="path-39"]';
        await click(more);
        await wait('document.querySelectorAll("[data-library-row]").length===145');
        await click('[aria-label="Collapse Study folder 1"]');
        await wait('document.querySelectorAll("[data-library-row]").length===1');
        await click('[aria-label="Expand Study folder 1"]');
        await wait('document.querySelectorAll("[data-library-row]").length===145');
        const leaf = '[data-library-row-name="Deep study 105"]';
        await evaluate(cdp, `(async()=>{document.querySelector(${JSON.stringify(leaf)}).scrollIntoView({block:'nearest'});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))})()`);
        assert.equal(await evaluate(cdp, `document.querySelector(${JSON.stringify(leaf)}).getAttribute('aria-level')`), '41');
        const deepScreenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(screenshotDir, `${width}x${height}-library-deep.png`), Buffer.from(deepScreenshot.result.data, 'base64'));
        await evaluate(cdp, `(async()=>{const url=${loadedModuleUrl.toString()};window.libraryNavigationStore=(await import(url('/src/store/gameStore.ts'))).useGameStore;return true})()`);
        await click(`${leaf} .library-tree-node-name`);
        await wait('libraryNavigationStore.getState().board.length===9&&libraryNavigationStore.getState().rootNode.note==="Deep study 105"');
        reports.push({ width, height, ...bounds, ...nested, nestedGames: 105, hierarchyLevels: 41, pagedAndOpened: true });
      } catch (error) {
        const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(screenshotDir, `${width}x${height}-library-navigation-failed.png`), Buffer.from(screenshot.result.data, 'base64'));
        throw error;
      } finally {
        cdp.close();
        await browser.send('Target.disposeBrowserContext', { browserContextId: context });
      }
    }
    fs.writeFileSync(path.join(screenshotDir, 'library-navigation.json'), JSON.stringify(reports, null, 2));
    console.log('Library navigation: compact keyboard-reachable paths, readable 40-level trees, bounded pagination, preserved expansion and deep game opening pass on desktop and phones.');
  } finally {
    browser.close();
  }
}
