import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evaluate, navigate, setViewport, waitForExpression } from './browser.mjs';

export async function assertClipboardCommandOrder(cdp, appUrl, screenshotDir) {
  const wait=expression=>waitForExpression(cdp,expression,{
    label:'Overlapping clipboard commands',
    diagnose:`({size:document.querySelector('[data-board-snapshot]')?.dataset.boardSize,focus:document.activeElement?.outerHTML.slice(0,200),requests:window.clipboardCommandReads?.length,downloads:window.clipboardCommandDownloads?.length,dialogs:[...document.querySelectorAll('[role=dialog]')].map(e=>e.innerText.slice(0,200))})`,
  });
  let mobile=false;
  const click=async selector=>{
    const point=await wait(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)return false;e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return r.width&&e.contains(document.elementFromPoint(x,y))?{x,y}:false})()`);
    if(mobile){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})}
    else for(const type of ['mousePressed','mouseReleased'])await cdp.send('Input.dispatchMouseEvent',{type,...point,button:'left',clickCount:1});
  };
  const key=async(key,code,windowsVirtualKeyCode,modifiers=0)=>{
    for(const type of ['keyDown','keyUp'])await cdp.send('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode,modifiers,...(type==='keyDown'&&key==='Enter'?{text:String.fromCharCode(13)}:{})});
  };
  const settle=()=>evaluate(cdp,'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))');
  const command=async()=>{
    const index=await evaluate(cdp,'clipboardCommandReads.length');
    await key('k','KeyK',75,2);await wait('!!document.querySelector("[data-command-palette-search]")');await click('[data-command-palette-search]');
    await cdp.send('Input.insertText',{text:'Paste SGF'});await key('Enter','Enter',13);await wait(`clipboardCommandReads.length===${index+1}`);return index;
  };
  const finish=async(index,text,reject=false)=>{
    const elapsed=await evaluate(cdp,`(()=>{const r=clipboardCommandReads[${index}],elapsed=performance.now()-r.started;${reject?"r.reject(new Error('Clipboard denied'))":`r.resolve(${JSON.stringify(text)})`};return elapsed})()`);
    assert.ok(elapsed<1000,`Fixture read must complete before its 1200 ms timeout (${elapsed} ms)`);await settle();
  };
  const board=()=>evaluate(cdp,`(()=>{const b=document.querySelector('[data-board-snapshot]');return {size:b.dataset.boardSize,moves:b.dataset.boardMoveCount,stones:b.dataset.boardStones}})()`);
  const noError=async()=>{
    assert.equal(await evaluate(cdp,'!!document.querySelector("[data-notification-type=error]")'),false,'A superseded command must not announce a stale error');
    assert.equal(await evaluate(cdp,'!!document.querySelector(".paste-sgf-modal-textarea")'),false,'A superseded read must not open the editor');
  };
  const newer='(;GM[1]SZ[9]GN[Newer clipboard];B[ee])',older='(;GM[1]SZ[13]GN[Older clipboard];B[aa])';
  const results=[];
  for(const width of [1280,390,320]){
    mobile=width<600;
    const setup=await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`
      localStorage.removeItem('web-katrain:auto_saved_game:v1');localStorage.removeItem('web-katrain:shortcuts:v1');
      localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
      localStorage.setItem('web-katrain:library_open:v1','false');localStorage.setItem('web-katrain:settings:v3',JSON.stringify({soundEnabled:false,loadSgfFastAnalysis:false}));
    `});
    try{await setViewport(cdp,{width,height:mobile?(width===320?568:844):800,mobile});await navigate(cdp,appUrl,15000,{acceptBeforeUnload:true})}
    finally{await cdp.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:setup.result.identifier})}
    await wait('!!document.querySelector("[data-board-snapshot]")');await settle();
    await evaluate(cdp,`(()=>{
      window.clipboardCommandReads=[];window.clipboardCommandDownloads=[];
      Object.defineProperty(navigator,'clipboard',{configurable:true,value:{readText:()=>new Promise((resolve,reject)=>clipboardCommandReads.push({resolve,reject,started:performance.now()}))}});
      const original=window.fetch;
      window.fetch=(url,init)=>String(url).includes('online-go.com/api/v1/games/')
        ? new Promise((resolve,reject)=>clipboardCommandDownloads.push({resolve,reject,signal:init?.signal}))
        : original(url,init);
      return true;
    })()`);
    for(const denied of [false,true]){
      const first=await command(),second=await command();await finish(second,newer);await wait('document.querySelector("[data-board-snapshot]").dataset.boardSize==="9"');const before=await board();
      await finish(first,older,denied);assert.deepEqual(await board(),before,'The newest requested game must survive a late read or rejection');await noError();
    }
    const first=await command(),second=await command();await finish(first,'');
    const third=await command();await finish(third,newer);await finish(second,older);assert.equal((await board()).size,'9','Completing an older canceled command must not clear the newer controller');await noError();
    for(const reject of [false,true]){
      const count=await evaluate(cdp,'clipboardCommandDownloads.length');
      const remote=await command();await finish(remote,'https://online-go.com/game/12345');await wait(`clipboardCommandDownloads.length===${count+1}`);
      const latest=await command();await finish(latest,newer);const before=await board();
      assert.equal(await evaluate(cdp,`clipboardCommandDownloads[${count}].signal?.aborted`),true,'The newer command must abort the older OGS request');
      // Ignore abort in this fixture: the caller must reject late completions too.
      await evaluate(cdp,`clipboardCommandDownloads[${count}].${reject?"reject(new Error('Old OGS failure'))":`resolve(new Response(${JSON.stringify(older)}))`};void 0`);await settle();
      assert.deepEqual(await board(),before,'Late OGS responses and failures must preserve the newer game');await noError();
    }
    const late=await command(),denied=await command();await finish(denied,'',true);await wait('!!document.querySelector(".paste-sgf-modal-textarea")');
    await click('.paste-sgf-modal-textarea');await cdp.send('Input.insertText',{text:newer});const before=await board();await finish(late,older);
    assert.deepEqual(await board(),before);assert.equal(await evaluate(cdp,'document.querySelector(".paste-sgf-modal-textarea").value'),newer,'A current failed read must retain its fallback editor and draft');
    await click('[aria-label="Close paste SGF"]');await wait('!document.querySelector(".paste-sgf-modal-textarea")');await settle();
    const retry=await command();await finish(retry,newer);await noError();assert.equal((await board()).size,'9');
    const shot=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(screenshotDir,`clipboard-command-order-${width}.png`),Buffer.from(shot.result.data,'base64'));
    results.push({width,newestRead:true,staleFailure:true,cleanupOwnership:true,abortedOgs:true,lateOgs:true,fallbackDraft:true,retry:true});console.log('Clipboard command ordering',JSON.stringify(results.at(-1)));
  }
  fs.writeFileSync(path.join(screenshotDir,'clipboard-command-order.json'),JSON.stringify(results,null,2));
}
