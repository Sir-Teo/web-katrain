import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evaluate, loadedModuleUrl, navigate, setViewport, sleep, waitForExpression } from './browser.mjs';

export async function assertNotificationInteraction(cdp, appUrl, screenshotDir) {
  const wait=e=>waitForExpression(cdp,e,{label:'Notification interaction',timeoutMs:10000});
  const point=(selector='.notification-toast-close')=>wait(`(()=>{
    const e=document.querySelector(${JSON.stringify(selector)});if(!e)return false;
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
    const press=async p=>{
      if(mobile) {
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      } else for(const type of ['mousePressed','mouseReleased'])await cdp.send('Input.dispatchMouseEvent',{type,...p,button:'left',clickCount:1});
    };
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
    await publish('Dismiss this status');await press(await point());
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
    await evaluate(cdp,`(()=>{
      window.notificationOriginalClipboard=Object.getOwnPropertyDescriptor(navigator,'clipboard');window.notificationCopies=[];
      Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:text=>new Promise(resolve=>notificationCopies.push({text,resolve}))}});
      notificationInteractionStore.setState({notification:{message:'First copy error',type:'error',copyText:'First details'}});
    })()`);
    try {
      await wait("document.querySelector('.notification-toast-message')?.title==='First copy error'");
      await press(await point('[data-notification-copy]'));await wait('notificationCopies.length===1');
      await evaluate(cdp,"notificationInteractionStore.setState({notification:{message:'Second copy error',type:'error',copyText:'Second details'}})");
      await press(await point());await wait("document.querySelector('.notification-toast-message')?.title==='Second copy error'");
      await wait("document.querySelector('[data-notification-copy]')?.getAttribute('aria-label')==='Copy notification'");
      await evaluate(cdp,`(async()=>{notificationCopies[0].resolve();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))})()`);
      assert.equal(await evaluate(cdp,"document.querySelector('[data-notification-copy]').getAttribute('aria-label')"),'Copy notification','An old copy must not mark the arriving error copied');
      await press(await point('[data-notification-copy]'));await wait('notificationCopies.length===2');
      await evaluate(cdp,'notificationCopies[1].resolve()');
      await wait("document.querySelector('[data-notification-copy]')?.getAttribute('aria-label')==='Notification copied'");
      assert.deepEqual(await evaluate(cdp,'notificationCopies.map(copy=>copy.text)'),['First details','Second details']);
    } finally {
      await evaluate(cdp,`(()=>{
        if(window.notificationOriginalClipboard)Object.defineProperty(navigator,'clipboard',window.notificationOriginalClipboard);else delete navigator.clipboard;
        notificationInteractionStore.getState().clearNotification();delete window.notificationOriginalClipboard;delete window.notificationCopies;
      })()`);
    }
    reports.push({width,laterMessageExpires:true,focusHoldChecked:!mobile,hoverHoldChecked:!mobile,staleCopyIgnored:true,currentCopyCompletes:true});
  }
  fs.writeFileSync(path.join(screenshotDir,'notification-interaction.json'),JSON.stringify(reports,null,2));
  console.log('Notification interaction: desktop/phone dismissal, timers, combined focus/hover holds, release, and stale/current copy results passed.');
}
