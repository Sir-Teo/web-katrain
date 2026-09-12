import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { connectDevtools, evaluate, navigate, setViewport, sleep } from './browser.mjs';

// Read storage directly: loadLibrary itself can seed samples, so calling it
// from a persistence assertion would change the state being checked.
const readStoredItems = `(async()=>{
  if(!window.indexedDB)return JSON.parse(localStorage.getItem('web-katrain:library:v1')??'null');
  return new Promise((resolve,reject)=>{
    const open=indexedDB.open('web-katrain-library');
    open.onerror=()=>reject(open.error);
    open.onsuccess=()=>{
      const db=open.result,request=db.transaction('items','readonly').objectStore('items').getAll();
      request.onsuccess=()=>{db.close();resolve(request.result)};
      request.onerror=()=>{db.close();reject(request.error)};
    };
  });
})()`;

export async function assertEmptyLibraryPersists(devtoolsPort, appUrl, runDir, screenshotDir) {
  const version = await (await fetch(`http://127.0.0.1:${devtoolsPort}/json/version`)).json();
  const browser = connectDevtools(version.webSocketDebuggerUrl);
  await browser.ready;
  const reports = [], failures = [];
  try {
    for (const [width, height] of [[1280, 800], [390, 844]]) {
      for (const storage of ['indexedDB', 'localStorage']) {
        const context = (await browser.send('Target.createBrowserContext')).result.browserContextId;
        const target = (await browser.send('Target.createTarget', { url: 'about:blank', browserContextId: context })).result.targetId;
        const cdp = connectDevtools(`ws://127.0.0.1:${devtoolsPort}/devtools/page/${target}`);
        await cdp.ready;
        const mobile = width < 1000, stem = `${width}x${height}-empty-library-${storage}`;
        const report = { width, height, storage, stages: [] }, errors = [];
        const dialog = '[aria-labelledby="library-confirm-dialog-title"]';
        const wait = async expression => {
          for (let i = 0; i < 150; i++) {
            const value = await evaluate(cdp, expression);
            if (value) return value;
            await sleep(100);
          }
          throw Error(`Empty library check timed out: ${expression}`);
        };
        const clickElement = async expression => {
          const point = await wait(`(()=>{
            const e=${expression};if(!e)return false;e.scrollIntoView({block:'nearest'});
            const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
            return r.width&&r.height&&!e.disabled&&!e.closest('[inert]')&&e.contains(document.elementFromPoint(x,y))?{x,y}:false;
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
        const dialogButton = text => clickElement(`[...document.querySelectorAll('${dialog} button')].find(e=>e.textContent.trim()===${JSON.stringify(text)})`);
        const closed = async () => {
          await wait(`!document.querySelector('${dialog}')`);
          if (mobile) await wait('!history.state?.webKatrainOverlay');
        };
        const persisted = count => wait(`(async()=>{const items=await ${readStoredItems};return items?.length===${count}})()`);
        const openLibrary = async () => {
          await wait('!!document.querySelector("[data-board-snapshot=true]")');
          if (mobile) await click('#mobile-tab-library');
          await wait('!!document.querySelector("input[type=file][multiple]")');
        };
        const emptyUi = () => wait(`document.body.innerText.includes('Library is empty')&&!document.querySelector('[data-library-row]')`);
        const upload = async (selector, filename, content) => {
          const file = path.join(runDir, `${stem}-${filename}`);
          fs.writeFileSync(file, content);
          const root = (await cdp.send('DOM.getDocument')).result.root;
          const nodeId = (await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector })).result.nodeId;
          const result = await cdp.send('DOM.setFileInputFiles', { nodeId, files: [file] });
          assert.ok(!result.error, JSON.stringify(result.error));
        };
        const checkEmptyReload = async stage => {
          await navigate(cdp, appUrl);
          await openLibrary();
          await wait(`document.body.innerText.includes('Library is empty')||!!document.querySelector('[data-library-row]')`);
          const items = await evaluate(cdp, readStoredItems);
          report.stages.push({ stage, count: items?.length, names: items?.map(item => item.name) });
          assert.equal(items?.length, 0, `${stage}: reload must retain the intentionally empty library`);
          await emptyUi();
        };
        try {
          await cdp.send('Runtime.enable');
          cdp.on(message => {
            if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
          });
          await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
          await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
            localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');
            localStorage.setItem('web-katrain:library_open:v1','true');
            localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
            localStorage.setItem('web-katrain:settings:v3',JSON.stringify({soundEnabled:false,loadSgfFastAnalysis:false}));
            ${storage === 'localStorage' ? "Object.defineProperty(window,'indexedDB',{configurable:true,value:undefined});" : ''}
          ` });
          await setViewport(cdp, { width, height, mobile });
          await navigate(cdp, appUrl);
          await openLibrary();
          await wait(`!!document.querySelector('[data-library-row-name="Famous Games"]')`);
          await wait(`(async()=>{const items=await ${readStoredItems};return items?.some(i=>i.type==='file')})()`);
          const initial = await evaluate(cdp, readStoredItems);
          assert.ok(initial.length > 1, 'A first visit must still offer the sample collection');
          report.initialCount = initial.length;
          await click('button[aria-label="Select all"]');
          await click('button[aria-label="Delete selected"]');
          const message = await wait(`document.querySelector('${dialog} p')?.textContent`);
          assert.ok(message.includes(`Delete ${initial.length} library items?`));
          await dialogButton('Cancel');
          await closed();
          assert.deepEqual(await evaluate(cdp, readStoredItems), initial, 'Cancel must leave all saved records intact');
          await click('button[aria-label="Delete selected"]');
          await dialogButton('Delete');
          await closed();
          await emptyUi();
          await persisted(0);
          report.stages.push({ stage: 'delete persisted', count: 0 });
          await checkEmptyReload('after delete');

          await upload('input[type=file][multiple]', 'study.sgf', '(;GM[1]SZ[9]PB[Empty library audit];B[dd])');
          await persisted(1);
          await wait(`!!document.querySelector('[data-library-row=file]')`);
          await upload('input[type=file][accept=".json,application/json"]', 'empty.json', JSON.stringify({ app: 'web-katrain', version: 2, items: [] }));
          await emptyUi();
          await persisted(0);
          await checkEmptyReload('after empty backup restore');
          assert.deepEqual(errors, []);
          assert.ok(await evaluate(cdp, 'document.documentElement.scrollWidth<=innerWidth+1'));
          console.log(`Empty library at ${width}x${height} (${storage}): first-run samples, cancel, delete, import, empty backup and reload passed.`);
        } catch (error) {
          failures.push(`${stem}: ${error.message}`);
          report.error = error.message;
        } finally {
          const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
          fs.writeFileSync(path.join(screenshotDir, `${stem}.png`), Buffer.from(screenshot.result.data, 'base64'));
          reports.push(report);
          fs.writeFileSync(path.join(screenshotDir, 'empty-library.json'), JSON.stringify(reports, null, 2));
          cdp.close();
          await browser.send('Target.disposeBrowserContext', { browserContextId: context });
        }
      }
    }
    assert.deepEqual(failures, [], 'An empty library must survive reload');
  } finally {
    browser.close();
  }
}
