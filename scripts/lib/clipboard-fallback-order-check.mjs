import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evaluate, loadedModuleUrl, navigate, setViewport, waitForExpression } from './browser.mjs';

export async function assertClipboardFallbackOrder(cdp,appUrl,runDir,screenshotDir) {
  const fixture=path.join(runDir,'clipboard-fallback-fixture.json');
  fs.writeFileSync(fixture,JSON.stringify({app:'web-katrain',version:2,items:['Older','Newer'].map(name=>({
    id:`fallback-${name.toLowerCase()}`,type:'file',name:`${name} clipboard`,parentId:null,createdAt:1,updatedAt:1,
    sgf:`(;GM[1]SZ[9]GN[${name} clipboard];B[dd])`,
  }))}));
  const wait=expression=>waitForExpression(cdp,expression,{label:'Clipboard fallback request order',diagnose:`({audit:window.fallbackAudit?{requests:fallbackAudit.requests.map(r=>({text:r.text,expired:r.expired})),legacy:fallbackAudit.legacy,clicks:fallbackAudit.clicks}:null,focus:document.activeElement?.outerHTML.slice(0,180)})`});
  let mobile=false;
  const click=async selector=>{
    const p=await wait(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)return false;e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return r.width&&e.contains(document.elementFromPoint(x,y))?{x,y}:false})()`);
    if(mobile){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})}
    else for(const type of ['mousePressed','mouseReleased'])await cdp.send('Input.dispatchMouseEvent',{type,...p,button:'left',clickCount:1});
  };
  const copy=async id=>{
    await click(`[data-library-row-id="fallback-${id}"] .library-tree-node-more`);await wait('!!document.querySelector("[data-library-copy-sgf]")');
    await click('[data-library-copy-sgf]');await wait('!document.querySelector("[role=menu]")');
  };
  const settle=()=>evaluate(cdp,'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))');
  const reports=[];
  await cdp.send('Emulation.setFocusEmulationEnabled',{enabled:true});
  await cdp.send('Browser.grantPermissions',{origin:new URL(appUrl).origin,permissions:['clipboardReadWrite','clipboardSanitizedWrite']});
  try {
    for(const width of [1440,390,320]){
      mobile=width<600;
      const setup=await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`
        localStorage.removeItem('web-katrain:auto_saved_game:v1');localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
        localStorage.setItem('web-katrain:library_open:v1','true');localStorage.setItem('web-katrain:settings:v3',JSON.stringify({soundEnabled:false,loadSgfFastAnalysis:false}));
      `});
      try{await setViewport(cdp,{width,height:mobile?(width===320?568:844):900,mobile});await navigate(cdp,appUrl,15000,{acceptBeforeUnload:true})}
      finally{await cdp.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:setup.result.identifier})}
      await wait('!!document.querySelector("[data-board-snapshot]")');if(mobile)await click('#mobile-tab-library');
      await wait('document.querySelector("[data-library-storage-badge]")?.textContent==="IndexedDB"');
      const root=(await cdp.send('DOM.getDocument')).result.root;
      const input=(await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector:'input[type=file][accept=".json,application/json"]'})).result.nodeId;
      await cdp.send('DOM.setFileInputFiles',{nodeId:input,files:[fixture]});
      await wait(`document.querySelector('input[type=file][accept=".json,application/json"]').files.length===0`);await settle();
      if(await evaluate(cdp,'!!document.querySelector("[aria-labelledby=library-confirm-dialog-title]")'))await click('[aria-labelledby=library-confirm-dialog-title] button.danger');
      await wait('!document.querySelector("[role=dialog]") && !!document.querySelector("[data-library-row-id=fallback-newer]")');
      await evaluate(cdp,`(async()=>{
        const url=${loadedModuleUrl.toString()};const clipboardModule=await import(url('/src/utils/clipboard.ts'));
        window.fallbackLibrary=await import(url('/src/utils/library.ts'));
        const clipboard=navigator.clipboard,exec=document.execCommand.bind(document),setTimeout=window.setTimeout.bind(window);
        window.fallbackOriginals={clipboard,exec,setTimeout};window.fallbackAudit={requests:[],legacy:[],clicks:[],mode:'modern',timeout:clipboardModule.CLIPBOARD_OPERATION_TIMEOUT_MS};
        document.addEventListener('click',event=>{if(event.target.closest?.('[data-library-copy-sgf]'))fallbackAudit.clicks.push({trusted:event.isTrusted})},true);
        Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:text=>{
          const entry={text,started:performance.now(),finished:false,expired:false};fallbackAudit.requests.push(entry);fallbackAudit.pendingRequest=entry;
          const operation=text.includes('GN[Older clipboard]')?new Promise((resolve,reject)=>{entry.reject=reject}):fallbackAudit.mode==='legacy'?Promise.reject(new DOMException('Use legacy route','NotAllowedError')):clipboard.writeText(text);
          return operation.finally(()=>{entry.finished=true});
        }}});
        document.execCommand=(command,...args)=>{const text=document.activeElement?.value,result=exec(command,...args);if(command==='copy')fallbackAudit.legacy.push({text,result});return result};
        window.setTimeout=(callback,delay,...args)=>{
          if(typeof callback!=='function')return setTimeout(callback,delay,...args);
          const entry=delay===fallbackAudit.timeout?fallbackAudit.pendingRequest:null;
          return setTimeout((...values)=>{if(entry)entry.expired=true;return callback.apply(window,values)},delay,...args);
        };
      })()`);
      const stored=await evaluate(cdp,'fallbackLibrary.loadLibrary().then(items=>JSON.stringify(items))');
      const readBoard=`(()=>{const d=document.querySelector('[data-board-snapshot]').dataset;return {size:d.boardSize,moves:d.boardMoveCount,stones:d.boardStones,labels:d.boardLabels}})()`;
      const board=await evaluate(cdp,readBoard),cases=[];
      for(const newerRoute of ['modern','legacy'])for(const outcome of ['rejection','timeout']){
        const index=await evaluate(cdp,'fallbackAudit.requests.length'),legacyBefore=await evaluate(cdp,'fallbackAudit.legacy.length');
        await evaluate(cdp,`fallbackAudit.mode=${JSON.stringify(newerRoute)};void 0`);
        await copy('older');await wait(`fallbackAudit.requests.length===${index+1}`);
        await copy('newer');await wait(`fallbackAudit.requests.length===${index+2} && fallbackAudit.requests[${index+1}].finished`);await settle();
        const elapsed=await evaluate(cdp,`performance.now()-fallbackAudit.requests[${index}].started`);
        assert.ok(elapsed<1000,`The newer copy must finish before the old 1200 ms timeout (${elapsed} ms)`);
        const expectedLegacy=legacyBefore+(newerRoute==='legacy'?1:0);
        const latestFeedback=await evaluate(cdp,'document.querySelector(".notification-toast-message")?.title');
        assert.equal(await evaluate(cdp,'fallbackAudit.legacy.length'),expectedLegacy);
        assert.ok((await evaluate(cdp,'fallbackOriginals.clipboard.readText()')).includes('GN[Newer clipboard]'));
        if(outcome==='rejection')await evaluate(cdp,`fallbackAudit.requests[${index}].reject(new Error('Old write denied'));void 0`);
        else await wait(`fallbackAudit.requests[${index}].expired`);
        await settle();
        assert.ok((await evaluate(cdp,'fallbackOriginals.clipboard.readText()')).includes('GN[Newer clipboard]'),'A stale fallback must not overwrite the newer native clipboard content');
        assert.equal(await evaluate(cdp,'fallbackAudit.legacy.length'),expectedLegacy,'Only the latest request may use the legacy route');
        assert.equal(await evaluate(cdp,'document.querySelector(".notification-toast-message")?.title'),latestFeedback,'An older copy must not replace the latest copy feedback');
        cases.push({newerRoute,outcome});
      }
      const audit=await evaluate(cdp,'({clicks:fallbackAudit.clicks,legacy:fallbackAudit.legacy})');
      assert.equal(audit.clicks.length,8);assert.ok(audit.clicks.every(click=>click.trusted));assert.ok(audit.legacy.every(copy=>copy.result&&copy.text.includes('GN[Newer clipboard]')));
      assert.equal(await evaluate(cdp,'fallbackLibrary.loadLibrary().then(items=>JSON.stringify(items))'),stored);assert.deepEqual(await evaluate(cdp,readBoard),board);
      reports.push({width,cases,trustedCopyActions:audit.clicks.length,realClipboardPreserved:true,realLegacyCopies:audit.legacy.length});console.log('Clipboard fallback ordering',JSON.stringify(reports.at(-1)));
    }
    fs.writeFileSync(path.join(screenshotDir,'clipboard-fallback-order.json'),JSON.stringify(reports,null,2));
  } finally {
    await evaluate(cdp,`(async()=>{const original=window.fallbackOriginals;if(!original)return;await original.clipboard.writeText('');Object.defineProperty(navigator,'clipboard',{configurable:true,value:original.clipboard});document.execCommand=original.exec;window.setTimeout=original.setTimeout})()`).catch(()=>undefined);
    await cdp.send('Browser.resetPermissions');
  }
}
