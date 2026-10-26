import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {evaluate,navigate,setViewport,waitForExpression} from './browser.mjs';
export async function assertLibraryRepeatImport(cdp,appUrl,runDir,screenshotDir) {
 const first=path.join(runDir,'repeat-import.sgf'),second=path.join(runDir,'repeat-other.sgf');
 fs.writeFileSync(first,'(;GM[1]SZ[9]GN[Repeated import];B[dd])');fs.writeFileSync(second,'(;GM[1]SZ[13]GN[Other import];B[ee])');
 const empty=path.join(runDir,'repeat-empty-library.json');fs.writeFileSync(empty,JSON.stringify({app:'web-katrain',version:2,items:[]}));
 const wait=expression=>waitForExpression(cdp,expression,{label:'Repeat Library file import',diagnose:`({changes:window.libraryRepeatChanges,input:document.querySelector('input[type=file][multiple]')?.value,held:!!window.releaseRepeatedRead,toast:document.querySelector('.notification-toast-message')?.title,rows:[...document.querySelectorAll('[data-library-row]')].map(e=>e.dataset.libraryRowName)})`});
 const click=async selector=>{
  const p=await wait(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)return false;e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return r.width&&e.contains(document.elementFromPoint(x,y))?{x,y}:false})()`);
  for(const type of ['mousePressed','mouseReleased'])await cdp.send('Input.dispatchMouseEvent',{type,...p,button:'left',clickCount:1});
 };
 const reports=[];
 for(const width of [1440,390]) {
  const setup=await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`
   localStorage.removeItem('web-katrain:auto_saved_game:v1');
   localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');
   localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
   localStorage.setItem('web-katrain:library_open:v1','true');
   localStorage.setItem('web-katrain:settings:v3',JSON.stringify({soundEnabled:false,loadSgfFastAnalysis:false}));
  `});
  try{await setViewport(cdp,{width,height:width===390?844:900,mobile:width===390});await navigate(cdp,appUrl,15000,{acceptBeforeUnload:true})}
  finally{await cdp.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:setup.result.identifier})}
  await wait('!!document.querySelector("[data-board-snapshot]")');if(width===390)await click('#mobile-tab-library');
  await wait('document.querySelector("[data-library-storage-badge]")?.textContent==="IndexedDB"');
  const root=(await cdp.send('DOM.getDocument')).result.root;
  const backup=(await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector:'input[type=file][accept=".json,application/json"]'})).result.nodeId;
  await cdp.send('DOM.setFileInputFiles',{nodeId:backup,files:[empty]});
  await wait('!!document.querySelector("[aria-labelledby=library-confirm-dialog-title]")');await click('[aria-labelledby=library-confirm-dialog-title] button.danger');
  await wait(`!document.querySelector('[role=dialog]')&&!history.state?.webKatrainOverlay&&document.querySelectorAll('[data-library-row]').length===0&&document.querySelector('[data-library-storage-badge]')?.textContent==='IndexedDB'`);
  const input=(await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector:'input[type=file][multiple]'})).result.nodeId;
  await evaluate(cdp,`(()=>{
   window.libraryRepeatChanges=0;document.querySelector('input[type=file][multiple]').addEventListener('change',()=>libraryRepeatChanges++);
   const read=File.prototype.arrayBuffer;
   File.prototype.arrayBuffer=async function(){if(window.holdRepeatedRead&&this.name==='repeat-import.sgf')await new Promise(resolve=>window.releaseRepeatedRead=resolve);return read.call(this)};
  })()`);
  // The same path is selected twice, through Chrome's file-input implementation.
  await cdp.send('DOM.setFileInputFiles',{nodeId:input,files:[first]});
  await wait(`document.querySelector('[data-library-storage-badge]')?.textContent==='IndexedDB'&&!!document.querySelector('[data-library-row-name="repeat-import"]')`);
  await cdp.send('DOM.setFileInputFiles',{nodeId:input,files:[first]});
  await evaluate(cdp,'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  assert.equal(await evaluate(cdp,'libraryRepeatChanges'),2,'Choosing the same file again must emit a fresh change');
  await wait(`document.querySelector('[data-library-storage-badge]')?.textContent==='IndexedDB'&&!!document.querySelector('[data-library-row-name="repeat-import 2"]')`);
  assert.equal(await evaluate(cdp,`document.querySelector('input[type=file][multiple]').value`),'','The chooser must reset after capturing its files');
  await evaluate(cdp,'window.holdRepeatedRead=true');
  await cdp.send('DOM.setFileInputFiles',{nodeId:input,files:[first,second]});
  await wait('!!window.releaseRepeatedRead');
  assert.equal(await evaluate(cdp,`document.querySelector('input[type=file][multiple]').files.length`),0,'The input must reset while the selected batch is still being read');
  await evaluate(cdp,'holdRepeatedRead=false;releaseRepeatedRead();delete window.releaseRepeatedRead');
  await wait(`document.querySelector('[data-library-storage-badge]')?.textContent==='IndexedDB'&&!!document.querySelector('[data-library-row-name="repeat-import 3"]')&&!!document.querySelector('[data-library-row-name="repeat-other"]')`);
  await navigate(cdp,appUrl,15000,{acceptBeforeUnload:true});await wait('!!document.querySelector("[data-board-snapshot]")');if(width===390)await click('#mobile-tab-library');
  await wait(`document.querySelector('[data-library-storage-badge]')?.textContent==='IndexedDB'&&!!document.querySelector('[data-library-row-name="repeat-import 3"]')&&!!document.querySelector('[data-library-row-name="repeat-other"]')`);
  reports.push({width,samePathEmitsNewChange:true,inputClearedBeforeReadingFinishes:true,multiFileSnapshotRetained:true,uniqueNamesAndReloadPreserved:true});
 }
 fs.writeFileSync(path.join(screenshotDir,'library-repeat-import.json'),JSON.stringify(reports,null,2));
 console.log('Repeat Library import: desktop/phone accept the same file again, clear the chooser during a held read, retain every selected file and preserve unique names after reload.');
}
