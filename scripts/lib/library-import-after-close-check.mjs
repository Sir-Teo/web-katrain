import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {evaluate,loadedModuleUrl,navigate,setViewport,waitForExpression} from './browser.mjs';
import {installStorageControls} from './library-save-check.mjs';
export async function assertLibraryImportAfterClose(cdp,appUrl,runDir,screenshotDir) {
 const gamePath=path.join(runDir,'slow-study.sgf');fs.writeFileSync(gamePath,'(;GM[1]SZ[9]GN[Slow study];B[dd];W[ee])');
 const recoveryPath=path.join(runDir,'recovered-study.sgf');fs.writeFileSync(recoveryPath,'(;GM[1]SZ[9]GN[Recovered import];B[dd])');
 const backupPath=path.join(runDir,'import-destination.json');fs.writeFileSync(backupPath,JSON.stringify({app:'web-katrain',version:2,items:[
  {id:'import-target',type:'folder',name:'Import destination',parentId:null,createdAt:1,updatedAt:1},
  {id:'root-name',type:'file',name:'slow-study',parentId:null,createdAt:1,updatedAt:1,sgf:'(;GM[1]SZ[13]GN[Existing root game])'},
 ]}));
 const wait=expression=>waitForExpression(cdp,expression,{label:'Library import destination',diagnose:`({release:!!window.releaseHeldImport,toast:document.querySelector('.notification-toast-message')?.title,storage:document.querySelector('[data-library-storage-badge]')?.textContent,rows:[...document.querySelectorAll('[data-library-row]')].map(e=>e.dataset.libraryRowName),path:document.querySelector('.library-breadcrumbs')?.innerText})`});
 const click=async(selector,text)=>{
  const p=await wait(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>${text?`e.textContent.trim()===${JSON.stringify(text)}`:'true'});if(!e||e.disabled)return false;e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return r.width&&e.contains(document.elementFromPoint(x,y))?{x,y}:false})()`);
  for(const type of ['mousePressed','mouseReleased'])await cdp.send('Input.dispatchMouseEvent',{type,...p,button:'left',clickCount:1});
 };
 const upload=async(selector,file)=>{const root=(await cdp.send('DOM.getDocument')).result.root;const input=(await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector})).result.nodeId;await cdp.send('DOM.setFileInputFiles',{nodeId:input,files:[file]})};
 const reports=[];
 for(const width of [1440,390]) {
  const setup=await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`
   performance.setResourceTimingBufferSize(5000);
   localStorage.removeItem('web-katrain:auto_saved_game:v1');
   localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');
   localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
   localStorage.setItem('web-katrain:library_open:v1','true');
   localStorage.setItem('web-katrain:settings:v3',JSON.stringify({soundEnabled:false,loadSgfFastAnalysis:false}));
   const read=Blob.prototype.arrayBuffer;
   File.prototype.arrayBuffer=async function(){if(this.name==='slow-study.sgf')await new Promise(resolve=>window.releaseHeldImport=resolve);return read.call(this)};
  `});
  try{await setViewport(cdp,{width,height:width===390?844:900,mobile:width===390});await navigate(cdp,appUrl,15000,{acceptBeforeUnload:true})}
  finally{await cdp.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:setup.result.identifier})}
  await wait('!!document.querySelector("[data-board-snapshot]")');if(width===390)await click('#mobile-tab-library');
  await wait('document.querySelector("[data-library-storage-badge]")?.textContent==="IndexedDB"');
  await upload('input[type=file][accept=".json,application/json"]',backupPath);
  await wait('!!document.querySelector("[aria-labelledby=library-confirm-dialog-title]")');await click('[aria-labelledby=library-confirm-dialog-title] button.danger');
  await wait(`!!document.querySelector('[data-library-row-name="Import destination"]')&&!document.querySelector('[role=dialog]')&&!history.state?.webKatrainOverlay`);
  await evaluate(cdp,`(async()=>{const url=${loadedModuleUrl.toString()};window.importDestinationLibrary=await import(url('/src/utils/library.ts'))})()`);
  await click('[data-library-row-name="Import destination"]');
  await wait('document.querySelector(".library-breadcrumbs")?.innerText.includes("Import destination")');
  await upload('input[type=file][multiple]',gamePath);await wait('!!window.releaseHeldImport');
  if(width===390)await click('[aria-label="Back to board"]');
  else await click('button[title="Hide library"]');
  await wait('!document.querySelector("[data-library-storage-badge]")');
  await evaluate(cdp,'releaseHeldImport();delete window.releaseHeldImport');
  await wait('document.querySelector(".notification-toast-message")?.title.includes("Imported")');
  const items=await evaluate(cdp,'importDestinationLibrary.loadLibrary()');
  const imported=items.find(item=>item.type==='file'&&item.sgf.includes('GN[Slow study]'));
  assert.ok(imported,'The completed import must be stored');
  assert.equal(imported.parentId,'import-target','Closing Library must preserve the chosen destination');
  assert.equal(imported.name,'slow-study');
  assert.equal(items.find(item=>item.id==='root-name').sgf,'(;GM[1]SZ[13]GN[Existing root game])');
  if(width===390)await click('#mobile-tab-library');
  else await click('button[title="Show library"]');
  await wait('document.querySelector("[data-library-storage-badge]")?.textContent==="IndexedDB"');
  await click('[data-library-row-name="Import destination"]');
  await wait(`!!document.querySelector('[data-library-row-id="${imported.id}"]')`);
  await navigate(cdp,appUrl,15000,{acceptBeforeUnload:true});await wait('!!document.querySelector("[data-board-snapshot]")');if(width===390)await click('#mobile-tab-library');
  await wait(`document.querySelector('[data-library-storage-badge]')?.textContent==='IndexedDB'&&!!document.querySelector('[data-library-row-id="${imported.id}"]')`);
  // Reopen before a second read completes: the replacement panel must subscribe.
  await evaluate(cdp,`(()=>{const read=File.prototype.arrayBuffer;File.prototype.arrayBuffer=async function(){if(this.name==='slow-study.sgf')await new Promise(resolve=>window.releaseHeldImport=resolve);return read.call(this)}})()`);
  await click('[data-library-row-name="Import destination"]');
  await upload('input[type=file][multiple]',gamePath);await wait('!!window.releaseHeldImport');
  if(width===390)await click('[aria-label="Back to board"]');else await click('button[title="Hide library"]');
  await wait('!document.querySelector("[data-library-storage-badge]")');
  if(width===390)await click('#mobile-tab-library');else await click('button[title="Show library"]');
  await wait('document.querySelector("[data-library-storage-badge]")?.textContent==="IndexedDB"');
  await evaluate(cdp,'releaseHeldImport();delete window.releaseHeldImport');
  await wait(`!!document.querySelector('[data-library-row-name="slow-study 2"]')`);
  // A local rename may still be queued when the imported snapshot arrives.
  await evaluate(cdp,installStorageControls);
  await upload('input[type=file][multiple]',gamePath);await wait('!!window.releaseHeldImport');
  await evaluate(cdp,"librarySaveAudit.mode='delay';releaseHeldImport();delete window.releaseHeldImport");
  await wait('librarySaveAudit.held.length>0');
  await click('[data-library-row-id="root-name"] button.library-tree-node-more');
  await wait(`document.querySelector('[role=menu]')?.contains(document.activeElement)`);
  await evaluate(cdp,`[...document.querySelectorAll('[role=menu] button')].find(e=>e.textContent.trim()==='Rename').click()`);
  await wait(`!!document.querySelector('[aria-labelledby=library-text-dialog-title] input')`);
  await click('[aria-labelledby=library-text-dialog-title] input');
  for(const type of ['keyDown','keyUp'])await cdp.send('Input.dispatchKeyEvent',{type,key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers:2});
  await cdp.send('Input.insertText',{text:'Pending root rename'});
  for(const type of ['keyDown','keyUp'])await cdp.send('Input.dispatchKeyEvent',{type,key:'Enter',code:'Enter',windowsVirtualKeyCode:13,...(type==='keyDown'?{text:'\r'}:{})});
  await wait(`document.querySelector('[data-library-row-id="root-name"]')?.dataset.libraryRowName==='Pending root rename'&&!document.querySelector('[role=dialog]')&&!history.state?.webKatrainOverlay`);
  await evaluate(cdp,`(()=>{window.importRootNames=[];new MutationObserver(()=>importRootNames.push(document.querySelector('[data-library-row-id="root-name"]')?.dataset.libraryRowName)).observe(document.querySelector('[data-library-row-id="root-name"]'),{attributes:true,attributeFilter:['data-library-row-name']});librarySaveAudit.mode='normal';librarySaveAudit.held.splice(0).forEach(release=>release())})()`);
  await wait(`!!document.querySelector('[data-library-row-name="slow-study 3"]')&&document.querySelector('[data-library-storage-badge]')?.textContent==='IndexedDB'`);
  assert.equal(await evaluate(cdp,`document.querySelector('[data-library-row-id="root-name"]').dataset.libraryRowName`),'Pending root rename');
  assert.equal(await evaluate(cdp,`importRootNames.some(name=>name!=='Pending root rename')`),false,'An imported snapshot must not flash over a pending local rename');
  // A rejected write must report failure, and the same file can be retried.
  await upload('input[type=file][multiple]',gamePath);await wait('!!window.releaseHeldImport');
  await evaluate(cdp,"librarySaveAudit.mode='fail';releaseHeldImport();delete window.releaseHeldImport");
  await wait(`document.querySelector('.notification-toast-message')?.title.includes('Could not save imported files')`);
  assert.equal(await evaluate(cdp,`!!document.querySelector('[data-library-row-name="slow-study 4"]')`),false);
  await evaluate(cdp,"librarySaveAudit.mode='normal'");
  await upload('input[type=file][multiple]',gamePath);await wait('!!window.releaseHeldImport');
  await evaluate(cdp,'releaseHeldImport();delete window.releaseHeldImport');
  await wait(`!!document.querySelector('[data-library-row-name="slow-study 4"]')`);
  assert.equal(await evaluate(cdp,`!!document.querySelector('[data-library-row-name="slow-study 5"]')`),false,'Retrying a failed import must not add two copies');
  await navigate(cdp,appUrl,15000,{acceptBeforeUnload:true});await wait('!!document.querySelector("[data-board-snapshot]")');if(width===390)await click('#mobile-tab-library');
  await wait(`document.querySelector('[data-library-storage-badge]')?.textContent==='IndexedDB'&&!!document.querySelector('[data-library-row-name="slow-study 4"]')&&document.querySelector('[data-library-row-id="root-name"]')?.dataset.libraryRowName==='Pending root rename'`);
  await evaluate(cdp,`(()=>{const fetch=window.fetch.bind(window);window.fetch=(input,init)=>{
    const url=typeof input==='string'?input:input.url;
    if(url.includes('/games/991234/sgf'))return new Promise(resolve=>window.releaseDroppedImport=()=>resolve(new Response('(;GM[1]SZ[9]GN[Delayed OGS import];B[dd])',{headers:{'content-type':'application/x-go-sgf'}})));
    return fetch(input,init);
  }})()`);
  for(const type of ['dragEnter','dragOver','drop']) {
   const p=await evaluate(cdp,`(()=>{const e=document.querySelector('[data-library-row-id="import-target"]');e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
   await cdp.send('Input.dispatchDragEvent',{type,...p,data:{items:[{mimeType:'text/uri-list',data:'https://online-go.com/game/991234'}],dragOperationsMask:1}});
  }
  await wait('!!window.releaseDroppedImport');
  if(width===390)await click('[aria-label="Back to board"]');else await click('button[title="Hide library"]');
  await wait('!document.querySelector("[data-library-storage-badge]")');
  if(width===390)await click('#mobile-tab-library');else await click('button[title="Show library"]');
  await wait('document.querySelector("[data-library-storage-badge]")?.textContent==="IndexedDB"');
  await evaluate(cdp,'releaseDroppedImport();delete window.releaseDroppedImport');
  await wait(`!!document.querySelector('[data-library-row-name="Delayed OGS import"]')`);
  await navigate(cdp,appUrl,15000,{acceptBeforeUnload:true});await wait('!!document.querySelector("[data-board-snapshot]")');if(width===390)await click('#mobile-tab-library');
  await wait(`document.querySelector('[data-library-storage-badge]')?.textContent==='IndexedDB'&&!!document.querySelector('[data-library-row-name="Delayed OGS import"]')&&!!document.querySelector('[data-library-row-name="slow-study 4"]')`);
  await evaluate(cdp,installStorageControls);
  if(width===390)await click('[aria-label="Back to board"]');else await click('button[title="Hide library"]');
  await wait('!document.querySelector("[data-library-storage-badge]")');
  await evaluate(cdp,"librarySaveAudit.mode='fail'");
  if(width===390)await click('#mobile-tab-library');else await click('button[title="Show library"]');
  await wait('document.querySelector("[data-library-storage-badge]")?.textContent==="Error"');
  await evaluate(cdp,"librarySaveAudit.mode='normal'");
  await upload('input[type=file][multiple]',recoveryPath);
  await wait(`document.querySelector('.notification-toast-message')?.title.includes('Imported')`);
  assert.equal(await evaluate(cdp,`document.querySelector('[data-library-storage-badge]')?.textContent`),'IndexedDB','A committed import must recover an initially unavailable Library');
  await wait(`!!document.querySelector('[data-library-row-name="recovered-study"]')`);
  const persisted=await evaluate(cdp,`new Promise((resolve,reject)=>{const open=indexedDB.open('web-katrain-library');open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,r=db.transaction('items','readonly').objectStore('items').getAll();r.onsuccess=()=>{db.close();resolve(r.result)};r.onerror=()=>reject(r.error)}})`);
  assert.equal(persisted.find(item=>item.id==='root-name').sgf,'(;GM[1]SZ[13]GN[Existing root game])');
  assert.equal(persisted.find(item=>item.id==='root-name').name,'Pending root rename');
  assert.equal(persisted.filter(item=>item.type==='file'&&item.name.startsWith('slow-study')).length,4,'A failed import retry must not duplicate a saved game');
  assert.equal(persisted.find(item=>item.name==='Delayed OGS import').parentId,'import-target');
  reports.push({width,closedPanelImportPersists:true,reopenedPanelReceivesCompletion:true,pendingRenamePreserved:true,failedWriteDoesNotReportSuccess:true,sameFileRetryWorks:true,droppedOgsImportSurvivesClose:true,initialStorageErrorRecovered:true,completedImportVisible:true,existingRootGamePreserved:true,chosenFolderRetained:true,reloadPreserved:true});
 }
 fs.writeFileSync(path.join(screenshotDir,'library-import-after-close.json'),JSON.stringify(reports,null,2));
 console.log('Library import persistence: desktop/phone close/reopen, pending rename, failed-write retry without duplicates, delayed OGS drops, initial-error recovery and stored SGF preservation passed.');
}
