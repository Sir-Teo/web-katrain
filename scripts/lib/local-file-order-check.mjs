import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evaluate, loadedModuleUrl, navigate, setViewport, waitForExpression } from './browser.mjs';

export async function assertLocalFileOrder(cdp, appUrl, runDir, screenshotDir) {
  const older='(;GM[1]SZ[13]GN[Older local file];B[aa])';
  const newer='(;GM[1]SZ[9]GN[Newer local file];B[ee])';
  const held=path.join(runDir,'file-order-held.sgf'),fresh=path.join(runDir,'file-order-fresh.sgf');
  fs.writeFileSync(held,older);fs.writeFileSync(fresh,newer);
  const fixture=path.join(runDir,'file-order-library.json');
  fs.writeFileSync(fixture,JSON.stringify({app:'web-katrain',version:2,items:[9,19].map(size=>({
    id:`file-selected-${size}`,type:'file',name:`File selected ${size}`,parentId:null,createdAt:1,updatedAt:1,
    sgf:`(;GM[1]SZ[${size}]GN[File selected ${size}];B[dd])`,
  }))}));
  let mobile=false;
  const wait=expression=>waitForExpression(cdp,expression,{label:'Local file import ownership',diagnose:`({size:document.querySelector('[data-board-snapshot]')?.dataset.boardSize,reads:window.fileOrderReads?.map(r=>({name:r.name,done:r.done})),events:window.fileOrderEvents,dialogs:[...document.querySelectorAll('[role=dialog]')].map(e=>e.textContent.slice(0,120))})`});
  const settle=()=>evaluate(cdp,'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))');
  const click=async selector=>{
    const p=await wait(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)return false;e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return r.width&&e.contains(document.elementFromPoint(x,y))?{x,y}:false})()`);
    if(mobile){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})}
    else for(const type of ['mousePressed','mouseReleased'])await cdp.send('Input.dispatchMouseEvent',{type,...p,button:'left',clickCount:1});
  };
  const setFile=async(selector,file)=>{
    const root=(await cdp.send('DOM.getDocument')).result.root;
    const input=(await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector})).result.nodeId;
    assert.ok(input,`Find ${selector}`);await cdp.send('DOM.setFileInputFiles',{nodeId:input,files:[file]});
  };
  const record=()=>evaluate(cdp,`(()=>{const s=fileOrderStore.getState(),b=document.querySelector('[data-board-snapshot]');return {root:s.rootNode.id,name:s.rootNode.properties?.GN?.[0],size:b.dataset.boardSize,moves:b.dataset.boardMoveCount,stones:b.dataset.boardStones}})()`);
  const start=async(kind,file=held)=>{
    const index=await evaluate(cdp,'fileOrderReads.length');
    if(kind==='picker')await setFile('input[type=file][accept*=".sgf"][accept*=".bin"]',file);
    else if(kind==='launch'){
      await wait('typeof fileOrderLaunchConsumer==="function"');
      await evaluate(cdp,`fileOrderLaunchConsumer({files:[{getFile:async()=>new File([${JSON.stringify(file===held?older:newer)}],${JSON.stringify(path.basename(file))},{type:'application/x-go-sgf'})}]});void 0`);
    }
    else {
      if(mobile)await click('#mobile-tab-board');
      const p=await wait(`(()=>{const e=document.querySelector('[data-board-snapshot]');const r=e.getBoundingClientRect();return r.width?{x:r.x+r.width/2,y:r.y+r.height/2}:false})()`);
      for(const type of ['dragEnter','dragOver','drop'])await cdp.send('Input.dispatchDragEvent',{type,...p,data:{items:[],files:[file],dragOperationsMask:1}});
    }
    if(file===held)await wait(`fileOrderReads.length===${index+1}`);
    return index;
  };
  const release=async(index,reject=false)=>{
    await evaluate(cdp,`fileOrderReads[${index}].${reject?'reject(new Error("Old file read failed"))':'resolve()'};void 0`);
    await wait(`fileOrderReads[${index}].done`);await settle();
  };
  const paste=async text=>{
    const count=await evaluate(cdp,'fileOrderEvents.filter(e=>e.type==="paste").length');
    await evaluate(cdp,`navigator.clipboard.writeText(${JSON.stringify(text)})`);
    await evaluate(cdp,`(()=>{const board=document.querySelector('[data-board-snapshot]');(board.getClientRects().length?board:document.querySelector('[data-library-row]')).focus();return true})()`);
    for(const type of ['keyDown','keyUp'])await cdp.send('Input.dispatchKeyEvent',{type,key:'v',code:'KeyV',windowsVirtualKeyCode:86,modifiers:2});
    await wait(`fileOrderEvents.filter(e=>e.type==='paste').length===${count+1}`);
  };
  const select=async size=>{
    if(mobile)await click('#mobile-tab-library');
    const previous=(await record()).root;await click(`[data-library-row-id="file-selected-${size}"]`);
    await wait(`fileOrderStore.getState().rootNode.id!==${JSON.stringify(previous)}`);
    const selected=await record();assert.equal(selected.name,`File selected ${size}`);return selected;
  };
  const startHandle=async()=>{
    const index=await evaluate(cdp,'fileOrderHandles.length');
    await evaluate(cdp,`fileOrderLaunchConsumer({files:[{getFile:()=>new Promise((resolve,reject)=>fileOrderHandles.push({resolve:()=>resolve(new File([${JSON.stringify(older)}],'file-order-held.sgf',{type:'application/x-go-sgf'})),reject}))},{getFile:async()=>{fileOrderBatchTails++;return new File([${JSON.stringify(newer)}],'file-order-tail.sgf',{type:'application/x-go-sgf'})}}]});void 0`);
    await wait(`fileOrderHandles.length===${index+1}`);return index;
  };
  const finishHandle=async(index,reject=false)=>{
    await evaluate(cdp,`fileOrderHandles[${index}].${reject?'reject(new Error("Old file handle failed"))':'resolve()'};void 0`);await settle();
  };
  const results=[];
  await cdp.send('Emulation.setFocusEmulationEnabled',{enabled:true});
  await cdp.send('Browser.grantPermissions',{origin:new URL(appUrl).origin,permissions:['clipboardReadWrite','clipboardSanitizedWrite']});
  try {
  for(const width of [1440,390,320]){
    mobile=width<600;
    const setup=await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`
      localStorage.removeItem('web-katrain:auto_saved_game:v1');localStorage.removeItem('web-katrain:shortcuts:v1');
      localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
      localStorage.setItem('web-katrain:library_open:v1','true');localStorage.setItem('web-katrain:settings:v3',JSON.stringify({soundEnabled:false,loadSgfFastAnalysis:false}));
      Object.defineProperty(window,'launchQueue',{configurable:true,value:{setConsumer:consumer=>window.fileOrderLaunchConsumer=consumer}});
    `});
    try{await setViewport(cdp,{width,height:mobile?(width===320?568:844):900,mobile});await navigate(cdp,appUrl,15000,{acceptBeforeUnload:true})}
    finally{await cdp.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:setup.result.identifier})}
    await wait('!!document.querySelector("[data-board-snapshot]")');if(mobile)await click('#mobile-tab-library');
    await wait('document.querySelector("[data-library-storage-badge]")?.textContent==="IndexedDB"');
    await setFile('input[type=file][accept=".json,application/json"]',fixture);
    await wait(`document.querySelector('input[type=file][accept=".json,application/json"]').files.length===0`);await settle();
    if(await evaluate(cdp,'!!document.querySelector("[aria-labelledby=library-confirm-dialog-title]")'))await click('[aria-labelledby=library-confirm-dialog-title] button.danger');
    await wait('!document.querySelector("[role=dialog]") && !!document.querySelector("[data-library-row-id=file-selected-19]")');
    await evaluate(cdp,`(async()=>{
      const url=${loadedModuleUrl.toString()};window.fileOrderStore=(await import(url('/src/store/gameStore.ts'))).useGameStore;
      window.fileOrderReads=[];window.fileOrderEvents=[];window.fileOrderDownloads=[];window.fileOrderHandles=[];window.fileOrderBatchTails=0;
      const fetchOriginal=window.fetch;window.fetch=(url,init)=>String(url).includes('online-go.com/api/v1/games/')
        ?new Promise(resolve=>fileOrderDownloads.push({resolve,signal:init?.signal})):fetchOriginal(url,init);
      const original=File.prototype.arrayBuffer;File.prototype.arrayBuffer=function(...args){
        if(this.name!=='file-order-held.sgf')return original.apply(this,args);
        const file=this,entry={name:this.name,done:false};fileOrderReads.push(entry);
        return new Promise((resolve,reject)=>{entry.resolve=()=>original.apply(file,args).then(resolve,reject);entry.reject=reject}).finally(()=>{entry.done=true});
      };
      for(const type of ['change','drop','paste'])document.addEventListener(type,e=>{if(type!=='change'||e.target.matches?.('input[type=file][accept*=".bin"]'))fileOrderEvents.push({type,trusted:e.isTrusted})},true);
    })()`);
    const cases=[];
    for(const kind of ['picker','drop','launch']){
      await select(9);const index=await start(kind);const selected=await select(19);
      await release(index);assert.deepEqual(await record(),selected,`${kind}: a slow file must preserve the subsequently selected Library game`);cases.push(`${kind}-selection`);
      const failed=await start(kind);const selectedAgain=await select(9);await release(failed,true);
      assert.deepEqual(await record(),selectedAgain);assert.equal(await evaluate(cdp,'!!document.querySelector("[data-notification-type=error]")'),false);cases.push(`${kind}-stale-failure`);
    }
    // A second file owns its request even while an older file is still reading.
    let old=await start('picker');await start('picker',fresh);await wait('fileOrderStore.getState().rootNode.properties.GN?.[0]==="Newer local file"');
    let selected=await record();await release(old);assert.deepEqual(await record(),selected);cases.push('picker-order');
    // Files and pasted text use the same request owner in both entry orders.
    old=await start('picker');const beforePaste=(await record()).root;await paste(newer);
    await wait(`fileOrderStore.getState().rootNode.id!==${JSON.stringify(beforePaste)}`);selected=await record();assert.equal(selected.name,'Newer local file');await release(old);assert.deepEqual(await record(),selected);cases.push('file-then-paste');
    await paste('https://online-go.com/game/12345');await wait('fileOrderDownloads.length===1');
    const beforeFile=(await record()).root;await start('picker',fresh);await wait('fileOrderDownloads[0].signal.aborted');
    await wait(`fileOrderStore.getState().rootNode.id!==${JSON.stringify(beforeFile)}`);selected=await record();
    await evaluate(cdp,`fileOrderDownloads[0].resolve(new Response(${JSON.stringify(older)}));void 0`);await settle();assert.deepEqual(await record(),selected);cases.push('paste-then-file');
    // The OS may still be acquiring the File, before arrayBuffer is called.
    for(const reject of [false,true]){
      const handle=await startHandle();selected=await select(reject?9:19);
      const reads=await evaluate(cdp,'fileOrderReads.length');await finishHandle(handle,reject);
      assert.deepEqual(await record(),selected);assert.equal(await evaluate(cdp,'fileOrderReads.length'),reads);
      assert.equal(await evaluate(cdp,'fileOrderBatchTails'),0,'Canceled launches must stop their remaining batch');
      assert.equal(await evaluate(cdp,'!!document.querySelector("[data-notification-type=error]")'),false);
      cases.push(reject?'handle-stale-failure':'handle-selection');
    }
    for(const kind of ['picker','launch']){
      const handle=await startHandle(),previousRoot=(await record()).root;await start(kind,fresh);
      await wait(`fileOrderStore.getState().rootNode.id!==${JSON.stringify(previousRoot)}`);await wait('fileOrderStore.getState().rootNode.properties.GN?.[0]==="Newer local file"');selected=await record();
      const reads=await evaluate(cdp,'fileOrderReads.length');await finishHandle(handle);
      assert.deepEqual(await record(),selected);assert.equal(await evaluate(cdp,'fileOrderReads.length'),reads);assert.equal(await evaluate(cdp,'fileOrderBatchTails'),0);cases.push(`handle-then-${kind}`);
    }
    const downloads=await evaluate(cdp,'fileOrderDownloads.length');await paste('https://online-go.com/game/12346');await wait(`fileOrderDownloads.length===${downloads+1}`);
    const handle=await startHandle();await wait(`fileOrderDownloads[${downloads}].signal.aborted`);selected=await record();
    await evaluate(cdp,`fileOrderDownloads[${downloads}].resolve(new Response(${JSON.stringify(newer)}));void 0`);await settle();assert.deepEqual(await record(),selected);
    // Cancel acquisition by choosing a Library game, then allow an ordinary batch.
    selected=await select(9);await finishHandle(handle);assert.deepEqual(await record(),selected);assert.equal(await evaluate(cdp,'fileOrderBatchTails'),0);cases.push('paste-then-handle');
    await evaluate(cdp,`fileOrderLaunchConsumer({files:[{getFile:async()=>new File([${JSON.stringify(newer)}],'batch-first.sgf')},{getFile:async()=>{fileOrderBatchTails++;return new File(['(;GM[1]SZ[13]GN[Batch second];B[aa])'],'batch-second.sgf')}}]});void 0`);
    await wait('fileOrderStore.getState().rootNode.properties.GN?.[0]==="Batch second"');assert.equal(await evaluate(cdp,'fileOrderBatchTails'),1);cases.push('ordinary-launch-batch');
    // Retry through every local entry path after cancellation.
    for(const kind of ['picker','drop','launch']){
      await select(19);await start(kind,fresh);await wait('fileOrderStore.getState().rootNode.properties.GN?.[0]==="Newer local file"');cases.push(`${kind}-retry`);
    }
    const events=await evaluate(cdp,'fileOrderEvents');for(const type of ['change','drop','paste'])assert.ok(events.some(e=>e.type===type&&e.trusted),`${type} must exercise trusted browser events`);
    if(mobile)await click('#mobile-tab-board');
    const shot=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(screenshotDir,`local-file-order-${width}.png`),Buffer.from(shot.result.data,'base64'));
    results.push({width,cases,events,launchQueueCallback:true});console.log('Local file ordering',JSON.stringify({...results.at(-1),events:events.length}));
  }
  fs.writeFileSync(path.join(screenshotDir,'local-file-order.json'),JSON.stringify(results,null,2));
  } finally {
    await evaluate(cdp,"navigator.clipboard.writeText('')").catch(()=>undefined);
    await cdp.send('Browser.resetPermissions');
  }
}
