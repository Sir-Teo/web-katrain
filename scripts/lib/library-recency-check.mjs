import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evaluate, navigate, setViewport, waitForExpression } from './browser.mjs';

export async function assertLibraryRecency(cdp, appUrl, runDir, screenshotDir) {
  const names=['Newest round','1. Round opening','2. Round middle','10. Round final'];
  const fixture=path.join(runDir,'library-recency.json');
  fs.writeFileSync(fixture,JSON.stringify({app:'web-katrain',version:2,items:[
    {id:'n-newest',name:names[0],updatedAt:2000,moves:0},
    {id:'z-opening',name:names[1],updatedAt:1000,moves:1},
    {id:'m-middle',name:names[2],updatedAt:1000,moves:2},
    {id:'a-final',name:names[3],updatedAt:1000,moves:3},
  ].map(({moves,...item})=>({...item,type:'file',parentId:null,createdAt:1000,
    sgf:`(;GM[1]SZ[9]${Array.from({length:moves},(_,i)=>`;${i%2?'W':'B'}[]`).join('')})`}))}));
  const wait=expression=>waitForExpression(cdp,expression,{label:'Stable Library recent sorting'});
  const click=async selector=>{
    const point=await wait(`(()=>{
      const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)return false;
      e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
      return r.width&&e.contains(document.elementFromPoint(x,y))?{x,y}:false;
    })()`);
    for(const type of ['mousePressed','mouseReleased'])await cdp.send('Input.dispatchMouseEvent',{type,...point,button:'left',clickCount:1});
  };
  const rows=()=>evaluate(cdp,`[...document.querySelectorAll('[data-library-row=file]')].map(e=>e.dataset.libraryRowName)`);
  const reports=[];
  for(const width of [1440,390]) {
    const setup=await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`
      localStorage.removeItem('web-katrain:auto_saved_game:v1');
      localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');
      localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
      localStorage.setItem('web-katrain:library_open:v1','true');
      localStorage.setItem('web-katrain:library_sort:v1','recent');
      localStorage.setItem('web-katrain:settings:v3',JSON.stringify({soundEnabled:false,loadSgfFastAnalysis:false}));
    `});
    try {
      await setViewport(cdp,{width,height:width===390?844:900,mobile:width===390});
      await navigate(cdp,appUrl,15000,{acceptBeforeUnload:true});
    } finally {await cdp.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:setup.result.identifier});}
    await wait('!!document.querySelector("[data-board-snapshot]")');
    if(width===390)await click('#mobile-tab-library');
    await wait('document.querySelector("[data-library-storage-badge]")?.textContent==="IndexedDB"');
    const documentRoot=(await cdp.send('DOM.getDocument')).result.root;
    const input=(await cdp.send('DOM.querySelector',{nodeId:documentRoot.nodeId,selector:'input[type=file][accept=".json,application/json"]'})).result.nodeId;
    await cdp.send('DOM.setFileInputFiles',{nodeId:input,files:[fixture]});
    await wait('!!document.querySelector("[aria-labelledby=library-confirm-dialog-title]")');
    await click('[aria-labelledby=library-confirm-dialog-title] button.danger');
    await wait('document.querySelector("[data-library-storage-badge]")?.textContent==="IndexedDB"&&document.querySelectorAll("[data-library-row=file]").length===4');
    assert.deepEqual(await rows(),names,'Recent must sort newer edits first and number equal-time games naturally');
    await wait('!document.querySelector("[aria-labelledby=library-confirm-dialog-title]")&&!history.state?.webKatrainOverlay');
    await navigate(cdp,appUrl,15000,{acceptBeforeUnload:true});
    await wait('!!document.querySelector("[data-board-snapshot]")');
    if(width===390)await click('#mobile-tab-library');
    await wait('document.querySelector("[data-library-storage-badge]")?.textContent==="IndexedDB"&&document.querySelectorAll("[data-library-row=file]").length===4');
    assert.deepEqual(await rows(),names,'Database key order must not reorder same-time games after reload');
    await click('[aria-label="Search library"]');await cdp.send('Input.insertText',{text:'round'});
    await wait('document.querySelector(".library-breadcrumbs")?.textContent.includes("Searching:")');
    assert.deepEqual(await rows(),names,'Search results must use the same Recent tie-breaker');
    for(const [sort,expected] of [['name',[names[1],names[2],names[3],names[0]]],['moves',[names[3],names[2],names[1],names[0]]],['recent',names]]) {
      await evaluate(cdp,`(()=>{
        const select=document.querySelector('[aria-label="Sort library"]');
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,'${sort}');
        select.dispatchEvent(new Event('change',{bubbles:true}));
      })()`);
      await wait(`JSON.stringify([...document.querySelectorAll('[data-library-row=file]')].map(e=>e.dataset.libraryRowName))===${JSON.stringify(JSON.stringify(expected))}`);
    }
    reports.push({width,newestFirst:true,numericTiesRetainOrderAfterReload:true,searchSharesOrdering:true,nameAndMovesSortPreserved:true});
  }
  fs.writeFileSync(path.join(screenshotDir,'library-recency.json'),JSON.stringify(reports,null,2));
  console.log('Library Recent: desktop/phone preserve natural numeric order for timestamp ties after reload and in search, with newer edits and other sort choices retained.');
}
