import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { connectDevtools, evaluate, loadedModuleUrl, navigate, setViewport, waitForExpression } from './browser.mjs';

export async function assertLibraryPendingNames(devtoolsPort, appUrl, screenshotDir) {
  const version = await (await fetch(`http://127.0.0.1:${devtoolsPort}/json/version`)).json();
  const browser = connectDevtools(version.webSocketDebuggerUrl);
  await browser.ready;
  const reports = [];
  try {
    for (const fallback of [false, true]) for (const width of [1440, 390, 320]) {
      const context = (await browser.send('Target.createBrowserContext')).result.browserContextId;
      const pages = [];
      const mobile = width < 600;
      console.log('Pending Library names start', JSON.stringify({ width, fallback }));
      try {
        for (let index = 0; index < 2; index++) {
          const target = (await browser.send('Target.createTarget', { url: 'about:blank', browserContextId: context })).result.targetId;
          const cdp = connectDevtools(`ws://127.0.0.1:${devtoolsPort}/devtools/page/${target}`);
          await cdp.ready;
          pages.push(cdp);
          await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
            ${fallback ? "Object.defineProperty(window,'indexedDB',{configurable:true,get:()=>undefined});" : ''}
            performance.setResourceTimingBufferSize(5000);
            localStorage.removeItem('web-katrain:auto_saved_game:v1');
            localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');
            localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
            localStorage.setItem('web-katrain:library_open:v1','true');
            localStorage.setItem('web-katrain:settings:v3',JSON.stringify({soundEnabled:false,loadSgfFastAnalysis:false}));
          ` });
          await setViewport(cdp, { width, height: mobile ? (width === 320 ? 568 : 844) : 900, mobile });
          await navigate(cdp, appUrl);
          await waitForExpression(cdp, '!!document.querySelector("[data-board-snapshot]")');
          await evaluate(cdp, `(async()=>{const url=${loadedModuleUrl.toString()};window.pendingNameLibrary=await import(url('/src/utils/library.ts'))})()`);
        }
        const [main, peer] = pages;
        // Touch input requires the foreground tab. Creating the peer made it
        // active; move focus back to the page whose controls are being tested.
        await main.send('Page.bringToFront');
        const wait = expression => waitForExpression(main, expression, {
          label: 'Pending Library names',
          diagnose: `({title:document.title,dialog:document.querySelector('[role=dialog]')?.innerText,storage:document.querySelector('[data-library-storage-badge]')?.textContent,rows:[...document.querySelectorAll('[data-library-row]')].map(e=>e.dataset.libraryRowName)})`,
        });
        const click = async (selector, text) => {
          const point = await wait(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>${text ? `e.textContent.trim()===${JSON.stringify(text)}` : 'true'});if(!e||e.disabled)return false;e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return r.width&&e.contains(document.elementFromPoint(x,y))?{x,y}:false})()`);
          if (mobile) {
            await main.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
            await main.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          } else for (const type of ['mousePressed', 'mouseReleased']) {
            await main.send('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 });
          }
        };
        const key = async (key, code, windowsVirtualKeyCode, modifiers = 0) => {
          for (const type of ['keyDown', 'keyUp']) await main.send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode, modifiers });
        };
        const input = '[aria-labelledby=library-text-dialog-title] input';
        const name = async value => {
          await click(input);
          await key('a', 'KeyA', 65, 2);
          await main.send('Input.insertText', { text: value });
        };
        const submit = async () => {
          await key('Enter', 'Enter', 13);
          await wait('!document.querySelector("[role=dialog]")');
        };
        const stored = () => evaluate(peer, 'pendingNameLibrary.loadLibrary()');
        const waitStored = expression => waitForExpression(peer,
          `pendingNameLibrary.loadLibrary().then(items=>${expression})`, { label: 'Durable pending Library names' });

        await evaluate(peer, `pendingNameLibrary.saveLibrary([
          {...pendingNameLibrary.createLibraryItem('Original study','(;GM[1]SZ[9]GN[Original study];B[dd])'),id:'pending-study'},
          {...pendingNameLibrary.createLibraryFolder('Destination'),id:'pending-destination'},
        ])`);
        await navigate(main, appUrl, 15000, { acceptBeforeUnload: true });
        await wait('!!document.querySelector("[data-board-snapshot]")');
        if (mobile) await click('#mobile-tab-library');
        await wait(`document.querySelector('[data-library-storage-badge]')?.textContent===${JSON.stringify(fallback ? 'Local' : 'IndexedDB')}`);
        await wait('!!document.querySelector("[data-library-row-id=pending-study]")');
        console.log('Pending Library names ready', JSON.stringify({ width, fallback }));

        await click('[aria-label="More library actions"]');
        await click('[role=menu] button', 'Create new folder');
        await name('Shared');
        await evaluate(peer, `pendingNameLibrary.updateStoredLibrary(items=>({items:[pendingNameLibrary.createLibraryFolder('Shared'),...items],result:true}))`);
        await submit();
        await waitStored(`items.some(item=>item.name==='Shared 2'&&item.type==='folder')`);
        await wait(`document.querySelector('.library-breadcrumbs')?.innerText.includes('Shared 2')`);
        await click('button[title="Go to library root"]');

        await click('[aria-label="Save current game to Library"]');
        await name('Game.sgf');
        await evaluate(peer, `pendingNameLibrary.updateStoredLibrary(items=>({items:[pendingNameLibrary.createLibraryItem('Game.sgf','(;GM[1]SZ[13]GN[Other tab game])'),...items],result:true}))`);
        await submit();
        await waitStored(`items.some(item=>item.name==='Game 2.sgf'&&item.type==='file')`);
        await wait(`document.title.includes('Game 2.sgf')`);

        await click('[data-library-row-id=pending-study]');
        await wait(`document.title.includes('Original study')`);
        // Opening a game takes a phone back to its Board tab.
        if (mobile) await click('#mobile-tab-library');
        await click('[data-library-row-id=pending-study] .library-tree-node-more');
        await click('[role=menu] button', 'Rename');
        await name('Review');
        await evaluate(peer, `pendingNameLibrary.updateStoredLibrary(items=>({items:[
          pendingNameLibrary.createLibraryItem('Review','(;GM[1]SZ[13]GN[Existing destination game])','pending-destination'),
          ...items.map(item=>item.id==='pending-study'?{...item,parentId:'pending-destination',favorite:true}:item),
        ],result:true}))`);
        await submit();
        await waitStored(`items.some(item=>item.id==='pending-study'&&item.name==='Review 2')`);
        await wait(`document.title.includes('Review 2')`);
        const saved = await stored();
        const renamed = saved.find(item => item.id === 'pending-study');
        assert.equal(renamed.parentId, 'pending-destination');
        assert.equal(renamed.favorite, true);
        assert.equal(renamed.sgf, '(;GM[1]SZ[9]GN[Original study];B[dd])');
        assert.equal(saved.filter(item => item.parentId === null && item.name === 'Shared').length, 1);
        assert.equal(saved.filter(item => item.parentId === null && item.name === 'Shared 2').length, 1);
        assert.equal(saved.find(item => item.name === 'Game.sgf').sgf, '(;GM[1]SZ[13]GN[Other tab game])');
        const screenshot = await main.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(screenshotDir, `pending-library-names-${width}-${fallback ? 'local' : 'idb'}.png`), Buffer.from(screenshot.result.data, 'base64'));
        await navigate(main, appUrl, 15000, { acceptBeforeUnload: true });
        await wait('!!document.querySelector("[data-board-snapshot]")');
        assert.deepEqual(await stored(), saved, 'Names and peer metadata must survive a reload');
        reports.push({ width, fallback, cases: ['new-folder', 'save-current', 'rename-after-peer-move'], loadedTitleMatchesSavedName: true, reloadPreserved: true });
        console.log('Pending Library names', JSON.stringify(reports.at(-1)));
      } finally {
        for (const page of pages) page.close();
        await browser.send('Target.disposeBrowserContext', { browserContextId: context });
      }
    }
    fs.writeFileSync(path.join(screenshotDir, 'pending-library-names.json'), JSON.stringify(reports, null, 2));
  } finally {
    browser.close();
  }
}
