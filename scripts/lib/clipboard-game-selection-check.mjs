import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evaluate, loadedModuleUrl, navigate, setViewport, waitForExpression } from './browser.mjs';

export async function assertClipboardGameSelection(cdp, appUrl, runDir, screenshotDir) {
  const fixture=path.join(runDir,'clipboard-game-selection-fixture.json');
  fs.writeFileSync(fixture,JSON.stringify({app:'web-katrain',version:2,items:[9,19].map(size=>({
    id:`clipboard-selected-${size}`,type:'file',name:`Selected ${size}`,parentId:null,createdAt:1,updatedAt:1,
    sgf:`(;GM[1]SZ[${size}]GN[Selected ${size}];B[dd])`,
  }))}));
  let activeCase;
  const timings=[];
  const wait=expression=>waitForExpression(cdp,expression,{label:'Clipboard import after choosing another game',diagnose:`({size:document.querySelector('[data-board-snapshot]')?.dataset.boardSize,root:window.clipboardSelectionStore?.getState().rootNode.id,focus:document.activeElement?.outerHTML.slice(0,200),reads:window.clipboardSelectionReads?.length,downloads:window.clipboardSelectionDownloads?.length})`});
  let mobile=false;
  const click=async selector=>{
    const point=await wait(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)return false;e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return r.width&&e.contains(document.elementFromPoint(x,y))?{x,y}:false})()`);
    if(mobile){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})}
    else for(const type of ['mousePressed','mouseReleased'])await cdp.send('Input.dispatchMouseEvent',{type,...point,button:'left',clickCount:1});
  };
  const key=async(key,code,windowsVirtualKeyCode,modifiers=0)=>{for(const type of ['keyDown','keyUp'])await cdp.send('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode,modifiers,...(type==='keyDown'&&key==='Enter'?{text:String.fromCharCode(13)}:{})})};
  const settle=()=>evaluate(cdp,'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))');
  const command=async()=>{
    const index=await evaluate(cdp,'clipboardSelectionReads.length');await key('k','KeyK',75,2);await wait('!!document.querySelector("[data-command-palette-search]")');
    await click('[data-command-palette-search]');await cdp.send('Input.insertText',{text:'Paste SGF'});await key('Enter','Enter',13);await wait(`clipboardSelectionReads.length===${index+1}`);return index;
  };
  const finish=async(index,text,reject=false)=>{
    const elapsed=await evaluate(cdp,`(()=>{const r=clipboardSelectionReads[${index}],elapsed=performance.now()-r.started;${reject?"r.reject(new Error('Old clipboard failure'))":`r.resolve(${JSON.stringify(text)})`};return elapsed})()`);
    timings.push({case:activeCase,elapsed,roots:await evaluate(cdp,'clipboardSelectionHistory')});fs.writeFileSync(path.join(screenshotDir,'clipboard-selection-timings.json'),JSON.stringify(timings,null,2));
    assert.ok(elapsed<1000,`Fixture read must resolve before its 1200 ms timeout (${elapsed} ms)`);await settle();
  };
  const record=()=>evaluate(cdp,`(()=>{const s=clipboardSelectionStore.getState(),b=document.querySelector('[data-board-snapshot]');return {root:s.rootNode.id,name:s.rootNode.properties?.GN?.[0],size:b.dataset.boardSize,moves:b.dataset.boardMoveCount,stones:b.dataset.boardStones}})()`);
  const older='(;GM[1]SZ[13]GN[Old clipboard];B[aa])';
  const results=[];
  for(const width of [1440,390,320]){
    mobile=width<600;
    const setup=await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`
      localStorage.removeItem('web-katrain:auto_saved_game:v1');localStorage.removeItem('web-katrain:shortcuts:v1');
      localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
      localStorage.setItem('web-katrain:library_open:v1','true');localStorage.setItem('web-katrain:settings:v3',JSON.stringify({soundEnabled:false,loadSgfFastAnalysis:false}));
    `});
    try{await setViewport(cdp,{width,height:mobile?(width===320?568:844):900,mobile});await navigate(cdp,appUrl,15000,{acceptBeforeUnload:true})}
    finally{await cdp.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:setup.result.identifier})}
    await wait('!!document.querySelector("[data-board-snapshot]")');if(mobile)await click('#mobile-tab-library');await wait('document.querySelector("[data-library-storage-badge]")?.textContent==="IndexedDB"');
    const root=(await cdp.send('DOM.getDocument')).result.root;
    const input=(await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector:'input[type=file][accept=".json,application/json"]'})).result.nodeId;
    await cdp.send('DOM.setFileInputFiles',{nodeId:input,files:[fixture]});
      await wait(`document.querySelector('input[type=file][accept=".json,application/json"]').files.length===0`);await settle();
    if(await evaluate(cdp,'!!document.querySelector("[aria-labelledby=library-confirm-dialog-title]")'))await click('[aria-labelledby=library-confirm-dialog-title] button.danger');
    await wait('!document.querySelector("[role=dialog]") && !!document.querySelector("[data-library-row-id=clipboard-selected-19]")');
    await evaluate(cdp,`(async()=>{
      const url=${loadedModuleUrl.toString()};window.clipboardSelectionStore=(await import(url('/src/store/gameStore.ts'))).useGameStore;
      window.clipboardSelectionReads=[];window.clipboardSelectionDownloads=[];window.clipboardSelectionHistory=[];
      clipboardSelectionStore.subscribe((s,prev)=>{if(s.rootNode.id!==prev.rootNode.id)clipboardSelectionHistory.push({root:s.rootNode.id,name:s.rootNode.properties?.GN?.[0],time:performance.now()})});
      Object.defineProperty(navigator,'clipboard',{configurable:true,value:{readText:()=>new Promise((resolve,reject)=>clipboardSelectionReads.push({resolve,reject,started:performance.now()}))}});
      const original=window.fetch;window.fetch=(url,init)=>String(url).includes('online-go.com/api/v1/games/')
        ?new Promise((resolve,reject)=>clipboardSelectionDownloads.push({resolve,reject,signal:init?.signal})):original(url,init);
    })()`);
    const cases=[];
    for(const [index,kind] of ['read','empty','denied','download','failure'].entries()){
      activeCase={width,kind};
      if(mobile)await click('#mobile-tab-library');await wait('!!document.querySelector("[data-library-row-id=clipboard-selected-9]")');
      const beforeRoot=(await record()).root,read=await command();let download;
      const commandReturned=await evaluate(cdp,`performance.now()-clipboardSelectionReads[${read}].started`);
      timings.push({case:activeCase,phase:'command-returned',elapsed:commandReturned});
      if(kind==='download'||kind==='failure'){
        download=await evaluate(cdp,'clipboardSelectionDownloads.length');await finish(read,'https://online-go.com/game/12345');await wait(`clipboardSelectionDownloads.length===${download+1}`);
      }
      const size=index%2===0?9:19;await click(`[data-library-row-id="clipboard-selected-${size}"]`);await wait(`clipboardSelectionStore.getState().rootNode.id!==${JSON.stringify(beforeRoot)}`);
      const selected=await record();timings.push({case:activeCase,phase:'selected-root-observed',elapsed:await evaluate(cdp,`performance.now()-clipboardSelectionReads[${read}].started`)});assert.equal(selected.size,String(size));assert.equal(selected.name,`Selected ${size}`);
      if(download!==undefined)await evaluate(cdp,`clipboardSelectionDownloads[${download}].${kind==='failure'?"reject(new Error('Stale OGS failure'))":`resolve(new Response(${JSON.stringify(older)}))`};void 0`);
      else await finish(read,kind==='empty'?'':older,kind==='denied');
      await settle();assert.deepEqual(await record(),selected,'A clipboard completion must preserve the subsequently selected Library game and root');
      assert.equal(await evaluate(cdp,'!!document.querySelector("[data-notification-type=error], .paste-sgf-modal-textarea")'),false,'Superseded commands must not show an error or open the editor');cases.push(kind);
    }
    activeCase={width,kind:'retry'};const retry=await command();await finish(retry,older);await wait('document.querySelector("[data-board-snapshot]").dataset.boardSize==="13"');
    const shot=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(screenshotDir,`clipboard-game-selection-${width}.png`),Buffer.from(shot.result.data,'base64'));
    results.push({width,cases,retry:true});console.log('Clipboard after Library selection',JSON.stringify(results.at(-1)));
  }
  fs.writeFileSync(path.join(screenshotDir,'clipboard-game-selection.json'),JSON.stringify(results,null,2));
}
