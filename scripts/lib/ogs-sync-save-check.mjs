import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {evaluate,loadedModuleUrl,navigate,setViewport,waitForExpression} from './browser.mjs';
import {installStorageControls} from './library-save-check.mjs';

/** Exercise completed downloads against real failed and delayed browser storage. */
export async function assertOgsSyncSave(cdp,appUrl,screenshotDir) {
 const reports=[];
 let mobile=false;
 const wait=expression=>waitForExpression(cdp,expression,{label:'OGS durable save',diagnose:`({held:librarySaveAudit?.held.length,mode:librarySaveAudit?.mode,dialog:document.querySelector('[aria-labelledby=ogs-sync-title]')?.textContent,toast:document.querySelector('.notification-toast-message')?.title,storage:document.querySelector('[data-library-storage-badge]')?.textContent})`});
 const click=async(selector,text)=>{
  const p=await wait(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>${text?`e.textContent.trim()===${JSON.stringify(text)}`:'true'});if(!e||e.disabled)return false;e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return r.width&&e.contains(document.elementFromPoint(x,y))?{x,y}:false})()`);
  if(mobile){
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }else for(const type of ['mousePressed','mouseReleased'])await cdp.send('Input.dispatchMouseEvent',{type,...p,button:'left',clickCount:1});
 };
 const storedItems=`new Promise((resolve,reject)=>{const r=librarySaveAudit.open('web-katrain-library');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,q=db.transaction('items','readonly').objectStore('items').getAll();q.onerror=()=>reject(q.error);q.onsuccess=()=>{db.close();resolve(q.result)}}})`;
 const readStored=()=>evaluate(cdp,storedItems);
 const open=async()=>{
  await click('[aria-label="More library actions"]');await click('[role=menuitem]','Sync from OGS');
  await wait('!!document.querySelector("#ogs-sync-username")');
  await click('#ogs-sync-username');
  for(const type of ['keyDown','keyUp'])await cdp.send('Input.dispatchKeyEvent',{type,key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers:2});
  await cdp.send('Input.insertText',{text:'Alice'});
 };
 for(const width of [1440,390,320]) {
  mobile=width<1000;
  const setup=await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`
   performance.setResourceTimingBufferSize(5000);
   localStorage.removeItem('web-katrain:auto_saved_game:v1');
   localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');
   localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
   localStorage.setItem('web-katrain:library_open:v1','true');
   localStorage.setItem('web-katrain:settings:v3',JSON.stringify({soundEnabled:false,loadSgfFastAnalysis:false,timerByoPeriods:0,timerMainTimeMinutes:0}));
  `});
  try{await setViewport(cdp,{width,height:width===320?568:mobile?844:900,mobile});await navigate(cdp,appUrl,15000,{acceptBeforeUnload:true})}
  finally{await cdp.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:setup.result.identifier})}
  await wait('!!document.querySelector("[data-board-snapshot]")');if(mobile)await click('#mobile-tab-library');
  await wait('document.querySelector("[data-library-storage-badge]")?.textContent==="IndexedDB"');
  await evaluate(cdp,installStorageControls);
  const sgf='(;GM[1]SZ[9]PB[Alice]PW[Bob]C[Keep imported comments];B[dd];W[ee])';
  await evaluate(cdp,`(()=>{
   const original=fetch.bind(window);window.ogsSaveAudit={id:${980000+width},requests:[]};
   window.fetch=(input,init)=>{
    const url=String(input);if(!url.includes('online-go.com/'))return original(input,init);
    ogsSaveAudit.requests.push(url);
    const payload=url.includes('/sgf')?${JSON.stringify(sgf)}:url.includes('/games/')?JSON.stringify({results:[{id:ogsSaveAudit.id,name:'OGS storage study',width:9,height:9,ended:'2026-10-25',players:{black:{username:'Alice'},white:{username:'Bob'}}}],next:null}):JSON.stringify({results:[{id:42,username:'Alice'}]});
    if(url.includes('/sgf')&&ogsSaveAudit.holdNext){
     ogsSaveAudit.holdNext=false;
     return new Promise(resolve=>window.releaseConcurrentOgsDownload=()=>resolve(new Response(payload)));
    }
    return Promise.resolve(new Response(payload));
   };return true;
  })()`);
  const baseline=await readStored();
  await open();await evaluate(cdp,"librarySaveAudit.mode='fail'");
  await click('.ogs-sync-footer button','Sync');
  await wait(`document.querySelector('[aria-labelledby=ogs-sync-title] [role=alert]')?.textContent.includes('Could not save synced games')`);
  assert.equal(await evaluate(cdp,`[...document.querySelectorAll('[aria-labelledby=ogs-sync-title] [role=status]')].some(e=>e.textContent.includes('Added 1 game'))`),false);
  assert.equal(await evaluate(cdp,`document.querySelector('.notification-toast-message')?.title.startsWith('Synced')`),false);
  assert.deepEqual(await readStored(),baseline,'Rejected OGS save must preserve every stored record');
  await wait(`!document.querySelector('[data-library-importing=true]')`);
  await evaluate(cdp,"librarySaveAudit.mode='normal'");
  await click('.ogs-sync-footer button','Sync');
  await wait(`document.querySelector('[aria-labelledby=ogs-sync-title] [role=status]')?.textContent.includes('Added 1 game')`);
  await wait(`document.querySelector('.notification-toast-message')?.title.startsWith('Synced 1 OGS game')`);
  const firstId=await evaluate(cdp,'ogsSaveAudit.id');
  const firstStored=await readStored();
  assert.equal(firstStored.filter(item=>item.type==='file'&&item.name.includes(`(ogs-${firstId})`)).length,1,'Retry must save exactly one copy');
  assert.equal(firstStored.find(item=>item.type==='file'&&item.name.includes(`(ogs-${firstId})`)).sgf,sgf);
  await click('.ogs-sync-footer button','Done');
  await wait('!document.querySelector("#ogs-sync-username")&&!history.state?.webKatrainOverlay');

  // Renaming a synced game must not make the next sync download it again.
  const firstFile=firstStored.find(item=>item.type==='file'&&item.name.includes(`(ogs-${firstId})`));
  const renamed=`My annotated OGS study ${width}`;
  await click(`[data-library-row-id="${firstFile.id}"] .library-tree-node-more`);
  await click('[role=menu] button','Rename');
  await wait('!!document.querySelector("[aria-labelledby=library-text-dialog-title] input")');
  await click('[aria-labelledby=library-text-dialog-title] input');
  for(const type of ['keyDown','keyUp'])await cdp.send('Input.dispatchKeyEvent',{type,key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers:2});
  await cdp.send('Input.insertText',{text:renamed});
  for(const type of ['keyDown','keyUp'])await cdp.send('Input.dispatchKeyEvent',{type,key:'Enter',code:'Enter',windowsVirtualKeyCode:13,...(type==='keyDown'?{text:'\r'}:{})});
  await wait('!document.querySelector("[aria-labelledby=library-text-dialog-title]")&&!history.state?.webKatrainOverlay');
  await wait(`${storedItems}.then(items=>items.find(item=>item.id===${JSON.stringify(firstFile.id)})?.name===${JSON.stringify(renamed)})`);
  const beforeResync=await readStored(),requestsBefore=await evaluate(cdp,'ogsSaveAudit.requests.length');
  await open();await click('.ogs-sync-footer button','Sync');
  await wait(`document.querySelector('.ogs-sync-footer')?.textContent.includes('Sync Again')`);
  const renamedSummary=await evaluate(cdp,"document.querySelector('[aria-labelledby=ogs-sync-title] [role=status]')?.textContent");
  const afterResync=await readStored(),requestCount=await evaluate(cdp,'ogsSaveAudit.requests.length');
  console.log('Sync after rename',JSON.stringify({width,summary:renamedSummary,beforeItems:beforeResync.length,afterItems:afterResync.length,requests:requestCount-requestsBefore}));
  assert.ok(renamedSummary.includes('already in your library'),'A renamed game must remain already synced');
  assert.deepEqual(afterResync,beforeResync,'Resync must preserve the renamed study without a duplicate');
  assert.equal(afterResync.find(item=>item.id===firstFile.id).ogsGameId,firstId);
  assert.equal(requestCount-requestsBefore,2,'Already synced games must skip the SGF download');
  await click('.ogs-sync-footer button','Done');
  await wait('!document.querySelector("#ogs-sync-username")&&!history.state?.webKatrainOverlay');

  await click('[data-library-search]');await cdp.send('Input.insertText',{text:`ogs-${firstId}`});
  await wait(`!!document.querySelector('[data-library-row-id="${firstFile.id}"]')&&!!document.querySelector('.library-search-clear')`);
  assert.equal(await evaluate(cdp,`document.querySelector('[data-library-row-id="${firstFile.id}"]').dataset.libraryRowName`),renamed);
  await click('.library-search-clear');
  await wait(`document.querySelector('[data-library-search]').value===''`);

  // Keep external navigation intercepted while exercising real menu input.
  await evaluate(cdp,`(()=>{
   window.ogsSourceClicks=[];window.ogsSourceKeys=[];
   document.addEventListener('click',event=>{
    const link=event.target instanceof Element?event.target.closest('[data-library-ogs-source]'):null;
    if(!link)return;event.preventDefault();
    ogsSourceClicks.push({href:link.href,target:link.target,rel:link.rel,isTrusted:event.isTrusted});
   },true);
   document.addEventListener('keydown',event=>{
    if(event.target instanceof Element&&event.target.matches('[data-library-ogs-source]'))ogsSourceKeys.push({key:event.key,isTrusted:event.isTrusted});
   },true);return true;
  })()`);
  const sourceBoard=await evaluate(cdp,`({...document.querySelector('[data-board-snapshot]').dataset})`);
  const sourceLocation=await evaluate(cdp,'location.href');
  const sourceMore=`[data-library-row-id="${firstFile.id}"] .library-tree-node-more`;
  const sourceKey=async(key,code,windowsVirtualKeyCode)=>{
   for(const type of ['keyDown','keyUp'])await cdp.send('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode,...(type==='keyDown'&&key==='Enter'?{text:String.fromCharCode(13)}:{})});
  };
  for(const activation of ['pointer','Enter','Space']){
   await click(sourceMore);await wait(`!!document.querySelector('[data-library-ogs-source]')`);
   const link=await evaluate(cdp,`(()=>{const e=document.querySelector('[data-library-ogs-source]');return{href:e.href,target:e.target,rel:[...e.relList],label:e.textContent}})()`);
   assert.equal(link.href,`https://online-go.com/game/${firstId}`);assert.equal(link.target,'_blank');
   assert.ok(link.rel.includes('noopener')&&link.rel.includes('noreferrer'));assert.ok(link.label.includes('opens in a new tab'));
   if(activation==='pointer')await click('[data-library-ogs-source]');
   else{
    const index=await evaluate(cdp,`[...document.querySelectorAll('[role=menu] [role=menuitem]')].findIndex(e=>e.matches('[data-library-ogs-source]'))`);
    await sourceKey('Home','Home',36);
    for(let i=0;i<index;i++)await sourceKey('ArrowDown','ArrowDown',40);
    await wait(`document.activeElement?.matches('[data-library-ogs-source]')`);
    await sourceKey('ArrowUp','ArrowUp',38);
    assert.equal(await evaluate(cdp,'document.activeElement?.textContent.trim()'),'Download SGF');
    await sourceKey('ArrowDown','ArrowDown',40);
    await sourceKey(activation==='Space'?' ':'Enter',activation==='Space'?'Space':'Enter',activation==='Space'?32:13);
   }
   await wait(`!document.querySelector('[role=menu]')&&document.activeElement===document.querySelector(${JSON.stringify(sourceMore)})`);
  }
  const activations=await evaluate(cdp,'ogsSourceClicks');assert.equal(activations.length,3);
  assert.equal(activations[0].isTrusted,true);assert.equal(activations[1].isTrusted,true);
  assert.ok(await evaluate(cdp,`ogsSourceKeys.some(event=>event.key===' '&&event.isTrusted)`));
  assert.deepEqual(await evaluate(cdp,`({...document.querySelector('[data-board-snapshot]').dataset})`),sourceBoard);
  assert.equal(await evaluate(cdp,'location.href'),sourceLocation);
  const ordinary=baseline.find(item=>item.type==='file'&&!item.ogsGameId&&!/\(ogs-\d+\)/.test(item.name));
  for(const id of [ordinary.id,firstFile.parentId]){
   await click(`[data-library-row-id="${id}"] .library-tree-node-more`);
   await wait(`!!document.querySelector('[role=menu]')`);
   assert.equal(await evaluate(cdp,`!!document.querySelector('[data-library-ogs-source]')`),false);
   await sourceKey('Escape','Escape',27);await wait(`!document.querySelector('[role=menu]')`);
  }
  // Download succeeds, but its storage read is held while both panels close.
  await evaluate(cdp,'ogsSaveAudit.id++;void 0');await open();
  await evaluate(cdp,"librarySaveAudit.mode='delay'");await click('.ogs-sync-footer button','Sync');
  await wait('librarySaveAudit.held.length>0');
  await wait(`document.querySelector('[aria-labelledby=ogs-sync-title] [role=status]')?.textContent.includes('Saving games to library')`);
  assert.equal(await evaluate(cdp,`document.querySelector('.ogs-sync-footer')?.textContent.includes('Sync Again')`),false);
  if(mobile)await evaluate(cdp,'history.back()');else await click('.ogs-sync-footer button','Close');
  await wait('!document.querySelector("#ogs-sync-username")&&!history.state?.webKatrainOverlay');
  if(mobile)await click('[aria-label="Back to board"]');else await click('button[title="Hide library"]');
  await wait('!document.querySelector("[data-library-storage-badge]")');
  if(mobile)await click('#mobile-tab-library');else await click('button[title="Show library"]');
  await wait(`document.querySelector('[data-library-importing=true]')?.textContent.includes('Importing 1 item')`);
  await evaluate(cdp,"librarySaveAudit.mode='normal';librarySaveAudit.held.splice(0).forEach(release=>release())");
  await wait(`document.querySelector('[data-library-storage-badge]')?.textContent==='IndexedDB'&&!document.querySelector('[data-library-importing=true]')`);
  const secondId=firstId+1;
  await wait(`!![...document.querySelectorAll('[data-library-row]')].find(e=>e.dataset.libraryRowName?.includes('(ogs-${secondId})'))`);
  const saved=await readStored();
  assert.equal(saved.filter(item=>item.type==='folder'&&item.name==='OGS - Alice').length,1,'Completed syncs reuse the current destination');
  assert.equal(saved.filter(item=>item.type==='file'&&item.name.includes(`(ogs-${secondId})`)).length,1);
  for(const original of baseline)assert.deepEqual(saved.find(item=>item.id===original.id),original);
  // Another import arrives after the download's initial existing-ID check.
  await evaluate(cdp,'ogsSaveAudit.id++;ogsSaveAudit.holdNext=true;void 0');
  await open();await click('.ogs-sync-footer button','Sync');
  await wait('!!window.releaseConcurrentOgsDownload');
  const thirdId=secondId+1;
  const annotatedSgf='(;GM[1]SZ[9]C[Preserve other tab notes];B[ee])';
  const arrived=await evaluate(cdp,`(async()=>{
   const url=${loadedModuleUrl.toString()},lib=await import(url('/src/utils/library.ts'));
   return lib.updateStoredLibrary(current=>{
    const existing=current.find(item=>item.type==='folder'&&item.parentId===null&&item.name==='Other tab studies');
    const folder=existing??lib.createLibraryFolder('Other tab studies');
    const file={...lib.createLibraryItem('Annotated game (ogs-${thirdId})',${JSON.stringify(annotatedSgf)},folder.id),favorite:true,tags:['review']};
    return {items:[file,...(existing?current:[folder,...current])],result:file};
   });
  })()`);
  await evaluate(cdp,'releaseConcurrentOgsDownload();delete window.releaseConcurrentOgsDownload');
  await wait(`document.querySelector('[aria-labelledby=ogs-sync-title] [role=status]')?.textContent.includes('already in your library')`);
  assert.equal(await evaluate(cdp,`document.querySelector('[aria-labelledby=ogs-sync-title] [role=status]')?.textContent.includes('Added')`),false);
  const afterRace=await readStored();
  const copies=afterRace.filter(item=>item.type==='file'&&item.name.includes(`(ogs-${thirdId})`));
  assert.deepEqual(copies,[arrived],'A completed sync must keep the game and annotations that arrived in another folder');
  await click('.ogs-sync-footer button','Done');
  await wait('!document.querySelector("#ogs-sync-username")&&!history.state?.webKatrainOverlay');
  if(await evaluate(cdp,`document.querySelector('[data-library-row-name="Other tab studies"]')?.getAttribute('aria-expanded')!=='true'`))await click('[data-library-row-name="Other tab studies"] .library-tree-node-arrow');
  await wait(`!!document.querySelector('[data-library-row-id="${arrived.id}"]')&&localStorage.getItem('web-katrain:library_folders_expanded:v1')?.includes(${JSON.stringify(arrived.parentId)})`);
  await navigate(cdp,appUrl,15000);await wait('!!document.querySelector("[data-board-snapshot]")');if(mobile)await click('#mobile-tab-library');
  await wait(`!![...document.querySelectorAll('[data-library-row]')].find(e=>e.dataset.libraryRowName?.includes('(ogs-${secondId})'))`);
  await wait(`!!document.querySelector('[data-library-row-id="${arrived.id}"]')`);
  reports.push({width,sourceLinkPreservedAfterRename:true,sourceLinkPointerEnterSpace:true,sourceLinkNewTabProtected:true,sourceLinkHiddenForOrdinaryFilesAndFolders:true,renamePreservesIdentity:true,renamedGameSkipsRedownload:true,rejectedWriteHasNoSuccess:true,resolvedSaveErrorReplaced:true,retrySavesOneCopy:true,originalSgfPreserved:true,savingStatusVisible:true,closeAndReopenDuringSave:true,currentFolderReused:true,duplicateOgsIdSkippedAtCommit:true,otherFolderAnnotationsPreserved:true,skippedCountAccurate:true,reloadPreserved:true});
 }
 fs.writeFileSync(path.join(screenshotDir,'ogs-sync-save.json'),JSON.stringify(reports,null,2));
 console.log('OGS sync storage: desktop/phone reject false success, retry once, survive closing both panels, skip games arriving during download and preserve annotations across reload.');
}
