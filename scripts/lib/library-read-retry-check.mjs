import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {evaluate,loadedModuleUrl,navigate,setViewport,waitForExpression} from './browser.mjs';
import {installStorageControls} from './library-save-check.mjs';
export async function assertLibraryReadRetry(cdp,appUrl,runDir,screenshotDir) {
 const reports=[];
 const click=async(selector,text)=>{
  const p=await waitForExpression(cdp,`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>${text?`e.textContent.trim().startsWith(${JSON.stringify(text)})`:'true'});if(!e||e.disabled)return false;e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return r.width&&e.contains(document.elementFromPoint(x,y))?{x,y}:false})()`);
  for(const type of ['mousePressed','mouseReleased'])await cdp.send('Input.dispatchMouseEvent',{type,...p,button:'left',clickCount:1});
 };
 for(const {width,empty,search,keepSearchFocus} of [
  {width:1440,empty:false,search:true,keepSearchFocus:false},
  {width:390,empty:false,search:true,keepSearchFocus:true},
  {width:390,empty:true,search:false,keepSearchFocus:false},
  {width:390,empty:true,search:true,keepSearchFocus:false},
 ]) {
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
  await waitForExpression(cdp,'!!document.querySelector("[data-board-snapshot]")');if(width===390)await click('#mobile-tab-library');
  await waitForExpression(cdp,'document.querySelector("[data-library-storage-badge]")?.textContent==="IndexedDB"');
  const sgf='(;GM[1]SZ[9]GN[Keep saved study]C[Original comments];B[dd];W[ee])';
  await evaluate(cdp,`(async()=>{const url=${loadedModuleUrl.toString()};const lib=await import(url('/src/utils/library.ts'));await lib.updateStoredLibrary(()=>({items:${empty?'[]':`[lib.createLibraryItem('Saved before outage',${JSON.stringify(sgf)})]`},result:null}))})()`);
  const failure=await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`
   ${installStorageControls};librarySaveAudit.mode='fail';
   localStorage.removeItem('web-katrain:library:v1');
   localStorage.removeItem('web-katrain:library_fallback_unflushed:v1');
  `});
  try{await navigate(cdp,appUrl,15000,{acceptBeforeUnload:true})}
  finally{await cdp.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:failure.result.identifier})}
  await waitForExpression(cdp,'!!document.querySelector("[data-board-snapshot]")');if(width===390)await click('#mobile-tab-library');
  await waitForExpression(cdp,'document.querySelector("[data-library-storage-badge]")?.textContent==="Error"');
  const error=await evaluate(cdp,"document.querySelector('.library-tree')?.innerText");
  assert.match(error,/Could not read the library/,'The fixture must reject the read before any snapshot is published');
  if(search){
   await click('[data-library-search]');await cdp.send('Input.insertText',{text:'Saved'});
   await waitForExpression(cdp,'!!document.querySelector(".library-search-clear")');
  }
  assert.equal(await evaluate(cdp,"[...document.querySelectorAll('button')].some(e=>e.textContent==='Retry loading library')"),true,'Search must not hide storage recovery');
  assert.match(await evaluate(cdp,"document.querySelector('.library-tree [role=alert]')?.textContent??''"),/Library storage error/);
  const failed=await evaluate(cdp,'librarySaveAudit.failed');
  await click('button','Retry loading library');
  await waitForExpression(cdp,`librarySaveAudit.failed>${failed}&&document.querySelector('[data-library-storage-badge]')?.textContent==='Error'`);
  await waitForExpression(cdp,"document.activeElement?.matches('[data-library-retry]')");
  assert.equal(await evaluate(cdp,"localStorage.getItem('web-katrain:library:v1')"),null,'A rejected read must not save an invented empty snapshot');
  await evaluate(cdp,"librarySaveAudit.mode='delay'");
  for(const type of ['keyDown','keyUp'])await cdp.send('Input.dispatchKeyEvent',{type,key:'Enter',code:'Enter',windowsVirtualKeyCode:13,...(type==='keyDown'?{text:'\r'}:{})});
  await waitForExpression(cdp,'librarySaveAudit.held.length>0');
  await waitForExpression(cdp,`document.querySelector('.library-tree')?.textContent.includes('Loading library')&&document.querySelector('.library-tree')?.getAttribute('aria-busy')==='true'`);
  if(keepSearchFocus)await click('[data-library-search]');
  await evaluate(cdp,"librarySaveAudit.mode='normal';librarySaveAudit.held.splice(0).forEach(release=>release())");
  await waitForExpression(cdp,'document.querySelector("[data-library-storage-badge]")?.textContent==="IndexedDB"',{timeoutMs:5000,label:'Retry initial Library read'});
  await waitForExpression(cdp,empty?`document.querySelector('.library-tree')?.textContent.includes('${search?'No matches':'Library is empty'}')`:`!!document.querySelector('[data-library-row-name="Saved before outage"]')`);
  const expectedFocus=keepSearchFocus?'[data-library-search]':!empty?'[data-library-row]':search?'[data-library-reset-filters]':'[data-library-empty-import]';
  await waitForExpression(cdp,`document.activeElement?.matches(${JSON.stringify(expectedFocus)})`);
  assert.equal(await evaluate(cdp,"document.querySelector('[data-library-search]').value"),search?'Saved':'');
  const stored=await evaluate(cdp,`new Promise((resolve,reject)=>{const r=librarySaveAudit.open('web-katrain-library');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,q=db.transaction('items','readonly').objectStore('items').getAll();q.onerror=()=>reject(q.error);q.onsuccess=()=>{db.close();resolve(q.result)}}})`);
  assert.equal(stored.length,empty?0:1);if(!empty)assert.equal(stored[0].sgf,sgf);
  reports.push({width,empty,search,keepSearchFocus,genuineReadFailure:true,repeatedFailureRetriesRead:true,keyboardRetryWorks:true,errorAndLoadingVisibleDuringSearch:true,focusRestoredOrPreserved:true,retryLoadsStoredGames:true,originalSgfPreserved:true});
 }
 fs.writeFileSync(path.join(screenshotDir,'library-read-retry.json'),JSON.stringify(reports,null,2));
 console.log('Library initial-read Retry: desktop/phone preserve error/loading during search, keyboard retry and focus, original SGF and empty Library.');
}
