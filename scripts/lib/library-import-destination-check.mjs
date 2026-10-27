import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {evaluate,loadedModuleUrl,navigate,setViewport,waitForExpression} from './browser.mjs';
export async function assertLibraryImportDestination(cdp,appUrl,runDir,screenshotDir) {
 const gamePath=path.join(runDir,'slow-study.sgf');fs.writeFileSync(gamePath,'(;GM[1]SZ[9]GN[Slow study];B[dd];W[ee])');
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
  await click('[aria-label="More actions for Import destination"]');await wait(`document.querySelector('[role=menu]')?.contains(document.activeElement)`);
  await click('[role=menu] button','Delete');await wait('!!document.querySelector("[aria-labelledby=library-confirm-dialog-title]")');
  await click('[aria-labelledby=library-confirm-dialog-title] button.danger');
  await wait(`!document.querySelector('[data-library-row-name="Import destination"]')&&!document.querySelector('[role=dialog]')&&!history.state?.webKatrainOverlay&&document.querySelector('[data-library-storage-badge]')?.textContent==='IndexedDB'`);
  await evaluate(cdp,'releaseHeldImport();delete window.releaseHeldImport');
  await wait('document.querySelector(".notification-toast-message")?.title.includes("Imported")&&document.querySelector("[data-library-storage-badge]")?.textContent==="IndexedDB"');
  const items=await evaluate(cdp,'importDestinationLibrary.loadLibrary()');
  const imported=items.find(item=>item.type==='file'&&item.sgf.includes('GN[Slow study]'));
  assert.ok(imported,'The completed import must be stored');
  assert.equal(imported.parentId,null,'A deleted destination must fall back to Root');
  assert.equal(imported.name,'slow-study 2','Root name collisions must be reserved at completion');
  assert.equal(items.find(item=>item.id==='root-name').sgf,'(;GM[1]SZ[13]GN[Existing root game])');
  await wait(`!!document.querySelector('[data-library-row-name="slow-study 2"]')`);
  await navigate(cdp,appUrl,15000,{acceptBeforeUnload:true});await wait('!!document.querySelector("[data-board-snapshot]")');if(width===390)await click('#mobile-tab-library');
  await wait(`document.querySelector('[data-library-storage-badge]')?.textContent==='IndexedDB'&&!!document.querySelector('[data-library-row-name="slow-study 2"]')`);
  reports.push({width,deletedDestinationFallsBackToRoot:true,completedImportVisible:true,existingRootGamePreserved:true,nameCollisionResolved:true,reloadPreserved:true});
 }
 fs.writeFileSync(path.join(screenshotDir,'library-import-destination.json'),JSON.stringify(reports,null,2));
 console.log('Library import destination: desktop/phone delayed reads survive destination deletion at Root, reserve colliding names, preserve the existing game and remain visible after reload.');
}
