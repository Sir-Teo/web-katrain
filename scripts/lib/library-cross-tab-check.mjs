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
            window.crossTabStorageAudit=[];window.crossTabStoragePhase='startup';
            for(const method of ['getItem','setItem','removeItem']){
              const original=Storage.prototype[method];
              Storage.prototype[method]=function(...args){
                const result=original.apply(this,args);
                if(args[0]==='web-katrain:library:v1'){
                  crossTabStorageAudit.push({type:method,phase:crossTabStoragePhase,time:performance.now(),raw:method==='getItem'?result:args[1]??null});
                  if(crossTabStorageAudit.length>80)crossTabStorageAudit.shift();
                }
                return result;
              };
            }
            window.addEventListener('storage',event=>{
              if(event.key==='web-katrain:library:v1')crossTabStorageAudit.push({type:'event',phase:crossTabStoragePhase,time:performance.now(),raw:event.newValue});
            });
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
        const storageAudit=()=>Promise.all(pages.map(cdp=>evaluate(cdp,`(async()=>({
          visible:document.visibilityState,
          raw:localStorage.getItem('web-katrain:library:v1'),
          locks:navigator.locks?await navigator.locks.query():null,
          operations:crossTabStorageAudit.slice(-40).map(({raw,...entry})=>{
            let names;try{names=JSON.parse(raw??'null')?.map(item=>item.name)}catch{names='invalid JSON'}
            return {...entry,names};
          }),
        }))()`)));
        await Promise.all(pages.map(cdp=>evaluate(cdp,"crossTabStoragePhase='clear';void 0")));
        await evaluate(a,'crossTabLibrary.saveLibrary([])');
        const cleared=await evaluate(b,'crossTabLibrary.loadLibrary().then(items=>items.map(item=>item.name))');
        if(cleared.length)console.log('Cross-tab clear failure',JSON.stringify({fallback,cleared,snapshots:await storageAudit()}));
        assert.deepEqual(cleared,[], 'The other tab must see an emptied library');
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
          await Promise.all(pages.map(cdp=>evaluate(cdp,"crossTabStoragePhase='first save';void 0")));
          await evaluate(a,"crossTabLibrary.updateStoredLibrary(items=>({items:[crossTabLibrary.createLibraryItem('Tab A','(;SZ[9])'),...items],result:true}))");
          const firstRead=await evaluate(b,'crossTabLibrary.loadLibrary().then(items=>items.map(item=>item.name))');
          console.log('Cross-tab fallback first read',JSON.stringify({firstRead,snapshots:await storageAudit()}));
          assert.deepEqual(firstRead,['Tab A']);
          await Promise.all(pages.map(cdp=>evaluate(cdp,"crossTabStoragePhase='second save';void 0")));
          await evaluate(b,"crossTabLibrary.updateStoredLibrary(items=>({items:[crossTabLibrary.createLibraryItem('Tab B','(;SZ[9])'),...items],result:true}))");
        }
        const names=await evaluate(a,'crossTabLibrary.loadLibrary().then(items=>items.map(item=>item.name).sort())');
        const snapshots=await Promise.all(pages.map(cdp=>evaluate(cdp,`(async()=>({
          fallback:localStorage.getItem('web-katrain:library:v1'),
          unflushed:localStorage.getItem('web-katrain:library_fallback_unflushed:v1'),
          migrated:localStorage.getItem('web-katrain:library_migrated_to_idb:v1'),
          locks:navigator.locks?await navigator.locks.query():null,
          stored:window.indexedDB?await new Promise((resolve,reject)=>{const r=indexedDB.open('web-katrain-library');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,q=db.transaction('items').objectStore('items').getAll();q.onsuccess=()=>{db.close();resolve(q.result.map(item=>item.name).sort())}}}):null,
        }))()`)));
        console.log('Cross-tab storage outcome',JSON.stringify({fallback,waitedForWrite,names,snapshots}));
        assert.deepEqual(names,['Tab A','Tab B'],'Both successful saves must remain in the shared library');
        if(fallback)assert.deepEqual(await evaluate(b,"JSON.parse(localStorage.getItem('web-katrain:library:v1')).map(item=>item.name).sort()"),names);
        let queuedNames;
        if(fallback){
          await Promise.all(pages.map(cdp=>evaluate(cdp,"crossTabStoragePhase='queued handoff';void 0")));
          await evaluate(a,'crossTabLibrary.saveLibrary([])');
          assert.deepEqual(await evaluate(b,'crossTabLibrary.loadLibrary().then(items=>items.map(item=>item.name))'),[]);
          await evaluate(a,"window.queuedGate=navigator.locks.request('web-katrain-library',()=>new Promise(resolve=>window.releaseQueuedGate=resolve));void 0");
          await waitForExpression(a,'!!window.releaseQueuedGate');
          for(const [page,name] of [[a,'Queued A'],[b,'Queued B']]){
            await evaluate(page,`window.queuedOperation=crossTabLibrary.updateStoredLibrary(items=>({items:[crossTabLibrary.createLibraryItem(${JSON.stringify(name)},'(;SZ[9])'),...items],result:true}));void 0`);
          }
          await waitForExpression(a,"navigator.locks.query().then(state=>state.pending.filter(lock=>lock.name==='web-katrain-library').length>=2)");
          await evaluate(a,'releaseQueuedGate();void 0');
          await Promise.all(pages.map(page=>evaluate(page,'queuedOperation')));
          queuedNames=await evaluate(b,'crossTabLibrary.loadLibrary().then(items=>items.map(item=>item.name).sort())');
          if(JSON.stringify(queuedNames)!==JSON.stringify(['Queued A','Queued B']))console.log('Cross-tab queued failure',JSON.stringify({queuedNames,snapshots:await storageAudit()}));
          assert.deepEqual(queuedNames,['Queued A','Queued B'],'Queued fallback saves must read their predecessor’s committed snapshot');
          await navigate(a,appUrl);await waitForExpression(a,'!!document.querySelector("[data-board-snapshot]")');
          const reloaded=await evaluate(a,`(async()=>{const url=${loadedModuleUrl.toString()};const lib=await import(url('/src/utils/library.ts'));return(await lib.loadLibrary()).map(item=>item.name).sort()})()`);
          assert.deepEqual(reloaded,queuedNames,'Both queued saves must survive a reload');
          console.log('Cross-tab queued fallback saves',JSON.stringify({queuedNames,reloaded}));
        }
        reports.push({storage:fallback?'localStorage':'IndexedDB',waitedForWrite,names,emptyLibraryObserved:true,queuedNames});
      } finally {
        for(const cdp of pages)cdp.close();
        await browser.send('Target.disposeBrowserContext',{browserContextId:context});
      }
    }
  } finally {browser.close();}
  fs.writeFileSync(path.join(screenshotDir,'library-cross-tab.json'),JSON.stringify(reports,null,2));
  console.log('Cross-tab library: held IndexedDB writes preserve both games; fallback reads, queued saves and reload preserve additions and clears without resurrecting samples.');
}
