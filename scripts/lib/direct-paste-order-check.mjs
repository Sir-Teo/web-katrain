import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evaluate, loadedModuleUrl, navigate, setViewport, waitForExpression } from './browser.mjs';

export async function assertDirectPasteOrder(cdp, appUrl, runDir, screenshotDir) {
  const fixture=path.join(runDir,'direct-paste-library-fixture.json');
  fs.writeFileSync(fixture,JSON.stringify({app:'web-katrain',version:2,items:[9,19].map(size=>({id:`direct-selected-${size}`,type:'file',name:`Direct selected ${size}`,parentId:null,createdAt:1,updatedAt:1,sgf:`(;GM[1]SZ[${size}]GN[Direct selected ${size}];B[dd])`}))}));
  const wait=expression=>waitForExpression(cdp,expression,{label:'Trusted paste import ordering',diagnose:`({root:window.directPasteStore?.getState().rootNode.id,size:document.querySelector('[data-board-snapshot]')?.dataset.boardSize,events:window.directPasteEvents,reads:window.directPasteReads?.length,downloads:window.directPasteDownloads?.length,focus:document.activeElement?.outerHTML.slice(0,200)})`});
  let mobile=false;
  const click=async selector=>{
    const p=await wait(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)return false;e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return r.width&&e.contains(document.elementFromPoint(x,y))?{x,y}:false})()`);
    if(mobile){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})}
    else for(const type of ['mousePressed','mouseReleased'])await cdp.send('Input.dispatchMouseEvent',{type,...p,button:'left',clickCount:1});
  };
  const key=async(key,code,windowsVirtualKeyCode,modifiers=0)=>{for(const type of ['keyDown','keyUp'])await cdp.send('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode,modifiers,...(type==='keyDown'&&key==='Enter'?{text:String.fromCharCode(13)}:{})})};
  const settle=()=>evaluate(cdp,'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))');
  const record=()=>evaluate(cdp,`(()=>{const s=directPasteStore.getState(),b=document.querySelector('[data-board-snapshot]');return {root:s.rootNode.id,name:s.rootNode.properties?.GN?.[0],size:b.dataset.boardSize,moves:b.dataset.boardMoveCount,stones:b.dataset.boardStones}})()`);
  const paste=async text=>{
    const count=await evaluate(cdp,'directPasteEvents.length');
    await evaluate(cdp,`nativePasteClipboard.writeText(${JSON.stringify(text)})`);
    await evaluate(cdp,`(()=>{const b=document.querySelector('[data-board-snapshot]');const target=b.getClientRects().length?b:document.querySelector('[data-library-row]');target.focus();return true})()`);
    await key('v','KeyV',86,2);await wait(`directPasteEvents.length===${count+1}`);
    assert.equal(await evaluate(cdp,`directPasteEvents[${count}].trusted`),true,'This must exercise the browser paste event');
  };
  const command=async()=>{
    const index=await evaluate(cdp,'directPasteReads.length');await key('k','KeyK',75,2);await wait('!!document.querySelector("[data-command-palette-search]")');
    await click('[data-command-palette-search]');await cdp.send('Input.insertText',{text:'Paste SGF'});await key('Enter','Enter',13);await wait(`directPasteReads.length===${index+1}`);return index;
  };
  const finishRead=async(index,text)=>{
    const elapsed=await evaluate(cdp,`(()=>{const r=directPasteReads[${index}],elapsed=performance.now()-r.started;r.resolve(${JSON.stringify(text)});return elapsed})()`);
    assert.ok(elapsed<1000,`Read fixture must resolve before its 1200 ms timeout (${elapsed} ms)`);await settle();
  };
  const release=async(index,text)=>{await evaluate(cdp,`directPasteDownloads[${index}].resolve(new Response(${JSON.stringify(text)}));void 0`);await settle()};
  const downloadCount=()=>evaluate(cdp,'directPasteDownloads.length');
  const newer='(;GM[1]SZ[9]GN[New direct paste];B[ee])',older='(;GM[1]SZ[13]GN[Old direct paste];B[aa])';
  const results=[];
  await cdp.send('Emulation.setFocusEmulationEnabled',{enabled:true});
  await cdp.send('Browser.grantPermissions',{origin:new URL(appUrl).origin,permissions:['clipboardReadWrite','clipboardSanitizedWrite']});
  try{
    for(const width of [1440,390,320]){
      mobile=width<600;
      const setup=await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`
        localStorage.removeItem('web-katrain:auto_saved_game:v1');localStorage.removeItem('web-katrain:shortcuts:v1');
        localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
        localStorage.setItem('web-katrain:library_open:v1','true');localStorage.setItem('web-katrain:settings:v3',JSON.stringify({soundEnabled:false,loadSgfFastAnalysis:false}));
      `});
      try{await setViewport(cdp,{width,height:mobile?(width===320?568:844):900,mobile});await navigate(cdp,appUrl,15000,{acceptBeforeUnload:true})}
      finally{await cdp.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:setup.result.identifier})}
      await wait('!!document.querySelector("[data-board-snapshot]")');if(mobile)await click('#mobile-tab-library');await wait('document.querySelector("[data-library-storage-badge]")?.textContent==="IndexedDB"');
      const root=(await cdp.send('DOM.getDocument')).result.root;
      const input=(await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector:'input[type=file][accept=".json,application/json"]'})).result.nodeId;
      await cdp.send('DOM.setFileInputFiles',{nodeId:input,files:[fixture]});
      await wait(`document.querySelector('input[type=file][accept=".json,application/json"]').files.length===0`);await settle();
      if(await evaluate(cdp,'!!document.querySelector("[aria-labelledby=library-confirm-dialog-title]")'))await click('[aria-labelledby=library-confirm-dialog-title] button.danger');
      await wait('!document.querySelector("[role=dialog]") && !!document.querySelector("[data-library-row-id=direct-selected-19]")');
      await evaluate(cdp,`(async()=>{
        const url=${loadedModuleUrl.toString()};window.directPasteStore=(await import(url('/src/store/gameStore.ts'))).useGameStore;
        window.nativePasteClipboard=navigator.clipboard;window.directPasteEvents=[];window.directPasteReads=[];window.directPasteDownloads=[];
        document.addEventListener('paste',e=>directPasteEvents.push({trusted:e.isTrusted,text:e.clipboardData?.getData('text/plain')}),true);
        Object.defineProperty(navigator,'clipboard',{configurable:true,value:{readText:()=>new Promise(resolve=>directPasteReads.push({resolve,started:performance.now()}))}});
        const original=window.fetch;window.fetch=(url,init)=>String(url).includes('online-go.com/api/v1/games/')?new Promise(resolve=>directPasteDownloads.push({resolve,signal:init?.signal})):original(url,init);
      })()`);
      // A new native paste supersedes a download from an earlier native paste.
      let count=await downloadCount();await paste('https://online-go.com/game/12345');await wait(`directPasteDownloads.length===${count+1}`);
      await paste(newer);await settle();let selected=await record();assert.equal(selected.size,'9');assert.equal(await evaluate(cdp,`directPasteDownloads[${count}].signal.aborted`),true);
      await release(count,older);assert.deepEqual(await record(),selected);
      // A command starts owning its request before the clipboard read settles.
      count=await downloadCount();await paste('https://online-go.com/game/12345');await wait(`directPasteDownloads.length===${count+1}`);selected=await record();
      let read=await command();assert.equal(await evaluate(cdp,`directPasteDownloads[${count}].signal.aborted`),true);await release(count,older);assert.deepEqual(await record(),selected);await finishRead(read,newer);
      // Conversely, a later native paste must retain ownership over an older read.
      read=await command();count=await downloadCount();await paste('https://online-go.com/game/12345');await wait(`directPasteDownloads.length===${count+1}`);selected=await record();
      await finishRead(read,older);assert.deepEqual(await record(),selected);assert.equal(await evaluate(cdp,`directPasteDownloads[${count}].signal.aborted`),false);await release(count,newer);
      // Two queued OGS requests still choose request order over completion order.
      count=await downloadCount();await paste('https://online-go.com/game/12345');await wait(`directPasteDownloads.length===${count+1}`);selected=await record();await paste('https://online-go.com/game/12346');
      assert.equal(await evaluate(cdp,`directPasteDownloads[${count}].signal.aborted`),true);await release(count,older);await wait(`directPasteDownloads.length===${count+2}`);assert.deepEqual(await record(),selected);await release(count+1,newer);assert.equal((await record()).size,'9');
      // Choosing a saved record after the paste keeps that exact game selected.
      if(mobile)await click('#mobile-tab-library');await wait('!!document.querySelector("[data-library-row-id=direct-selected-19]")');
      count=await downloadCount();await paste('https://online-go.com/game/12345');await wait(`directPasteDownloads.length===${count+1}`);const beforeRoot=(await record()).root;
      await click('[data-library-row-id=direct-selected-19]');await wait(`directPasteStore.getState().rootNode.id!==${JSON.stringify(beforeRoot)}`);selected=await record();assert.equal(selected.name,'Direct selected 19');
      await release(count,older);assert.deepEqual(await record(),selected);assert.equal(await evaluate(cdp,'!!document.querySelector("[data-notification-type=error], .paste-sgf-modal-textarea")'),false);
      await paste(newer);await settle();assert.equal((await record()).size,'9','A fresh direct paste still loads normally');
      const shot=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(screenshotDir,`direct-paste-order-${width}.png`),Buffer.from(shot.result.data,'base64'));
      results.push({width,trustedEvents:await evaluate(cdp,'directPasteEvents'),directOrdering:true,mixedOrdering:true,queuedOgs:true,librarySelection:true,retry:true});console.log('Trusted paste ordering',JSON.stringify({...results.at(-1),trustedEvents:results.at(-1).trustedEvents.length}));
    }
    fs.writeFileSync(path.join(screenshotDir,'direct-paste-order.json'),JSON.stringify(results,null,2));
  }finally{
    await evaluate(cdp,"(window.nativePasteClipboard??navigator.clipboard)?.writeText('')").catch(()=>undefined);
    await cdp.send('Browser.resetPermissions');
  }
}
