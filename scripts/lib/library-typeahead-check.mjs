import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evaluate, navigate, setViewport, sleep, waitForExpression } from './browser.mjs';

export async function assertLibraryTypeahead(cdp, appUrl, runDir, screenshotDir) {
  const fixture=path.join(runDir,'library-typeahead-fixture.json');
  const items=[
    {id:'type-alpha',name:'Alpha studies',type:'folder'},
    {id:'type-zebra',name:'Zebra nested game',type:'file',parentId:'type-alpha'},
    {id:'type-alpine',name:'Alpine game',type:'file'},
    {id:'type-another',name:'Another game',type:'file'},
    {id:'type-beta',name:'Beta game',type:'file'},
    {id:'type-etude',name:'E\u0301tude',type:'file'},
  ].map(item=>({parentId:null,createdAt:1,updatedAt:1,...item,...(item.type==='file'?{sgf:'(;GM[1]SZ[9];B[dd])'}:{})}));
  fs.writeFileSync(fixture,JSON.stringify({app:'web-katrain',version:2,items}));
  const wait=expression=>waitForExpression(cdp,expression,{
    label:'Library name keyboard navigation',
    diagnose:`({focus:document.activeElement?.outerHTML.slice(0,300),rows:[...document.querySelectorAll('[data-library-row]')].map(e=>e.dataset.libraryRowName),dialogs:[...document.querySelectorAll('[role=dialog]')].map(e=>e.innerText.slice(0,150))})`,
  });
  let mobile=false;
  const click=async selector=>{
    const point=await wait(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)return false;e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return r.width&&e.contains(document.elementFromPoint(x,y))?{x,y}:false})()`);
    if(mobile){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})}
    else for(const type of ['mousePressed','mouseReleased'])await cdp.send('Input.dispatchMouseEvent',{type,...point,button:'left',clickCount:1});
  };
  const press=async(key,code,windowsVirtualKeyCode,modifiers=0)=>{
    for(const type of ['keyDown','keyUp'])await cdp.send('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode,modifiers});
  };
  const letter=key=>press(key,`Key${key.toUpperCase()}`,key.toUpperCase().charCodeAt(0),key===key.toUpperCase()?8:0);
  const home=()=>press('Home','Home',36);
  const focus=async id=>{await evaluate(cdp,`document.querySelector('[data-library-row-id="${id}"]').focus();void 0`);await wait(`document.activeElement?.dataset.libraryRowId===${JSON.stringify(id)}`)};
  const focused=()=>evaluate(cdp,'document.activeElement?.dataset.libraryRowId');
  const state=()=>evaluate(cdp,`({board:{...document.querySelector('[data-board-snapshot]').dataset},selected:[...document.querySelectorAll('[data-library-row][aria-selected=true]')].map(e=>e.dataset.libraryRowId),path:document.querySelector('.library-breadcrumbs').innerText})`);
  const results=[];
  for(const width of [1440,390,320]){
    mobile=width<600;
    const setup=await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`
      localStorage.removeItem('web-katrain:auto_saved_game:v1');localStorage.removeItem('web-katrain:shortcuts:v1');
      localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
      localStorage.setItem('web-katrain:library_open:v1','true');localStorage.setItem('web-katrain:library_sort:v1','name');
      localStorage.setItem('web-katrain:library_folders_expanded:v1','[]');localStorage.removeItem('web-katrain:library_current_folder:v1');
      localStorage.setItem('web-katrain:settings:v3',JSON.stringify({soundEnabled:false,loadSgfFastAnalysis:false}));
    `});
    try{await setViewport(cdp,{width,height:mobile?(width===320?568:844):900,mobile});await navigate(cdp,appUrl,15000,{acceptBeforeUnload:true})}
    finally{await cdp.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:setup.result.identifier})}
    await wait('!!document.querySelector("[data-board-snapshot]")');if(mobile)await click('#mobile-tab-library');
    await wait('document.querySelector("[data-library-storage-badge]")?.textContent==="IndexedDB"');
    const root=(await cdp.send('DOM.getDocument')).result.root;
    const input=(await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector:'input[type=file][accept=".json,application/json"]'})).result.nodeId;
    await cdp.send('DOM.setFileInputFiles',{nodeId:input,files:[fixture]});await wait('!!document.querySelector("[aria-labelledby=library-confirm-dialog-title]")');
    await click('[aria-labelledby=library-confirm-dialog-title] button.danger');
    await wait(`!document.querySelector('[role=dialog]') && !!document.querySelector('[data-library-row-id=type-beta]')`);
    const before=await state();
    await focus('type-alpha');await home();
    await letter('a');assert.equal(await focused(),'type-alpine');
    await letter('l');assert.equal(await focused(),'type-alpine');
    await letter('p');await letter('h');assert.equal(await focused(),'type-alpha','Longer prefixes must keep or find the closest name');
    await home();await letter('a');await letter('a');assert.equal(await focused(),'type-another');await letter('a');assert.equal(await focused(),'type-alpha','Repeated letters must wrap through matches');
    await home();await letter('B');assert.equal(await focused(),'type-beta','Shifted letters must match names');
    await home();await letter('e');assert.equal(await focused(),'type-etude','Plain letters must match accented names as Library search does');
    await home();await press('É','Quote',222,8);assert.equal(await focused(),'type-etude','Normalized Unicode names must match shifted letters');
    await sleep(1050);await letter('a');assert.equal(await focused(),'type-alpha','A paused prefix starts a new search');
    await home();await letter('a');await letter('l');await press('ArrowLeft','ArrowLeft',37);await letter('b');assert.equal(await focused(),'type-beta','Even an arrow at a boundary resets the prefix');
    await home();await letter('z');assert.equal(await focused(),'type-alpha','Collapsed descendants cannot receive focus');
    assert.equal(await evaluate(cdp,`document.querySelector('[data-library-row-id=type-alpha]').getAttribute('aria-expanded')`),'false');
    await home();await press('ArrowRight','ArrowRight',39);await wait('!!document.querySelector("[data-library-row-id=type-zebra]")');
    await letter('z');assert.equal(await focused(),'type-zebra','Expanded children participate in name navigation');
    await press('ArrowLeft','ArrowLeft',37);await press('ArrowLeft','ArrowLeft',37);await wait('!document.querySelector("[data-library-row-id=type-zebra]")');
    await home();
    for(const init of [{key:'b',isComposing:true},{key:'b',keyCode:229},{key:'q',ctrlKey:true},{key:'q',altKey:true},{key:'q',metaKey:true}]){
      const prevented=await evaluate(cdp,`(()=>{const event=new KeyboardEvent('keydown',{...${JSON.stringify(init)},bubbles:true,cancelable:true});document.activeElement.dispatchEvent(event);return event.defaultPrevented})()`);
      assert.equal(prevented,false,'Name navigation must leave composition and unbound modified letters unclaimed');
      assert.equal(await focused(),'type-alpha','Composition and modified letters must retain their existing behavior');
    }
    assert.deepEqual(await state(),before,'Typing names must not load, select, or open folders');
    assert.equal(await evaluate(cdp,'!!document.querySelector("[role=dialog]")'),false,'Typing a name must not activate a workspace shortcut');
    await click('[data-library-search]');await cdp.send('Input.insertText',{text:'Beta'});await wait('document.querySelectorAll("[data-library-row]").length===1');
    await focus('type-beta');await letter('a');assert.equal(await focused(),'type-beta','Filtered-out rows cannot receive focus');
    await letter('z');await click('.library-search-clear');await wait('document.querySelectorAll("[data-library-row]").length===5');await focus('type-beta');await letter('a');assert.equal(await focused(),'type-alpha','Leaving the tree clears the previous prefix');
    const tree=(await cdp.send('Accessibility.getFullAXTree')).result.nodes.find(node=>node.role?.value==='tree'&&node.name?.value==='Library games');
    assert.match(tree?.description?.value??'',/Type a name prefix/);
    const shot=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(screenshotDir,`library-typeahead-${width}.png`),Buffer.from(shot.result.data,'base64'));
    results.push({width,prefix:true,cycle:true,timeout:true,arrows:true,composition:true,unicode:true,visibleRowsOnly:true,boardUnchanged:true});
    console.log('Library name navigation',JSON.stringify(results.at(-1)));
  }
  fs.writeFileSync(path.join(screenshotDir,'library-typeahead.json'),JSON.stringify(results,null,2));
}
