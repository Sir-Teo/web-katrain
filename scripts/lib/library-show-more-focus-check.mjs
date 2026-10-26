import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {evaluate,navigate,setViewport,waitForExpression} from './browser.mjs';
export async function assertLibraryShowMoreFocus(cdp,appUrl,runDir,screenshotDir) {
 const fixture=path.join(runDir,'paged-library.json');
 const folder={id:'paged-folder',type:'folder',name:'Paged folder',parentId:null,createdAt:1,updatedAt:1};
 const files=Array.from({length:250},(_,i)=>({id:'paged-game-'+i,type:'file',name:`${i<125?'Folder':'Root'} game ${String(i%125+1).padStart(3,'0')}`,parentId:i<125?folder.id:null,createdAt:1,updatedAt:1,sgf:'(;GM[1]SZ[9];B[dd])'}));
 fs.writeFileSync(fixture,JSON.stringify({app:'web-katrain',version:2,items:[folder,...files]}));
 const wait=expression=>waitForExpression(cdp,expression,{label:'Library Show more focus',diagnose:`({active:document.activeElement?.getAttribute('data-library-row-name')||document.activeElement?.textContent?.slice(0,80),rows:document.querySelectorAll('[data-library-row]').length,more:[...document.querySelectorAll('.library-show-more')].map(e=>e.textContent),query:document.querySelector('[data-library-search]')?.value})`});
 const click=async selector=>{
  const p=await wait(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)return false;e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return r.width&&e.contains(document.elementFromPoint(x,y))?{x,y}:false})()`);
  for(const type of ['mousePressed','mouseReleased'])await cdp.send('Input.dispatchMouseEvent',{type,...p,button:'left',clickCount:1});
 };
 const reports=[];
 for(const width of [1440,390]) {
  const setup=await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`
   localStorage.removeItem('web-katrain:auto_saved_game:v1');localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');
   localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');localStorage.setItem('web-katrain:library_open:v1','true');
   localStorage.setItem('web-katrain:library_sort:v1','name');localStorage.setItem('web-katrain:settings:v3',JSON.stringify({soundEnabled:false,loadSgfFastAnalysis:false}));
  `});
  try{await setViewport(cdp,{width,height:width===390?844:900,mobile:width===390});await navigate(cdp,appUrl,15000,{acceptBeforeUnload:true})}
  finally{await cdp.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:setup.result.identifier})}
  await wait('!!document.querySelector("[data-board-snapshot]")');if(width===390)await click('#mobile-tab-library');
  await wait('document.querySelector("[data-library-storage-badge]")?.textContent==="IndexedDB"');
  const root=(await cdp.send('DOM.getDocument')).result.root,input=(await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector:'input[type=file][accept=".json,application/json"]'})).result.nodeId;
  await cdp.send('DOM.setFileInputFiles',{nodeId:input,files:[fixture]});
  await wait('!!document.querySelector("[aria-labelledby=library-confirm-dialog-title]")');await click('[aria-labelledby=library-confirm-dialog-title] button.danger');
  await wait(`!!document.querySelector('[data-library-row-name="Paged folder"]')&&!document.querySelector('[role=dialog]')&&!history.state?.webKatrainOverlay&&document.querySelector('[data-library-storage-badge]')?.textContent==='IndexedDB'`);
  const folderRow='[data-library-row-name="Paged folder"]';
  assert.deepEqual(await evaluate(cdp,`(()=>{const e=document.querySelector('${folderRow}');return[e.getAttribute('aria-posinset'),e.getAttribute('aria-setsize')]})()`),['1','126'],'Folder position must describe its complete sibling set');
  if(await evaluate(cdp,`document.querySelector('${folderRow}').getAttribute('aria-expanded')==='true'`))await click(`${folderRow} .library-tree-node-arrow`);
  const revealAll=async(rowsExpression,buttonSelector,total)=>{
   const focused=[];
   while(await evaluate(cdp,`!!document.querySelector(${JSON.stringify(buttonSelector)})`)) {
    const before=await evaluate(cdp,`(${rowsExpression}).length`);
    await evaluate(cdp,`document.querySelector(${JSON.stringify(buttonSelector)}).focus()`);
    if(focused.length%2) await click(buttonSelector);
    else {
     await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'});
     await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
    }
    await wait(`(${rowsExpression}).length>${before}`);
    const state=await evaluate(cdp,`(()=>{
     const row=(${rowsExpression})[${before}],tree=document.querySelector('.library-tree');
     const r=row.getBoundingClientRect(),t=tree.getBoundingClientRect();
     return {focused:document.activeElement===row,name:row.dataset.libraryRowName,visible:r.top>=t.top-1&&r.bottom<=t.bottom+1,
       position:Number(row.getAttribute('aria-posinset')),total:Number(row.getAttribute('aria-setsize')),
       board:{size:document.querySelector('[data-board-snapshot]').dataset.boardSize,moves:document.querySelector('[data-board-snapshot]').dataset.boardMoveCount}};
    })()`);
    assert.equal(state.focused,true,`Show more must focus the first newly revealed row: ${JSON.stringify(state)}`);
    assert.equal(state.visible,true,'The new focus must be visible in the Library scroller');
    assert.deepEqual([state.position,state.total],[before+1,total],'Paged rows must announce their position in the full sibling or search set');
    assert.deepEqual(state.board,{size:'19',moves:'0'},'Revealing rows must not load a game');focused.push(state.name);
   }
   assert.equal(await evaluate(cdp,`(${rowsExpression}).length`),total);
   return focused;
  };
  const allRows=`document.querySelectorAll('[data-library-row]')`;
  const rootMore='[data-library-more-parent=""]';
  const rootFocus=await revealAll(allRows,rootMore,126);
  await click(`${folderRow} .library-tree-node-arrow`);
  await wait(`document.querySelector('${folderRow}').getAttribute('aria-expanded')==='true'`);
  const children=`document.querySelectorAll('[data-library-row][aria-level="2"]')`;
  const folderFocus=await revealAll(children,'[data-library-more-parent="paged-folder"]',125);
  await click('[aria-label="Search library"]');await cdp.send('Input.insertText',{text:'game'});
  await wait('document.querySelector(".library-breadcrumbs")?.textContent.includes("Searching:")');
  const searchFocus=await revealAll(allRows,rootMore,250);
  reports.push({width,rootFocus,folderFocus,searchFocus,allFirstNewRowsVisible:true,lastPageRetainsFocus:true,completeSiblingPositions:true,gameUnchanged:true});
 }
 fs.writeFileSync(path.join(screenshotDir,'library-show-more-focus.json'),JSON.stringify(reports,null,2));
 console.log('Library Show more: desktop/phone root, expanded folders and search focus each first new row, including the final page, keep it visible and leave the game unchanged.');
}
