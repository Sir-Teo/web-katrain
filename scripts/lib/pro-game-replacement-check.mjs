import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evaluate, navigate, setViewport, waitForExpression } from './browser.mjs';

export async function assertProGameReplacement(cdp, appUrl, screenshotDir) {
  let mobile=false;
  const wait=e=>waitForExpression(cdp,e,{label:'Pro-game replacement confirmation',diagnose:`({width:innerWidth,moves:document.querySelector('[data-board-snapshot=true]')?.dataset.boardMoveCount,pendingTap:!!document.querySelector('[data-tap-confirm=true]'),dialogs:[...document.querySelectorAll('[role=dialog]')].map(e=>e.getAttribute('aria-labelledby'))})`});
  const key=async(key,code,windowsVirtualKeyCode,modifiers=0)=>{
    for(const type of ['keyDown','keyUp']) await cdp.send('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode,modifiers});
  };
  const pointer=async point=>{
    if(mobile) {
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    } else for(const type of ['mousePressed','mouseReleased']) await cdp.send('Input.dispatchMouseEvent',{type,...point,button:'left',clickCount:1});
  };
  const click=async(selector,text)=>{
    const point=await wait(`(() => {
      const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>${text?`e.textContent.trim()===${JSON.stringify(text)}`:'true'});
      if(!e||e.disabled)return false;e.scrollIntoView({block:'nearest'});
      const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
      return r.width&&e.contains(document.elementFromPoint(x,y))?{x,y}:false;
    })()`);
    await pointer(point);
  };
  const board=()=>evaluate(cdp,`(() => {const b=document.querySelector('[data-board-snapshot=true]').dataset;return {stones:b.boardStones,moves:b.boardMoveCount,player:b.boardCurrentPlayer}})()`);
  const setup=await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`
    localStorage.removeItem('web-katrain:auto_saved_game:v1');
    localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');
    localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
  `});
  const reports=[];
  try {
    for(const width of [1440,390,320,568]) {
      mobile=width<1000;
      const largeText=width===320||width===568;
      const height=width===568?320:width===320?568:mobile?844:900;
      await setViewport(cdp,{width,height,mobile});
      await navigate(cdp,appUrl,15000,{acceptBeforeUnload:true});
      await wait('!!document.querySelector("[data-board-snapshot=true]")');
      const point=await evaluate(cdp,`(() => {
        const b=document.querySelector('[data-board-snapshot=true]'),r=b.getBoundingClientRect();
        return {x:r.x+Number(b.dataset.boardOriginX)+3*Number(b.dataset.boardCellSize),y:r.y+Number(b.dataset.boardOriginY)+3*Number(b.dataset.boardCellSize)};
      })()`);
      await pointer(point);
      if(mobile) {
        await wait('!!document.querySelector("[data-tap-confirm=true]") || document.querySelector("[data-board-snapshot=true]").dataset.boardMoveCount==="1"');
        if(await evaluate(cdp,'!!document.querySelector("[data-tap-confirm=true]")')) await pointer(point);
      }
      await wait('document.querySelector("[data-board-snapshot=true]").dataset.boardMoveCount==="1"');
      const before=await board();
      await key('k','KeyK',75,2);
      await wait('!!document.querySelector("[data-command-palette-search]")');
      await click('[data-command-palette-search]');await cdp.send('Input.insertText',{text:'Pro games'});
      await click('[data-command-palette-item=pro-games]');
      const expectedMoves=await wait(`(() => {
        const text=[...document.querySelectorAll('.pro-games-metadata span')].map(e=>e.textContent.trim()).find(text=>/^[0-9]+ moves$/.test(text));
        return text ? Number.parseInt(text,10) : false;
      })()`);
      const requestLoad=async()=>{
        if(largeText)await evaluate(cdp,"document.documentElement.style.fontSize=''");
        await click('.pro-games-load');
        await wait('!!document.querySelector("[aria-labelledby=unsaved-changes-title]")');
        if(largeText)await evaluate(cdp,"document.documentElement.style.fontSize='200%';new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
      };
      await requestLoad();
      const reachable=await evaluate(cdp,`(async()=>{const d=document.querySelector('[aria-labelledby="unsaved-changes-title"]');
        if(${largeText}){const r=d.getBoundingClientRect();if(r.top<0||r.bottom>innerHeight)return false;}
        for(const b of d.querySelectorAll('button')){
          if(${largeText}){b.scrollIntoView({block:'nearest',behavior:'instant'});await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));}
          const r=b.getBoundingClientRect();if(!b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)))return false;
          if(${largeText}&&b.getAttribute('aria-label')==='Close unsaved changes dialog'&&r.width<44)return false;
        }return true;
      })()`);
      assert.equal(reachable,true,'Every confirmation control must be above the game picker');
      await key('Escape','Escape',27);
      await wait('!document.querySelector("[aria-labelledby=unsaved-changes-title]")');
      assert.equal(await evaluate(cdp,'!!document.querySelector("[aria-labelledby=pro-games-title]")'),true,'Escape must keep the pro-game picker open');
      await wait('document.activeElement===document.querySelector(".pro-games-load")');
      assert.deepEqual(await board(),before);
      await requestLoad();
      await evaluate(cdp,`document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',isComposing:true,bubbles:true,cancelable:true}))`);
      assert.equal(await evaluate(cdp,'!!document.querySelector("[aria-labelledby=unsaved-changes-title]")'),true,'Composition Escape must keep the confirmation');
      await click('[aria-labelledby="unsaved-changes-title"] button','Cancel');
      await wait('!document.querySelector("[aria-labelledby=unsaved-changes-title]")');
      assert.deepEqual(await board(),before);
      if(mobile) {
        await requestLoad();await evaluate(cdp,'history.back()');
        await wait('!document.querySelector("[aria-labelledby=unsaved-changes-title]")');
        assert.equal(await evaluate(cdp,'!!document.querySelector("[aria-labelledby=pro-games-title]")'),true,'Back must dismiss only the confirmation');
        assert.deepEqual(await board(),before);
      }
      await requestLoad();
      await click('[aria-labelledby="unsaved-changes-title"] button','Discard');
      await wait('!document.querySelector("[aria-labelledby=pro-games-title]") && !document.querySelector("[aria-labelledby=unsaved-changes-title]")');
      await wait(`Number(document.querySelector('[data-board-snapshot=true]').dataset.boardMoveCount)===${expectedMoves}`);
      reports.push({width,height,confirmationTextSize:largeText?'200%':'100%',buttonsReachable:true,cancelPreservesPickerAndGame:true,compositionEscapeIgnored:true,backChecked:mobile,discardLoadsMoves:expectedMoves});
    }
  } finally {
    await cdp.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:setup.result.identifier});
  }
  fs.writeFileSync(path.join(screenshotDir,'pro-game-replacement.json'),JSON.stringify(reports,null,2));
  console.log('Pro-game replacement: reachable confirmation, Escape/Cancel, focus return, mobile Back, composition, and Discard/load passed.');
}
