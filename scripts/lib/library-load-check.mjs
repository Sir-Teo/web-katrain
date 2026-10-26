import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { connectDevtools, evaluate, loadedModuleUrl, navigate, setViewport, sleep, waitForExpression } from './browser.mjs';

export async function assertLatestLibraryLoads(devtoolsPort, appUrl, screenshotDir) {
  const version=await (await fetch(`http://127.0.0.1:${devtoolsPort}/json/version`)).json();
  const browser=connectDevtools(version.webSocketDebuggerUrl);await browser.ready;
  const context=(await browser.send('Target.createBrowserContext')).result.browserContextId;
  const target=(await browser.send('Target.createTarget',{url:'about:blank',browserContextId:context})).result.targetId;
  const cdp=connectDevtools(`ws://127.0.0.1:${devtoolsPort}/devtools/page/${target}`);await cdp.ready;
  const wait=e=>waitForExpression(cdp,e,{label:'Latest library record loading',diagnose:`({moves:document.querySelector('[data-board-snapshot]')?.dataset.boardMoveCount,dialogs:[...document.querySelectorAll('[role=dialog]')].map(e=>e.getAttribute('aria-labelledby')),rows:document.querySelectorAll('[data-library-row=file]').length,badge:document.querySelector('[data-library-storage-badge]')?.textContent,notice:document.querySelector('.notification-toast-message')?.title})`});
  let mobile=false;
  const key=async(key,code,windowsVirtualKeyCode,modifiers=0)=>{
    for(const type of ['keyDown','keyUp'])await cdp.send('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode,modifiers});
  };
  const click=async selector=>{
    const p=await wait(`(()=>{
      const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)return false;
      e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
      return r.width&&e.contains(document.elementFromPoint(x,y))?{x,y}:false;
    })()`);
    if(mobile) {
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    } else for(const type of ['mousePressed','mouseReleased'])await cdp.send('Input.dispatchMouseEvent',{type,...p,button:'left',clickCount:1});
  };
  const read=()=>evaluate(cdp,`(()=>{
    const s=libraryLoadStore.getState();let lineMoves=0,node=s.rootNode;
    while(node.children[0]){node=node.children[0];if(node.move)lineMoves++}
    return{rootId:s.rootNode.id,lineMoves,currentMove:s.moveHistory.length,last:s.currentNode.move};
  })()`);
  try {
    const seed=[{id:'load-study',name:'Study',type:'file',parentId:null,createdAt:1,updatedAt:1,sgf:'(;SZ[9];B[dd])'}];
    await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`
      localStorage.removeItem('web-katrain:auto_saved_game:v1');
      localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');
      localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
      localStorage.setItem('web-katrain:library_open:v1','true');
      localStorage.setItem('web-katrain:library_preloaded_version:v1','3');
      localStorage.setItem('web-katrain:library:v1',JSON.stringify(${JSON.stringify(seed)}));
    `});
    await cdp.send('Emulation.setFocusEmulationEnabled',{enabled:true});
    await setViewport(cdp,{width:1440,height:900,mobile:false});await navigate(cdp,appUrl);
    await wait('!!document.querySelector("[data-library-row=file]")');
    await evaluate(cdp,`(async()=>{
      const url=${loadedModuleUrl.toString()};window.libraryLoadStore=(await import(url('/src/store/gameStore.ts'))).useGameStore;
      window.libraryLoadApi=await import(url('/src/utils/library.ts'));
      libraryLoadStore.getState().updateSettings({soundEnabled:false,loadSgfFastAnalysis:false});
    })()`);
    await click('[data-library-row=file]');await wait('libraryLoadStore.getState().rootNode.children.length===1');
    await evaluate(cdp,'(()=>{libraryLoadStore.getState().navigateEnd();libraryLoadStore.getState().playMove(4,4);return true})()');
    await wait('libraryLoadStore.getState().moveHistory.length===2');const before=await read();
    await click('[data-library-row=file]');await wait('!!document.querySelector("[aria-labelledby=unsaved-changes-title]")');
    await click('[aria-labelledby="unsaved-changes-title"] .ui-bar:last-child button:last-child');
    await wait(`libraryLoadStore.getState().rootNode.id!==${JSON.stringify(before.rootId)}`);
    const reloaded=await read();assert.equal(reloaded.lineMoves,2,'Save before reopening must load the just-saved moves');
    assert.equal(await evaluate(cdp,"libraryLoadApi.loadLibrary().then(items=>items.find(item=>item.id==='load-study').moveCount)"),2);

    await evaluate(cdp,`libraryLoadApi.updateStoredLibrary(items=>({items:libraryLoadApi.updateLibraryFileSgf(items,'load-study','(;SZ[9];B[dd];W[ee];B[ff])').map(item=>item.id==='load-study'?{...item,name:'Renamed study'}:item),result:true}))`);
    const previous=await read();await click('[data-library-row=file]');
    await wait(`libraryLoadStore.getState().rootNode.id!==${JSON.stringify(previous.rootId)}`);
    assert.equal((await read()).lineMoves,3,'A stale row must open the latest stored SGF');
    await wait('document.querySelector(".gs-file")?.textContent.includes("Renamed study")');
    await evaluate(cdp,'(()=>{libraryLoadStore.getState().navigateEnd();libraryLoadStore.getState().navigateBack();return true})()');
    await sleep(650);
    assert.deepEqual(await evaluate(cdp,"JSON.parse(localStorage.getItem('web-katrain:library_positions:v1'))['load-study']"),[0,0]);
    const beforeRecent=await read();mobile=true;await setViewport(cdp,{width:390,height:844,mobile:true});
    await click('button[aria-label="Menu"]');await wait('!!document.querySelector("[data-menu-recent] button")');
    await click('[data-menu-recent] button');await wait(`libraryLoadStore.getState().rootNode.id!==${JSON.stringify(beforeRecent.rootId)}`);
    const resumed=await read();assert.equal(resumed.currentMove,2,'Recent must restore the remembered position');
    assert.equal(resumed.lineMoves,3);

    mobile=false;await setViewport(cdp,{width:1440,height:900,mobile:false});
    await wait('!!document.querySelector(".wk-dashboard button[aria-label=Library]")');
    if(await evaluate(cdp,"document.querySelector('.wk-dashboard button[aria-label=Library]').getAttribute('aria-expanded')==='false'"))await click('.wk-dashboard button[aria-label=Library]');
    await wait('document.querySelector("[data-library-storage-badge]")?.textContent==="IndexedDB"');
    await evaluate(cdp,'libraryLoadApi.loadLibrary().then(()=>true)');
    await evaluate(cdp,`(()=>{
      const open=indexedDB.open.bind(indexedDB);window.libraryLoadHeld=[];
      indexedDB.open=(...args)=>{const request=open(...args);Object.defineProperty(request,'onsuccess',{set(fn){request.addEventListener('success',event=>libraryLoadHeld.push(()=>fn.call(request,event)),{once:true})}});return request};
      window.releaseLibraryLoad=()=>{indexedDB.open=open;libraryLoadHeld.splice(0).forEach(release=>release())};return true;
    })()`);
    await click('[data-library-row=file]');await wait('libraryLoadHeld.length>0');
    const heldRoot=(await read()).rootId;
    await evaluate(cdp,'libraryLoadStore.getState().playMove(6,6)');
    await evaluate(cdp,'releaseLibraryLoad()');
    await wait('document.body.textContent.includes("The game changed while loading.")');
    const retained=await read();assert.equal(retained.rootId,heldRoot);assert.equal(retained.last.x,6);assert.equal(retained.last.y,6);
    await wait("JSON.parse(localStorage.getItem('web-katrain:auto_saved_game:v1'))?.sgf.includes('B[gg]')");
    await evaluate(cdp,"libraryLoadApi.updateStoredLibrary(items=>({items:items.filter(item=>item.id!=='load-study'),result:true}))");
    await click('[data-library-row=file]');await wait('!!document.querySelector("[aria-labelledby=unsaved-changes-title]")');
    await click('[aria-labelledby="unsaved-changes-title"] .ui-bar:last-child button:nth-child(2)');
    await wait('document.body.textContent.includes("That game is no longer in the Library.")');
    assert.equal((await read()).rootId,retained.rootId,'A deleted target must leave the current game intact');
    fs.writeFileSync(path.join(screenshotDir,'library-latest-load.json'),JSON.stringify({saveBeforeReloadMoves:reloaded.lineMoves,latestStoredMoves:3,renamedFileObserved:true,resumedMove:resumed.currentMove,editsDuringLookupRetained:true,recoveryRetained:true,deletedTargetPreservesGame:true},null,2));
    console.log('Library loads: just-saved/current records, latest names, Recent resume, newer edits during lookup, recovery, and deleted targets passed.');
  } finally {
    cdp.close();await browser.send('Target.disposeBrowserContext',{browserContextId:context});browser.close();
  }
}
