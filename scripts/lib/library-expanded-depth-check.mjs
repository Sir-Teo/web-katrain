import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { connectDevtools, evaluate, navigate, setViewport, waitForExpression } from './browser.mjs';

export async function assertExpandedLibraryDepth(devtoolsPort, appUrl, screenshotDir) {
  const version = await (await fetch(`http://127.0.0.1:${devtoolsPort}/json/version`)).json();
  const browser = connectDevtools(version.webSocketDebuggerUrl);
  await browser.ready;
  const reports = [];
  try {
    for (const width of [1280, 390, 320]) {
      const context = (await browser.send('Target.createBrowserContext')).result.browserContextId;
      const target = (await browser.send('Target.createTarget', { url: 'about:blank', browserContextId: context })).result.targetId;
      const cdp = connectDevtools(`ws://127.0.0.1:${devtoolsPort}/devtools/page/${target}`);
      await cdp.ready;
      const mobile = width < 1000, count = 1500;
      const wait = expression => waitForExpression(cdp, expression, {
        label: 'Expanded Library depth',
        diagnose: `({focus:document.activeElement?.outerHTML.slice(0,250),scroll:document.querySelector('.library-tree')?.scrollTop,menus:document.querySelectorAll('[role=menu]').length,events:window.expandedDepthEvents?.slice(-16)})`,
      });
      const click = async selector => {
        const point = await wait(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return false;e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return r.width&&e.contains(document.elementFromPoint(x,y))?{x,y}:false})()`);
        if (mobile) {
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        } else for (const type of ['mousePressed', 'mouseReleased']) await cdp.send('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 });
      };
      const press = async key => {
        const windowsVirtualKeyCode = { Home: 36, End: 35, ArrowLeft: 37, ArrowRight: 39, Escape: 27 }[key];
        for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', { type, key, code: key, windowsVirtualKeyCode });
      };
      const focusIs = id => wait(`document.activeElement?.dataset.libraryRowId===${JSON.stringify(id)}`);
      const board = () => evaluate(cdp, '({...document.querySelector("[data-board-snapshot]")?.dataset})');
      try {
        await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
          localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');
          localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
          localStorage.setItem('web-katrain:library_open:v1','true');
          localStorage.setItem('web-katrain:settings:v3',JSON.stringify({soundEnabled:false,loadSgfFastAnalysis:false}));
          if(!localStorage.getItem('expanded-depth-fixture')){
            localStorage.setItem('expanded-depth-fixture','true');
            localStorage.setItem('web-katrain:library_preloaded_version:v1','3');
            localStorage.setItem('web-katrain:library:v1',JSON.stringify([
              ...Array.from({length:${count}},(_,i)=>({id:'depth-'+i,type:'folder',name:'Folder '+i,parentId:i?'depth-'+(i-1):null,createdAt:1,updatedAt:1})),
              {id:'deep-game',type:'file',name:'Deep game',parentId:'depth-${count - 1}',sgf:'(;SZ[9];B[dd])',createdAt:1,updatedAt:1}
            ]));
            localStorage.setItem('web-katrain:library_folders_expanded:v1',JSON.stringify(Array.from({length:${count}},(_,i)=>'depth-'+i)));
          }
        ` });
        await setViewport(cdp, { width, height: width === 320 ? 568 : mobile ? 844 : 800, mobile });
        const open = async () => {
          await wait('!!document.querySelector("[data-board-snapshot]")');
          if (mobile) await click('#mobile-tab-library');
          await wait(`document.querySelector('[data-library-storage-badge]')?.textContent==='IndexedDB'&&document.querySelectorAll('[data-library-row]').length===${count + 1}`);
        };
        await navigate(cdp, appUrl, 15000); await open();
        const before = await board();
        assert.equal(await evaluate(cdp, 'document.querySelector("[data-library-row-id=deep-game]").getAttribute("aria-level")'), String(count + 1));
        await evaluate(cdp, 'document.querySelector("[data-library-row-id=depth-0]").focus()');
        await press('End'); await focusIs('deep-game');
        const geometry = await evaluate(cdp, `(()=>{const e=document.activeElement,n=e.querySelector('.library-tree-node-name'),b=e.querySelector('.library-tree-node-more');return{padding:parseFloat(getComputedStyle(e).paddingLeft),nameWidth:n.getBoundingClientRect().width,menuWidth:b.getBoundingClientRect().width,overflow:document.documentElement.scrollWidth-innerWidth}})()`);
        assert.ok(geometry.padding < 100 && geometry.nameWidth > 20 && geometry.menuWidth >= 24 && geometry.overflow <= 1, JSON.stringify(geometry));
        await press('ArrowLeft'); await focusIs(`depth-${count - 1}`);
        await press('ArrowLeft'); await wait('!document.querySelector("[data-library-row-id=deep-game]")');
        await press('ArrowRight'); await wait('!!document.querySelector("[data-library-row-id=deep-game]")');
        await press('ArrowRight'); await focusIs('deep-game');
        await evaluate(cdp, `(()=>{window.expandedDepthEvents=[];for(const type of ['touchstart','touchend','pointerdown','pointerup','click','focusin','scroll'])document.addEventListener(type,e=>{expandedDepthEvents.push({type,target:e.target?.getAttribute?.('aria-label')||e.target?.className||e.target?.tagName,scroll:document.querySelector('.library-tree')?.scrollTop,menu:!!document.querySelector('[role=menu]')});if(expandedDepthEvents.length>40)expandedDepthEvents.shift()},true)})()`);
        await click('[data-library-row-id=deep-game] .library-tree-node-more');
        await wait('!!document.querySelector("[role=menu]")');
        await press('Escape'); await wait('!document.querySelector("[role=menu]")');
        assert.equal(await evaluate(cdp, 'document.activeElement===document.querySelector("[data-library-row-id=deep-game] .library-tree-node-more")'), true);
        await evaluate(cdp, 'document.querySelector("[data-library-row-id=deep-game]").focus()');
        await press('Home'); await focusIs('depth-0');
        await press('ArrowLeft'); await wait('document.querySelectorAll("[data-library-row]").length===1');
        await press('ArrowRight'); await wait(`document.querySelectorAll('[data-library-row]').length===${count + 1}`);
        assert.deepEqual(await board(), before, 'Browsing deep folders must not change the current game');
        await navigate(cdp, appUrl, 15000); await open();
        await evaluate(cdp, 'document.querySelector("[data-library-row-id=deep-game]").focus()');
        const stored = await evaluate(cdp, `new Promise((resolve,reject)=>{const r=indexedDB.open('web-katrain-library');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,q=db.transaction('items').objectStore('items').getAll();q.onsuccess=()=>{db.close();resolve(q.result)}}})`);
        assert.equal(stored.length, count + 1);
        assert.equal(stored.find(item => item.id === 'deep-game').sgf, '(;SZ[9];B[dd])');
        const byId = new Map(stored.map(item => [item.id, item]));
        for (let index = 0; index < count; index++) {
          assert.equal(byId.get(`depth-${index}`).parentId, index ? `depth-${index - 1}` : null);
        }
        reports.push({ width, count, geometry, fullDepthRetained: true, nativeParentChildAndHomeEnd: true, collapseAndReexpand: true, rowMenuReachable: true, boardUnchanged: true, reloadPreserved: true });
      } finally {
        const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(screenshotDir, `${width}-expanded-library.png`), Buffer.from(screenshot.result.data, 'base64'));
        fs.writeFileSync(path.join(screenshotDir, 'expanded-library.json'), JSON.stringify(reports, null, 2));
        cdp.close();
        await browser.send('Target.disposeBrowserContext', { browserContextId: context });
      }
    }
  } finally { browser.close(); }
  console.log('Expanded Library: 1,500 nested folders at desktop/phone/compact widths, bounded indentation, native navigation, collapse/reexpand, menus, unchanged board and durable reload passed.');
}
