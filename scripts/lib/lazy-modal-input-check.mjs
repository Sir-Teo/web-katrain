import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evaluate, loadedModuleUrl, navigate, setViewport, waitForExpression } from './browser.mjs';

export async function assertLazyModalInput(cdp, appUrl, screenshotDir) {
  const wait=e=>waitForExpression(cdp,e,{label:'Loading dialog input protection',timeoutMs:15000});
  const key=async(key,code,windowsVirtualKeyCode)=>{
    for(const type of ['keyDown','keyUp'])await cdp.send('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode});
  };
  await navigate(cdp,'about:blank',15000,{acceptBeforeUnload:true});
  await setViewport(cdp,{width:1440,height:900,mobile:false});
  const paused=[];
  const stopListening=cdp.on(message=>{if(message.method==='Fetch.requestPaused')paused.push(message.params.requestId)});
  const setup=await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`
    localStorage.removeItem('web-katrain:auto_saved_game:v1');
    localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');
    localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
    localStorage.removeItem('wk-getting-started-dismissed');
    localStorage.removeItem('web-katrain:hero_dismissed:v1');
  `});
  let intercepted=0;
  try {
    await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
    await cdp.send('Fetch.enable',{patterns:[{urlPattern:'*LessonsModal.tsx*',requestStage:'Request'}]});
    // An intentionally held module can delay the load event. Start from the
    // blank document and wait for the requested app's board instead.
    await cdp.send('Page.enable');await cdp.send('Page.navigate',{url:appUrl});
    await wait('!!document.querySelector("[data-board-snapshot=true]")');
    await evaluate(cdp,`(async()=>{
      const url=${loadedModuleUrl.toString()};const {useGameStore}=await import(url('/src/store/gameStore.ts'));
      useGameStore.getState().updateSettings({soundEnabled:false,loadSgfFastAnalysis:false});
    })()`);
    const p=await wait(`(()=>{
      const e=[...document.querySelectorAll('button')].find(e=>e.title==='Learn Go with interactive lessons on captures, life and openings'&&e.getBoundingClientRect().width);
      if(!e)return false;const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
      return e.contains(document.elementFromPoint(x,y))?{x,y}:false;
    })()`);
    for(const type of ['mousePressed','mouseReleased'])await cdp.send('Input.dispatchMouseEvent',{type,...p,button:'left',clickCount:1});
    await wait('!!document.querySelector("[data-lazy-modal-loading=true]")');
    assert.ok(paused.length>0,'The real dialog module must remain paused');intercepted=paused.length;
    await evaluate(cdp,'(()=>{window.loadingDialogTrigger=document.activeElement;return true})()');
    for(const [k,code,vk] of [['p','KeyP',80],['Tab','Tab',9],['Enter','Enter',13],[' ','Space',32]])await key(k,code,vk);
    assert.equal(await evaluate(cdp,'document.activeElement===loadingDialogTrigger'),true,'Loading must not move keyboard focus into the background');
    await evaluate(cdp,`(async()=>{
      const data=new DataTransfer();data.setData('text/plain','(;SZ[9]PB[Behind loading])');
      loadingDialogTrigger.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    })()`);
    const board=await evaluate(cdp,`(()=>{const d=document.querySelector('[data-board-snapshot]').dataset;return{size:d.boardSize,moves:d.boardMoveCount}})()`);
    assert.deepEqual(board,{size:'19',moves:'0'},'Pass and pasted SGF must not change the board behind Opening');
  } finally {
    for(const requestId of paused)await cdp.send('Fetch.continueRequest',{requestId});
    await cdp.send('Fetch.disable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:false});
    await cdp.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:setup.result.identifier});stopListening();
  }
  await wait('!!document.querySelector("[aria-labelledby=lessons-title]")&&!document.querySelector("[data-lazy-modal-loading]")');
  await key('Escape','Escape',27);await wait('!document.querySelector("[aria-labelledby=lessons-title]")');
  await key('p','KeyP',80);await wait('document.querySelector("[data-board-snapshot]").dataset.boardMoveCount==="1"');
  fs.writeFileSync(path.join(screenshotDir,'lazy-modal-input.json'),JSON.stringify({intercepted,backgroundPassBlocked:true,tabAndActivationBlocked:true,pasteBlocked:true,keyboardResumes:true},null,2));
  console.log('Loading dialog: held real chunk, blocked Pass/Tab/activation/paste, and restored keyboard behavior after loading passed.');
}
