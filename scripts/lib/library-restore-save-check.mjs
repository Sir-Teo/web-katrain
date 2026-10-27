import assert from 'node:assert/strict';
import fs from 'node:fs';
import {evaluate,navigate,setViewport,waitForExpression} from './browser.mjs';
import {installStorageControls} from './library-save-check.mjs';

// A completed full-library replacement must not erase a later game's save
// acknowledgement or briefly replace its optimistic row with the older snapshot.
export async function assertLibraryRestoreSave(cdp,appUrl,screenshotDir) {
 const dir=screenshotDir,url=appUrl;
const wait=e=>waitForExpression(cdp,e,{label:'Library restore / current-game save overlap',diagnose:"({width:innerWidth,dialog:document.querySelector('[role=dialog]')?.innerText,focus:document.activeElement?.outerHTML.slice(0,300),held:window.librarySaveAudit?.held.length,status:document.querySelector('[data-library-storage-badge]')?.textContent})"});
let mobile=false;
const key=async(key,code,number,modifiers=0)=>{for(const type of ['keyDown','keyUp'])await cdp.send('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode:number,modifiers,...(key==='Enter'&&type==='keyDown'?{text:'\r'}:{})})};
const click=async selector=>{const p=await wait(`(async()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)return false;e.scrollIntoView({block:'nearest',behavior:'instant'});const before=e.getBoundingClientRect();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const r=e.getBoundingClientRect();if(Math.abs(r.x-before.x)>0.5||Math.abs(r.y-before.y)>0.5)return false;const x=r.x+r.width/2,y=r.y+r.height/2;return r.width&&e.contains(document.elementFromPoint(x,y))?{x,y}:false})()`);if(mobile){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})}else for(const type of ['mousePressed','mouseReleased'])await cdp.send('Input.dispatchMouseEvent',{type,...p,button:'left',clickCount:1})};
const game=()=>evaluate(cdp,"(()=>{const d=document.querySelector('[data-board-snapshot]').dataset;return{size:d.boardSize,stones:d.boardStones,moves:d.boardMoveCount,player:d.boardCurrentPlayer}})()");
const shot=async name=>{const r=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(`${dir}/library-restore-save-${name}.png`,Buffer.from(r.result.data,'base64'))};


fs.writeFileSync(`${dir}/library-restore-save-backup.json`,JSON.stringify({app:'web-katrain',version:2,items:[{id:'restored-study',type:'file',name:'Restored study',parentId:null,createdAt:1,updatedAt:1,sgf:'(;GM[1]SZ[9]C[Backup fixture])'}]}));
const stored=`new Promise((resolve,reject)=>{const o=librarySaveAudit.open('web-katrain-library');o.onerror=()=>reject(o.error);o.onsuccess=()=>{const db=o.result,r=db.transaction('items','readonly').objectStore('items').getAll();r.onsuccess=()=>{db.close();resolve(r.result)};r.onerror=()=>{db.close();reject(r.error)}}})`;
const reports=[];await cdp.send('Emulation.setFocusEmulationEnabled',{enabled:true});await cdp.send('Browser.grantPermissions',{origin:new URL(url).origin,permissions:['clipboardReadWrite','clipboardSanitizedWrite']});
try{for(const[width,height]of[[1440,900],[390,844],[320,568]]){
 mobile=width<1000;
 const setup=await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:"localStorage.removeItem('web-katrain:auto_saved_game:v1');localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');localStorage.setItem('web-katrain:library_open:v1','true');localStorage.setItem('web-katrain:settings:v3',JSON.stringify({soundEnabled:false,loadSgfFastAnalysis:false,timerMainTimeMinutes:0,timerByoPeriods:0}));"});
 try{await setViewport(cdp,{width,height,mobile});await navigate(cdp,url,15000,{acceptBeforeUnload:true});}finally{await cdp.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:setup.result.identifier});}
 await wait('!!document.querySelector("[data-board-snapshot]")');
 if(mobile)await click('#mobile-tab-library');
 await wait('document.querySelector("[data-library-storage-badge]")?.textContent==="IndexedDB"');
 // Seed one prior record outside the operation under test, then remount the UI.
 // This keeps the confirmation precondition independent of earlier helpers.
 await evaluate(cdp,`new Promise((resolve,reject)=>{const o=indexedDB.open('web-katrain-library');o.onerror=()=>reject(o.error);o.onsuccess=()=>{const db=o.result,t=db.transaction('items','readwrite'),store=t.objectStore('items');store.clear();store.put({id:'before-restore',type:'file',name:'Before restore',parentId:null,createdAt:1,updatedAt:1,sgf:'(;GM[1]SZ[9]C[Prior fixture])'});t.oncomplete=()=>{db.close();localStorage.removeItem('web-katrain:library_current_folder:v1');resolve()};t.onerror=()=>{db.close();reject(t.error)}}})`);
 await navigate(cdp,url,15000,{acceptBeforeUnload:true});
 await wait('!!document.querySelector("[data-board-snapshot]")');
 if(mobile)await click('#mobile-tab-library');
 await wait('!!document.querySelector("[data-library-row-id=before-restore]")&&document.querySelector("[data-library-storage-badge]")?.textContent==="IndexedDB"');
 if(mobile)await click('#mobile-tab-board');
 await evaluate(cdp,"document.querySelector('[data-board-snapshot]').focus()");await key('ArrowRight','ArrowRight',39);await key('Enter','Enter',13);await wait('document.querySelector("[data-board-snapshot]").dataset.boardMoveCount==="1"');const before=await game();
 if(mobile)await click('#mobile-tab-library');await wait('document.querySelector("[data-library-storage-badge]")?.textContent==="IndexedDB"');
 const root=(await cdp.send('DOM.getDocument')).result.root.nodeId;
 const input=(await cdp.send('DOM.querySelector',{nodeId:root,selector:'input[type=file][accept=".json,application/json"]'})).result.nodeId;assert.ok(input);
 await cdp.send('DOM.setFileInputFiles',{nodeId:input,files:[`${dir}/library-restore-save-backup.json`]});await wait('document.querySelector("#library-confirm-dialog-title")?.textContent==="Restore Backup"');
 await evaluate(cdp,installStorageControls.replace("if(librarySaveAudit.mode==='delay'&&librarySaveAudit.skipDelayedOpens--<=0)","if(librarySaveAudit.mode==='delay'&&args[0]==='web-katrain-library'&&librarySaveAudit.skipDelayedOpens--<=0)"));await evaluate(cdp,"librarySaveAudit.mode='delay'");await click('[aria-labelledby=library-confirm-dialog-title] button.danger');await wait('librarySaveAudit.held.length>0&&!document.querySelector("[role=dialog]")');
 await click('[aria-label="Save current game to Library"]');await wait('!!document.querySelector("[aria-labelledby=library-text-dialog-title] input")');
 await click('[aria-labelledby=library-text-dialog-title] input');await key('a','KeyA',65,2);const name=`Saved during restore ${width}`;await cdp.send('Input.insertText',{text:name});await click('[aria-labelledby=library-text-dialog-title] button.active');await wait('!document.querySelector("[role=dialog]")&&!history.state?.webKatrainOverlay');
 await wait(`!!document.querySelector('[data-library-row-name="${name}"]')`);await evaluate(cdp,'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
 await evaluate(cdp,"window.restoreOverlapRows=[];const observer=new MutationObserver(()=>{const names=[...document.querySelectorAll('[data-library-row]')].map(e=>e.dataset.libraryRowName);if(JSON.stringify(names)!==JSON.stringify(restoreOverlapRows.at(-1)))restoreOverlapRows.push(names)});observer.observe(document.body,{childList:true,subtree:true});window.restoreOverlapObserver=observer;librarySaveAudit.mode='normal';librarySaveAudit.held.splice(0).forEach(release=>release())");
 const saved=await wait(`${stored}.then(items=>{const e=items.find(e=>e.name===${JSON.stringify(name)});return e&&items.some(e=>e.id==='restored-study')?e:false})`);await wait('document.querySelector("[data-library-storage-badge]")?.textContent==="IndexedDB"');await evaluate(cdp,'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');assert.ok(saved.sgf.includes(';B['));assert.deepEqual(await game(),before);
 const state=await evaluate(cdp,`({restoreTransitions:window.restoreOverlapRows,title:document.title,recovery:localStorage.getItem('web-katrain:auto_saved_game:v1'),toast:document.querySelector('.notification-toast-message')?.title,rows:[...document.querySelectorAll('[data-library-row]')].map(e=>e.dataset.libraryRowName)})`);

 await key('k','KeyK',75,2);await wait('!!document.querySelector("[data-command-palette-search]")');await cdp.send('Input.insertText',{text:'Copy SGF'});await click('[data-command-palette-item=copy-sgf]');await wait('document.querySelector(".notification-toast-message")?.title==="Copied SGF to clipboard."');
 const currentSgf=await evaluate(cdp,'navigator.clipboard.readText()');fs.writeFileSync(`${dir}/library-restore-save-${width}-stored.sgf`,saved.sgf);fs.writeFileSync(`${dir}/library-restore-save-${width}-current.sgf`,currentSgf);assert.equal(currentSgf,saved.sgf,'The saved record must still match the exact current game when checking its acknowledgement');
 await key('k','KeyK',75,2);await wait('!!document.querySelector("[data-command-palette-search]")');await cdp.send('Input.insertText',{text:'Quick new game'});await click('[data-command-palette-item=quick-new-game]');await evaluate(cdp,'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
 const prompt=await evaluate(cdp,'!!document.querySelector("[aria-labelledby=unsaved-changes-title]")');if(prompt){await key('Escape','Escape',27);await wait('!document.querySelector("[role=dialog]")&&!history.state?.webKatrainOverlay');}else await wait('document.querySelector("[data-board-snapshot]").dataset.boardMoveCount==="0"');
 reports.push({width,height,savedId:saved.id,state,unsavedPromptAfterSave:prompt});console.log('Restore overlap',JSON.stringify(reports.at(-1)));await shot(`${width}-after`);
 assert.ok(state.restoreTransitions.length,'Observe the restore acknowledgement before checking row preservation');
 assert.ok(state.restoreTransitions.every(rows=>rows.includes(name)),'The restored snapshot must not flash over a newer saved row');
 assert.equal(prompt,false,'A persisted current game must not remain unsaved after restoration completes');
 assert.ok(state.title.includes(name),'Save acknowledgement must retain its loaded file association');
}fs.writeFileSync(`${dir}/library-restore-save.json`,JSON.stringify(reports,null,2));}
catch(error){fs.writeFileSync(`${dir}/library-restore-save-failure.json`,JSON.stringify({error:error.stack,reports},null,2));await shot('failure').catch(()=>{});throw error;}
finally{await evaluate(cdp,"window.restoreOverlapObserver?.disconnect();if(window.librarySaveAudit){librarySaveAudit.mode='normal';librarySaveAudit.held.splice(0).forEach(release=>release())}").catch(()=>{});await cdp.send('Browser.resetPermissions');await cdp.send('Emulation.setFocusEmulationEnabled',{enabled:false});}
}
