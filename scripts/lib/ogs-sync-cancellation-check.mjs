import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { connectDevtools, evaluate, loadedModuleUrl, navigate, setViewport, waitForExpression } from './browser.mjs';

// Intercept every OGS request. The real modal, fetch queue and cancellation run
// unchanged; no third-party service or real account is used by these fixtures.
export async function assertOgsSyncCancellation(devtoolsPort, appUrl, screenshotDir) {
  const version = await (await fetch(`http://127.0.0.1:${devtoolsPort}/json/version`)).json();
  const browser = connectDevtools(version.webSocketDebuggerUrl);
  await browser.ready;
  const reports = [];
  try {
    for (const [width, height] of [[1280, 800], [390, 844], [320, 568]]) {
      const context = (await browser.send('Target.createBrowserContext')).result.browserContextId;
      const target = (await browser.send('Target.createTarget', { url: 'about:blank', browserContextId: context })).result.targetId;
      const cdp = connectDevtools(`ws://127.0.0.1:${devtoolsPort}/devtools/page/${target}`);
      await cdp.ready;
      const wait = expression => waitForExpression(cdp, expression, { label: 'OGS sync cancellation', timeoutMs: 15_000 });
      const command = async (method, params = {}) => {
        const reply = await cdp.send(method, params);
        assert.ok(!reply.error, `${method}: ${JSON.stringify(reply.error)}`);
        return reply.result;
      };
      const key = async (key, code, modifiers = 0) => {
        for (const type of ['keyDown', 'keyUp']) await command('Input.dispatchKeyEvent', { type, key, windowsVirtualKeyCode: code, modifiers, ...(type === 'keyDown' && key === 'Enter' ? { text: '\r' } : {}) });
      };
      const click = async expression => {
        const point = await wait(`(async()=>{const e=${expression};if(!e)return false;e.scrollIntoView({block:'nearest'});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));if(!e.isConnected)return false;const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return !e.disabled&&e.contains(document.elementFromPoint(x,y))?{x,y}:false})()`);
        if (width < 1000) {
          await command('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
          await command('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        } else for (const type of ['mousePressed', 'mouseReleased']) await command('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 });
      };
      const dialog = 'document.querySelector("#ogs-sync-title")?.closest("[role=dialog]")';
      const open = async username => {
        await click(`document.querySelector('button[aria-label="More library actions"]')`);
        await click(`[...document.querySelectorAll('[role=menuitem]')].find(e=>e.textContent.trim()==='Sync from OGS')`);
        await click('document.querySelector("#ogs-sync-username")');
        await key('a', 65, 2);
        await command('Input.insertText', { text: username });
      };
      const records = () => evaluate(cdp, 'localStorage.getItem("web-katrain:library:v1")');
      let phase, freshId;
      const held = [], errors = [], replies = new Set();
      const unsubscribe = cdp.on(message => {
        if (message.method !== 'Fetch.requestPaused') return;
        const { requestId, request } = message.params;
        const url = new URL(request.url), username = url.searchParams.get('username');
        const canceled = username?.startsWith('cancel-') || /\/players\/101\/|\/games\/9001\//.test(url.pathname);
        if (canceled && ((phase === 'lookup' && username) || (phase === 'listing' && url.pathname.includes('/101/games/')) || (phase === 'download' && url.pathname.includes('/9001/sgf')))) {
          held.push({ requestId, phase });
          return;
        }
        let body, status = 200;
        const headers = [{ name: 'Access-Control-Allow-Origin', value: '*' }, { name: 'Access-Control-Expose-Headers', value: 'Retry-After' }, { name: 'Content-Type', value: 'application/json' }];
        if (canceled && phase === 'backoff' && username) {
          body = ''; status = 429; headers.push({ name: 'Retry-After', value: '3' });
        } else if (username) body = JSON.stringify({ results: [{ id: canceled ? 101 : freshId, username }] });
        else if (url.pathname.includes('/players/')) body = JSON.stringify({ results: [{ id: canceled ? 9001 : 9100 + freshId, width: 9, height: 9, ended: '2026-10-28', players: { black: { username: 'Fixture black' }, white: { username: 'Fixture white' } } }] });
        else if (url.pathname.endsWith('/sgf')) body = '(;GM[1]SZ[9]C[Fresh sync fixture];B[dd])';
        else { errors.push(`Unexpected OGS request: ${url}`); body = ''; status = 404; }
        let job;
        job = command('Fetch.fulfillRequest', { requestId, responseCode: status, responseHeaders: headers, body: Buffer.from(body).toString('base64') })
          .catch(error => errors.push(String(error))).finally(() => replies.delete(job));
        replies.add(job);
      });
      try {
        await command('Page.enable');
        await command('Fetch.enable', { patterns: [{ urlPattern: 'https://online-go.com/*', requestStage: 'Request' }] });
        await command('Emulation.setFocusEmulationEnabled', { enabled: true });
        await command('Page.addScriptToEvaluateOnNewDocument', { source: `
          Object.defineProperty(window,'indexedDB',{configurable:true,get:()=>undefined});
          localStorage.setItem('web-katrain:library:v1','[]');
          localStorage.setItem('web-katrain:library_preloaded_version:v1','3');
          localStorage.setItem('web-katrain:library_open:v1','true');
          localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');
          localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
          localStorage.setItem('web-katrain:settings:v3',JSON.stringify({soundEnabled:false,loadSgfFastAnalysis:false}));
          window.ogsCancellationTrace=[];
          window.fetch=new Proxy(window.fetch,{apply(fn,self,args){
            if(String(args[0]).includes('online-go.com')){
              const entry={url:String(args[0]),signal:!!args[1]?.signal,aborted:false};ogsCancellationTrace.push(entry);
              args[1]?.signal?.addEventListener('abort',()=>entry.aborted=true);
            }
            return Reflect.apply(fn,self,args);
          }});
        ` });
        await setViewport(cdp, { width, height, mobile: width < 1000 });
        await navigate(cdp, appUrl);
        if (width < 1000) await click('document.querySelector("#mobile-tab-library")');
        await wait('!!document.querySelector("[data-library-empty-import]")');
        const originalRoot = await evaluate(cdp, `(async()=>{const url=${loadedModuleUrl.toString()};window.ogsCancellationStore=(await import(url('/src/store/gameStore.ts'))).useGameStore;return ogsCancellationStore.getState().rootNode.id})()`);
        for (const [index, stage] of ['lookup', 'listing', 'download', 'backoff'].entries()) {
          phase = stage; freshId = 200 + index;
          const saved = await records();
          const traceStart = await evaluate(cdp, 'ogsCancellationTrace.length');
          const remembered = await evaluate(cdp, 'localStorage.getItem("web-katrain:ogs_sync_username:v1")');
          await open(`cancel-${stage}`);
          await key('Enter', 13);
          if (stage === 'backoff') await wait(`${dialog}?.textContent.includes('rate limiting')`);
          else {
            // The request must actually reach interception before canceling.
            for (let attempt = 0; !held.some(request => request.phase === stage) && attempt < 100; attempt++) await new Promise(resolve => setTimeout(resolve, 50));
            assert.ok(held.some(request => request.phase === stage), `No held ${stage} request`);
          }
          if (stage === 'download') await key('Escape', 27);
          else if (stage === 'listing') await click(`document.querySelector('button[aria-label="Close OGS sync"]')`);
          else await click(`[...${dialog}.querySelectorAll('button')].find(e=>e.textContent.trim()==='Cancel')`);
          await wait(`!${dialog}`);
          const canceledTrace = await evaluate(cdp, `ogsCancellationTrace.slice(${traceStart})`);
          assert.ok(canceledTrace.length && canceledTrace.every(request => request.signal && request.aborted), `Cancel did not abort ${stage}: ${JSON.stringify(canceledTrace)}`);
          assert.equal(await records(), saved, `Canceled ${stage} changed the library`);
          if (stage === 'lookup') assert.equal(await evaluate(cdp, 'localStorage.getItem("web-katrain:ogs_sync_username:v1")'), remembered);

          await open(`ready-${stage}`);
          const beforeComposition = await evaluate(cdp, 'ogsCancellationTrace.length');
          for (const composition of [{ isComposing: true }, { keyCode: 229 }]) await evaluate(cdp, `document.querySelector('#ogs-sync-username').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true,...${JSON.stringify(composition)}}))`);
          assert.equal(await evaluate(cdp, 'ogsCancellationTrace.length'), beforeComposition, 'IME confirmation started a sync');
          await key('Enter', 13);
          await wait(`${dialog}?.textContent.includes('Added 1 game to')`);
          await wait(`JSON.parse(localStorage.getItem('web-katrain:library:v1')).some(item=>item.type==='file'&&item.name.includes('(ogs-${9100 + freshId})'))`);
          await click(`[...${dialog}.querySelectorAll('button')].find(e=>e.textContent.trim()==='Done')`);
          await wait(`!${dialog}`);
          assert.equal(await evaluate(cdp, 'ogsCancellationStore.getState().rootNode.id'), originalRoot, 'Sync replaced the current game');
          await Promise.all([...replies]);
          assert.deepEqual(errors, []);
          reports.push({ width, height, phase: stage, aborted: true, nextSyncImported: true, currentGamePreserved: true });
        }
        const screenshot = await command('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(screenshotDir, `${width}x${height}-ogs-sync-cancellation.png`), Buffer.from(screenshot.data, 'base64'));
      } catch (error) {
        console.error('OGS cancellation state:', { width, phase, held: held.map(request => request.phase), errors, trace: await evaluate(cdp, 'window.ogsCancellationTrace').catch(String) });
        throw error;
      } finally {
        unsubscribe();
        cdp.close();
        await browser.send('Target.disposeBrowserContext', { browserContextId: context });
      }
    }
    fs.writeFileSync(path.join(screenshotDir, 'ogs-sync-cancellation.json'), JSON.stringify(reports, null, 2));
    console.log('OGS sync: Cancel, close and Escape abort lookup, listing, download and backoff; fresh syncs import successfully, IME confirmation does not submit, and current games stay intact on desktop and phones.');
  } finally {
    browser.close();
  }
}
