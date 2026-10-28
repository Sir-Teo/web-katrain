import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { connectDevtools, evaluate, loadedModuleUrl, navigate, setViewport, waitForExpression } from './browser.mjs';

// A row's Enter/Space handler must not replace the native action of a button
// inside that row. These fixtures own their library and never touch user data.
export async function assertLibraryActionKeys(devtoolsPort, appUrl, screenshotDir) {
  const version = await (await fetch(`http://127.0.0.1:${devtoolsPort}/json/version`)).json();
  const browser = connectDevtools(version.webSocketDebuggerUrl);
  await browser.ready;
  const sgf = '(;GM[1]SZ[9]PB[Keyboard fixture]C[Saved library note];B[dd])';
  const file = { type: 'file', createdAt: 1, updatedAt: 1, sgf, moveCount: 1, size: sgf.length, metadata: { boardSize: 9 } };
  const items = [
    { id: 'keys-folder', type: 'folder', name: 'Study folder', parentId: null, createdAt: 1, updatedAt: 1 },
    { ...file, id: 'keys-game', name: 'Sample game', parentId: null },
    { ...file, id: 'keys-child', name: 'Child game', parentId: 'keys-folder' },
  ];
  const reports = [];
  try {
    for (const [width, height] of [[1280, 800], [390, 844], [320, 568]]) {
      const context = (await browser.send('Target.createBrowserContext')).result.browserContextId;
      const target = (await browser.send('Target.createTarget', { url: 'about:blank', browserContextId: context })).result.targetId;
      const cdp = connectDevtools(`ws://127.0.0.1:${devtoolsPort}/devtools/page/${target}`);
      await cdp.ready;
      const wait = expression => waitForExpression(cdp, expression, { label: 'Library action keys', timeoutMs: 15_000 });
      const command = async (method, params) => {
        const reply = await cdp.send(method, params);
        assert.ok(!reply.error, JSON.stringify(reply.error));
        return reply.result;
      };
      const key = async (key, code, modifiers = 0) => {
        for (const type of ['keyDown', 'keyUp']) await command('Input.dispatchKeyEvent', {
          type, key, windowsVirtualKeyCode: code, modifiers,
          ...(type === 'keyDown' && ['Enter', ' '].includes(key) ? { text: key === 'Enter' ? '\r' : ' ' } : {}),
        });
      };
      const row = name => `document.querySelector('[data-library-row-name="${name}"]')`;
      const button = label => `document.querySelector('button[aria-label="${label}"]')`;
      const focusRow = async name => {
        await evaluate(cdp, `${row(name)}.focus()`);
        await wait(`${row(name)}===document.activeElement`);
      };
      // Tab through the real controls rather than invoking handlers or clicks.
      const focusControl = async (name, label) => {
        await focusRow(name);
        for (let step = 0; step < 12; step++) {
          await key('Tab', 9);
          if (await evaluate(cdp, `${button(label)}===document.activeElement`)) return;
        }
        assert.fail(`Tab did not reach ${label}`);
      };
      const snapshot = () => evaluate(cdp, `(()=>{const s=libraryKeysStore.getState();return {
        root:s.rootNode.id,current:s.currentNode.id,note:s.rootNode.note,version:s.treeVersion,size:s.board.length,moves:s.moveHistory.length,
      }})()`);
      const closeMenu = async label => {
        await wait('document.querySelector(".library-context-menu")?.contains(document.activeElement)');
        await key('Escape', 27);
        await wait('!document.querySelector(".library-context-menu")');
        await wait(`${button(label)}===document.activeElement`);
      };
      try {
        await command('Page.enable', {});
        await command('Emulation.setFocusEmulationEnabled', { enabled: true });
        await command('Page.addScriptToEvaluateOnNewDocument', { source: `
          Object.defineProperty(window,'indexedDB',{configurable:true,get:()=>undefined});
          localStorage.setItem('web-katrain:library:v1',${JSON.stringify(JSON.stringify(items))});
          localStorage.setItem('web-katrain:library_preloaded_version:v1','3');
          localStorage.setItem('web-katrain:library_folders_expanded:v1','[]');
          localStorage.setItem('web-katrain:library_open:v1','true');
          localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');
          localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
          localStorage.setItem('web-katrain:settings:v3',JSON.stringify({soundEnabled:false,loadSgfFastAnalysis:false}));
        ` });
        await setViewport(cdp, { width, height, mobile: width < 1000 });
        await navigate(cdp, appUrl);
        if (width < 1000) {
          const point = await wait(`(async()=>{const e=document.querySelector('#mobile-tab-library');if(!e)return false;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return e.contains(document.elementFromPoint(x,y))?{x,y}:false})()`);
          await command('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
          await command('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        }
        await wait(`!!${row('Sample game')}&&document.querySelector('.library-tree').getAttribute('aria-busy')==='false'`);
        await evaluate(cdp, `(async()=>{const url=${loadedModuleUrl.toString()};window.libraryKeysStore=(await import(url('/src/store/gameStore.ts'))).useGameStore;return true})()`);
        const before = await snapshot();
        const savedItems = await evaluate(cdp, 'localStorage.getItem("web-katrain:library:v1")');
        const checkUnchanged = async () => {
          assert.deepEqual(await snapshot(), before, 'A library action replaced or edited the current game');
          assert.equal(await evaluate(cdp, '!!document.querySelector("[role=dialog][aria-modal=true]")'), false, 'A row action opened a game-replacement prompt');
        };

        for (const name of ['Sample game', 'Study folder']) {
          await focusControl(name, `Select ${name}`);
          await key('Enter', 13);
          await wait(`${button(`Deselect ${name}`)}===document.activeElement`);
          await checkUnchanged();
          await key(' ', 32);
          await wait(`${button(`Select ${name}`)}===document.activeElement`);
          await checkUnchanged();
          reports.push({ width, height, action: `Select and deselect ${name}` });

          await focusControl(name, `More actions for ${name}`);
          await key('Enter', 13);
          await closeMenu(`More actions for ${name}`);
          await checkUnchanged();
          await key(' ', 32);
          await closeMenu(`More actions for ${name}`);
          await checkUnchanged();
          reports.push({ width, height, action: `Enter and Space open ${name} menu` });

          await key('Enter', 13);
          await wait('document.querySelector(".library-context-menu")?.contains(document.activeElement)');
          // Reach Rename with the menu's own arrow navigation, then verify the
          // dialog gets focus and Cancel returns to the original row button.
          for (let step = 0; step < 8 && !await evaluate(cdp, 'document.activeElement.textContent.trim()==="Rename"'); step++) await key('ArrowDown', 40);
          assert.equal(await evaluate(cdp, 'document.activeElement.textContent.trim()'), 'Rename');
          await key('Enter', 13);
          await wait('!!document.activeElement.closest("[role=dialog]")&&document.activeElement.tagName==="INPUT"&&document.activeElement.type==="text"');
          await key('Escape', 27);
          await wait(`${button(`More actions for ${name}`)}===document.activeElement`);
          await checkUnchanged();
          reports.push({ width, height, action: `${name} Rename owns focus and Cancel returns to opener` });
        }

        await focusControl('Study folder', 'Expand Study folder');
        await key('Enter', 13);
        await wait(`${row('Study folder')}.getAttribute('aria-expanded')==='true'&&!!${row('Child game')}`);
        await key(' ', 32);
        await wait(`${row('Study folder')}.getAttribute('aria-expanded')==='false'&&!${row('Child game')}`);
        await checkUnchanged();
        assert.equal(await evaluate(cdp, 'localStorage.getItem("web-katrain:library_current_folder:v1")'), '', 'The expand button activated a folder');
        reports.push({ width, height, action: 'Expand and collapse without activating folder' });

        // The row itself keeps its navigation and context-menu behavior.
        await focusRow('Study folder');
        await key('ArrowRight', 39);
        await wait(`${row('Study folder')}.getAttribute('aria-expanded')==='true'`);
        await key('ArrowLeft', 37);
        await wait(`${row('Study folder')}.getAttribute('aria-expanded')==='false'`);
        await focusRow('Sample game');
        await key('F10', 121, 8);
        await wait('document.querySelector(".library-context-menu")?.contains(document.activeElement)');
        await key('Escape', 27);
        await wait('!document.querySelector(".library-context-menu")');
        await wait(`${row('Sample game')}===document.activeElement`);
        await focusControl('Sample game', 'More actions for Sample game');
        await key('Enter', 13);
        await wait('document.querySelector(".library-context-menu")?.contains(document.activeElement)');
        const searchPoint = await wait(`(async()=>{
          const e=document.querySelector('[data-library-search]');e.scrollIntoView({block:'nearest'});
          await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
          const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
          return e.contains(document.elementFromPoint(x,y))?{x,y}:false;
        })()`);
        if (width < 1000) {
          await command('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [searchPoint] });
          await command('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        } else for (const type of ['mousePressed', 'mouseReleased']) await command('Input.dispatchMouseEvent', { type, ...searchPoint, button: 'left', clickCount: 1 });
        await wait('!document.querySelector(".library-context-menu")&&document.activeElement===document.querySelector("[data-library-search]")');
        reports.push({ width, height, action: 'Outside pointer dismissal retains newly claimed search focus' });
        await checkUnchanged();
        assert.equal(await evaluate(cdp, 'localStorage.getItem("web-katrain:library:v1")'), savedItems, 'Keyboard controls changed saved records');
        const screenshot = await command('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(screenshotDir, `${width}x${height}-library-action-keys.png`), Buffer.from(screenshot.data, 'base64'));
        await focusRow('Sample game');
        await key('Enter', 13);
        await wait('libraryKeysStore.getState().board.length===9');
        assert.notEqual((await snapshot()).root, before.root, 'Enter on the row no longer opens the game');
        assert.equal(await evaluate(cdp, 'libraryKeysStore.getState().rootNode.note'), 'Saved library note');
        reports.push({ width, height, action: 'Row navigation, context menu and game opening' });
      } catch (error) {
        const screenshot = await command('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(screenshotDir, `${width}x${height}-library-action-keys-failed.png`), Buffer.from(screenshot.data, 'base64'));
        throw error;
      } finally {
        cdp.close();
        await browser.send('Target.disposeBrowserContext', { browserContextId: context });
      }
    }
    fs.writeFileSync(path.join(screenshotDir, 'library-action-keys.json'), JSON.stringify(reports, null, 2));
    console.log('Library action keys: Tab reaches controls; Enter and Space select, open menus and toggle folders without replacing the game; row navigation and opening still work on desktop and phones.');
  } finally {
    browser.close();
  }
}
