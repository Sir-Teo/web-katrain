import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { connectDevtools, evaluate, loadedModuleUrl, navigate, sleep, waitForExpression } from './browser.mjs';

export async function assertLibraryCrossTab(devtoolsPort, appUrl, screenshotDir) {
  const version=await (await fetch(`http://127.0.0.1:${devtoolsPort}/json/version`)).json();
  const browser=connectDevtools(version.webSocketDebuggerUrl);await browser.ready;
  const reports=[];
  try {
    for(const fallback of [false,true]) {
      const context=(await browser.send('Target.createBrowserContext')).result.browserContextId;
      const pages=[];
      try {
        for(let i=0;i<2;i++) {
          const target=(await browser.send('Target.createTarget',{url:'about:blank',browserContextId:context})).result.targetId;
          const cdp=connectDevtools(`ws://127.0.0.1:${devtoolsPort}/devtools/page/${target}`);await cdp.ready;pages.push(cdp);
          await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`
            ${fallback?"Object.defineProperty(window,'indexedDB',{configurable:true,get:()=>undefined});":''}
            localStorage.removeItem('web-katrain:auto_saved_game:v1');
            localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');
            localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
          `});
        }
        await Promise.all(pages.map(async cdp=>{
          await navigate(cdp,appUrl);await waitForExpression(cdp,'!!document.querySelector("[data-board-snapshot]")');
          await evaluate(cdp,`(async()=>{const url=${loadedModuleUrl.toString()};window.crossTabLibrary=await import(url('/src/utils/library.ts'));await crossTabLibrary.loadLibrary()})()`);
        }));
        const [a,b]=pages;
        await evaluate(a,'crossTabLibrary.saveLibrary([])');
        assert.deepEqual(await evaluate(b,'crossTabLibrary.loadLibrary().then(items=>items.map(item=>item.name))'),[], 'The other tab must see an emptied library');
        let waitedForWrite=false;
        if(!fallback) {
          await evaluate(a,`(()=>{
            const open=indexedDB.open.bind(indexedDB);window.crossTabReadDone=false;window.crossTabHeldWrites=[];
            indexedDB.open=(...args)=>{
              const request=open(...args);Object.defineProperty(request,'onsuccess',{set(fn){
                request.addEventListener('success',event=>{if(crossTabReadDone)crossTabHeldWrites.push(()=>fn.call(request,event));else fn.call(request,event)},{once:true});
              }});return request;
            };
            window.releaseCrossTabWrite=()=>{indexedDB.open=open;crossTabHeldWrites.splice(0).forEach(release=>release())};
            window.crossTabOperation=crossTabLibrary.updateStoredLibrary(items=>{crossTabReadDone=true;return{items:[crossTabLibrary.createLibraryItem('Tab A','(;SZ[9])'),...items],result:true}});
            return true;
          })()`);
          await waitForExpression(a,'crossTabHeldWrites.length>0');
          await evaluate(b,`(()=>{
            window.otherTabFinished=false;
            window.crossTabOperation=crossTabLibrary.updateStoredLibrary(items=>({items:[crossTabLibrary.createLibraryItem('Tab B','(;SZ[9])'),...items],result:true})).then(()=>{otherTabFinished=true});
            return true;
          })()`);
          await sleep(300);
          waitedForWrite=await evaluate(b,'!otherTabFinished');
          assert.equal(waitedForWrite,true,'The second tab must wait for the first read/write operation');
          await evaluate(a,'releaseCrossTabWrite()');
          await Promise.all(pages.map(cdp=>evaluate(cdp,'crossTabOperation.then(()=>true)')));
        } else {
          await evaluate(a,"crossTabLibrary.updateStoredLibrary(items=>({items:[crossTabLibrary.createLibraryItem('Tab A','(;SZ[9])'),...items],result:true}))");
          assert.deepEqual(await evaluate(b,'crossTabLibrary.loadLibrary().then(items=>items.map(item=>item.name))'),['Tab A']);
          await evaluate(b,"crossTabLibrary.updateStoredLibrary(items=>({items:[crossTabLibrary.createLibraryItem('Tab B','(;SZ[9])'),...items],result:true}))");
        }
        const names=await evaluate(a,'crossTabLibrary.loadLibrary().then(items=>items.map(item=>item.name).sort())');
        assert.deepEqual(names,['Tab A','Tab B'],'Both successful saves must remain in the shared library');
        if(fallback)assert.deepEqual(await evaluate(b,"JSON.parse(localStorage.getItem('web-katrain:library:v1')).map(item=>item.name).sort()"),names);
        reports.push({storage:fallback?'localStorage':'IndexedDB',waitedForWrite,names,emptyLibraryObserved:true});
      } finally {
        for(const cdp of pages)cdp.close();
        await browser.send('Target.disposeBrowserContext',{browserContextId:context});
      }
    }
  } finally {browser.close();}
  fs.writeFileSync(path.join(screenshotDir,'library-cross-tab.json'),JSON.stringify(reports,null,2));
  console.log('Cross-tab library: held IndexedDB writes preserve both games; fallback reads observe additions and clears without resurrecting samples.');
}
