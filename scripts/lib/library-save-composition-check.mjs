import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {evaluate,navigate,setViewport,waitForExpression} from './browser.mjs';
export async function assertLibrarySaveComposition(cdp,appUrl,screenshotDir) {
  const wait=expression=>waitForExpression(cdp,expression,{label:'Library destination composition'});
  const key=async(key,code,windowsVirtualKeyCode,modifiers=0)=>{
    for(const type of ['keyDown','keyUp'])await cdp.send('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode,modifiers});
  };
  const click=async selector=>{
    const p=await wait(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)return false;e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return r.width&&e.contains(document.elementFromPoint(x,y))?{x,y}:false})()`);
    for(const type of ['mousePressed','mouseReleased'])await cdp.send('Input.dispatchMouseEvent',{type,...p,button:'left',clickCount:1});
  };
  const reports=[];
  for(const width of [1440,390]) {
    const setup=await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`
      localStorage.removeItem('web-katrain:auto_saved_game:v1');
      localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');
      localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
      localStorage.setItem('web-katrain:library_open:v1','true');
      localStorage.setItem('web-katrain:settings:v3',JSON.stringify({soundEnabled:false,loadSgfFastAnalysis:false}));
    `});
    try{await setViewport(cdp,{width,height:width===390?844:900,mobile:width===390});await navigate(cdp,appUrl,15000,{acceptBeforeUnload:true})}
    finally{await cdp.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:setup.result.identifier})}
    await wait('!!document.querySelector("[data-board-snapshot]")');
    for(const kind of ['copy','panel']) {
      if(kind==='copy') {
        await evaluate(cdp,'document.activeElement?.blur()');await key('k','KeyK',75,2);
        await wait('!!document.querySelector("[data-command-palette-search]")');
        await click('[data-command-palette-search]');await cdp.send('Input.insertText',{text:'Save copy to library'});
        await click('[data-command-palette-item=save-library]');
      } else {
        if(width===390)await click('#mobile-tab-library');
        await wait('document.querySelector("[data-library-storage-badge]")?.textContent==="IndexedDB"');
        await click('[aria-label="Save current game to Library"]');
      }
      const dialog=kind==='copy'?'[aria-labelledby=save-to-library-title]':'[aria-labelledby=library-text-dialog-title]';
      await wait(`document.querySelector('${dialog}')?.contains(document.activeElement)`);
      await click(`${dialog} input`);await key('a','KeyA',65,2);
      const name=`Keep destination draft ${width} ${kind}`;await cdp.send('Input.insertText',{text:name});
      await click(`${dialog} select`);await key('ArrowDown','ArrowDown',40);
      // Dismiss the native option popup, while retaining the selected destination.
      await key('Tab','Tab',9);
      await evaluate(cdp,`document.querySelector('${dialog} select').focus()`);
      const destination=await evaluate(cdp,`document.querySelector('${dialog} select').value`);
      for(const composition of [{isComposing:true},{keyCode:229}]) {
        await evaluate(cdp,`document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,cancelable:true,key:'Escape',...${JSON.stringify(composition)}}))`);
        assert.equal(await evaluate(cdp,`!!document.querySelector('${dialog}')`),true,`${kind}: composition Escape must preserve the save draft`);
        assert.deepEqual(await evaluate(cdp,`({name:document.querySelector('${dialog} input').value,destination:document.querySelector('${dialog} select').value})`),{name,destination});
      }
      await key('Escape','Escape',27);await wait(`!document.querySelector('${dialog}')&&!history.state?.webKatrainOverlay`);
    }
    if(width===390)await click('#mobile-tab-library');
    await click('[aria-label="More library actions"]');
    await wait(`document.querySelector('[role=menu][aria-label="More library actions"]')?.contains(document.activeElement)`);
    for(const composition of [{isComposing:true},{keyCode:229}]) {
      for(const key of ['Escape','ArrowDown']) {
        const unchanged=await evaluate(cdp,`(()=>{
          const focus=document.activeElement;
          focus.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,cancelable:true,key:${JSON.stringify(key)},...${JSON.stringify(composition)}}));
          return focus===document.activeElement;
        })()`);
        assert.equal(unchanged,true,'Composition must retain the focused menu choice');
        assert.equal(await evaluate(cdp,`!!document.querySelector('[role=menu][aria-label="More library actions"]')`),true,'Composition Escape must preserve the Library menu');
      }
    }
    await key('ArrowDown','ArrowDown',40);
    assert.equal(await evaluate(cdp,`document.activeElement===document.querySelector('[role=menu][aria-label="More library actions"] button:nth-child(2)')`),true);
    await key('Escape','Escape',27);await wait(`!document.querySelector('[role=menu][aria-label="More library actions"]')`);
    assert.equal(await evaluate(cdp,`document.activeElement===document.querySelector('button[aria-label="More library actions"]')`),true,JSON.stringify(await evaluate(cdp,`({width:innerWidth,focus:document.activeElement?.getAttribute('aria-label'),tag:document.activeElement?.tagName,buttons:[...document.querySelectorAll('button[aria-label="More library actions"]')].map(e=>({visible:!!e.getBoundingClientRect().width,focused:e===document.activeElement})),library:document.querySelector('.wk-dashboard')?.dataset.library})`)));
    reports.push({width,saveCopyDraftPreserved:true,panelSaveDraftPreserved:true,headerMenuRetainedDuringComposition:true,ordinaryEscapeStillCloses:true});
  }
  fs.writeFileSync(path.join(screenshotDir,'library-save-composition.json'),JSON.stringify(reports,null,2));
  console.log('Library save composition: desktop/phone destination pickers retain drafts and the header menu ignores input-method Escape; ordinary Escape still closes and restores menu focus.');
}
