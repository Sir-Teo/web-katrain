import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evaluate, loadedModuleUrl, navigate, setViewport, sleep, waitForExpression } from './browser.mjs';

export async function assertNotificationInteraction(cdp, appUrl, screenshotDir) {
  const wait=e=>waitForExpression(cdp,e,{label:'Notification interaction',timeoutMs:10000});
  const point=()=>wait(`(()=>{
    const e=document.querySelector('.notification-toast-close');if(!e)return false;
    const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
    return r.width&&e.contains(document.elementFromPoint(x,y))?{x,y}:false;
  })()`);
  const publish=async message=>{
    await evaluate(cdp,`notificationInteractionStore.setState({notification:{message:${JSON.stringify(message)},type:'info'}})`);
    await wait(`document.querySelector('.notification-toast-message')?.title===${JSON.stringify(message)}`);
  };
  const gone=()=>wait('notificationInteractionStore.getState().notification===null&&!document.querySelector("[data-notification]")');
  const reports=[];
  for(const width of [1440,390]) {
    const mobile=width===390;
    const setup=await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`
      localStorage.removeItem('web-katrain:auto_saved_game:v1');
      localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');
      localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
    `});
    try {
      await setViewport(cdp,{width,height:mobile?844:900,mobile});
      await navigate(cdp,appUrl,15000,{acceptBeforeUnload:true});
    } finally {await cdp.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:setup.result.identifier});}
    await wait('!!document.querySelector("[data-board-snapshot=true]")');
    await evaluate(cdp,`(async()=>{
      const url=${loadedModuleUrl.toString()};window.notificationInteractionStore=(await import(url('/src/store/gameStore.ts'))).useGameStore;
    })()`);
    await publish('Dismiss this status');const p=await point();
    if(mobile) {
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    } else for(const type of ['mousePressed','mouseReleased'])await cdp.send('Input.dispatchMouseEvent',{type,...p,button:'left',clickCount:1});
    await gone();
    if(!mobile)await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:20,y:500});
    await publish('Later status must still expire');await gone();
    if(!mobile) {
      await publish('Keep keyboard focus');
      await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',...await point()});
      await evaluate(cdp,"document.querySelector('.notification-toast-close').focus()");
      await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:20,y:500});
      await sleep(3000);
      assert.equal(await evaluate(cdp,'notificationInteractionStore.getState().notification?.message'),'Keep keyboard focus');
      assert.equal(await evaluate(cdp,"document.querySelector('[data-notification]').contains(document.activeElement)"),true);
      await evaluate(cdp,'document.activeElement.blur()');await gone();
      await publish('Keep pointer hover');
      await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',...await point()});
      await evaluate(cdp,"document.querySelector('.notification-toast-close').focus();document.activeElement.blur()");
      await sleep(3000);
      assert.equal(await evaluate(cdp,'notificationInteractionStore.getState().notification?.message'),'Keep pointer hover');
      await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:20,y:500});await gone();
    }
    reports.push({width,laterMessageExpires:true,focusHoldChecked:!mobile,hoverHoldChecked:!mobile});
  }
  fs.writeFileSync(path.join(screenshotDir,'notification-interaction.json'),JSON.stringify(reports,null,2));
  console.log('Notification interaction: desktop/phone dismissal, later timers, combined focus/hover holds, and release passed.');
}
