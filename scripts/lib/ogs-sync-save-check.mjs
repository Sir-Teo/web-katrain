import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {evaluate,loadedModuleUrl,navigate,setViewport,waitForExpression} from './browser.mjs';
import {installStorageControls} from './library-save-check.mjs';

/** Exercise completed downloads against real failed and delayed browser storage. */
export async function assertOgsSyncSave(cdp,appUrl,screenshotDir) {
 const reports=[];
 const wait=expression=>waitForExpression(cdp,expression,{label:'OGS durable save',diagnose:`({held:librarySaveAudit?.held.length,mode:librarySaveAudit?.mode,dialog:document.querySelector('[aria-labelledby=ogs-sync-title]')?.textContent,toast:document.querySelector('.notification-toast-message')?.title,storage:document.querySelector('[data-library-storage-badge]')?.textContent})`});
 const click=async(selector,text)=>{
  const p=await wait(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>${text?`e.textContent.trim()===${JSON.stringify(text)}`:'true'});if(!e||e.disabled)return false;e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return r.width&&e.contains(document.elementFromPoint(x,y))?{x,y}:false})()`);
  for(const type of ['mousePressed','mouseReleased'])await cdp.send('Input.dispatchMouseEvent',{type,...p,button:'left',clickCount:1});
 };
 const readStored=()=>evaluate(cdp,`new Promise((resolve,reject)=>{const r=librarySaveAudit.open('web-katrain-library');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,q=db.transaction('items','readonly').objectStore('items').getAll();q.onerror=()=>reject(q.error);q.onsuccess=()=>{db.close();resolve(q.result)}}})`);
 const open=async()=>{
  await click('[aria-label="More library actions"]');await click('[role=menuitem]','Sync from OGS');
  await wait('!!document.querySelector("#ogs-sync-username")');
  await click('#ogs-sync-username');
  for(const type of ['keyDown','keyUp'])await cdp.send('Input.dispatchKeyEvent',{type,key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers:2});
  await cdp.send('Input.insertText',{text:'Alice'});
 };
 for(const width of [1440,390]) {
  const setup=await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`
   performance.setResourceTimingBufferSize(5000);
   localStorage.removeItem('web-katrain:auto_saved_game:v1');
   localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');
   localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
   localStorage.setItem('web-katrain:library_open:v1','true');
   localStorage.setItem('web-katrain:settings:v3',JSON.stringify({soundEnabled:false,loadSgfFastAnalysis:false,timerByoPeriods:0,timerMainTimeMinutes:0}));
  `});
  try{await setViewport(cdp,{width,height:width===390?844:900,mobile:width===390});await navigate(cdp,appUrl,15000,{acceptBeforeUnload:true})}
  finally{await cdp.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:setup.result.identifier})}
  await wait('!!document.querySelector("[data-board-snapshot]")');if(width===390)await click('#mobile-tab-library');
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
  const firstId=await evaluate(cdp,'ogsSaveAudit.id');
  const firstStored=await readStored();
  assert.equal(firstStored.filter(item=>item.type==='file'&&item.name.includes(`(ogs-${firstId})`)).length,1,'Retry must save exactly one copy');
  assert.equal(firstStored.find(item=>item.type==='file'&&item.name.includes(`(ogs-${firstId})`)).sgf,sgf);
  await click('.ogs-sync-footer button','Done');
  await wait('!document.querySelector("#ogs-sync-username")&&!history.state?.webKatrainOverlay');
  // Download succeeds, but its storage read is held while both panels close.
  await evaluate(cdp,'ogsSaveAudit.id++;void 0');await open();
  await evaluate(cdp,"librarySaveAudit.mode='delay'");await click('.ogs-sync-footer button','Sync');
  await wait('librarySaveAudit.held.length>0');
  await wait(`document.querySelector('[aria-labelledby=ogs-sync-title] [role=status]')?.textContent.includes('Saving games to library')`);
  assert.equal(await evaluate(cdp,`document.querySelector('.ogs-sync-footer')?.textContent.includes('Sync Again')`),false);
  if(width===390)await evaluate(cdp,'history.back()');else await click('.ogs-sync-footer button','Close');
  await wait('!document.querySelector("#ogs-sync-username")&&!history.state?.webKatrainOverlay');
  if(width===390)await click('[aria-label="Back to board"]');else await click('button[title="Hide library"]');
  await wait('!document.querySelector("[data-library-storage-badge]")');
  if(width===390)await click('#mobile-tab-library');else await click('button[title="Show library"]');
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
  await navigate(cdp,appUrl,15000);await wait('!!document.querySelector("[data-board-snapshot]")');if(width===390)await click('#mobile-tab-library');
  await wait(`!![...document.querySelectorAll('[data-library-row]')].find(e=>e.dataset.libraryRowName?.includes('(ogs-${secondId})'))`);
  await wait(`!!document.querySelector('[data-library-row-id="${arrived.id}"]')`);
  reports.push({width,rejectedWriteHasNoSuccess:true,retrySavesOneCopy:true,originalSgfPreserved:true,savingStatusVisible:true,closeAndReopenDuringSave:true,currentFolderReused:true,duplicateOgsIdSkippedAtCommit:true,otherFolderAnnotationsPreserved:true,skippedCountAccurate:true,reloadPreserved:true});
 }
 fs.writeFileSync(path.join(screenshotDir,'ogs-sync-save.json'),JSON.stringify(reports,null,2));
 console.log('OGS sync storage: desktop/phone reject false success, retry once, survive closing both panels, skip games arriving during download and preserve annotations across reload.');
}
