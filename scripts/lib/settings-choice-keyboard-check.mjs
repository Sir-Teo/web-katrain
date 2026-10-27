import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {evaluate,navigate,setViewport,waitForExpression} from './browser.mjs';
export async function assertSettingsChoiceKeyboard(cdp,appUrl,screenshotDir) {
 const wait=expression=>waitForExpression(cdp,expression,{label:'Settings choice keyboard',diagnose:`({tab:document.querySelector('[role=tab][aria-selected=true]')?.id,backend:document.querySelector('[data-katago-backend-option][aria-checked=true]')?.dataset.katagoBackendOption,theme:document.querySelector('[data-board-theme-choice][aria-checked=true]')?.dataset.boardThemeChoice,focus:document.activeElement?.getAttribute('aria-label')||document.activeElement?.dataset})`});
 const press=async(key,code=key,windowsVirtualKeyCode={F8:119,ArrowLeft:37,ArrowRight:39,ArrowUp:38,ArrowDown:40,Home:36,End:35,Escape:27,Enter:13}[key])=>{
  for(const type of ['keyDown','keyUp'])await cdp.send('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode,...(key==='Enter'&&type==='keyDown'?{text:'\r'}:{})});
 };
 const click=async selector=>{
  const p=await wait(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)return false;e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return r.width&&e.contains(document.elementFromPoint(x,y))?{x,y}:false})()`);
  for(const type of ['mousePressed','mouseReleased'])await cdp.send('Input.dispatchMouseEvent',{type,...p,button:'left',clickCount:1});
 };
 const snapshot=`({prefs:localStorage.getItem('web-katrain:settings:v3'),tab:document.querySelector('[role=tab][aria-selected=true]')?.id,
   backend:document.querySelector('[data-katago-backend-option][aria-checked=true]')?.dataset.katagoBackendOption,
   theme:document.querySelector('[data-board-theme-choice][aria-checked=true]')?.dataset.boardThemeChoice})`;
 const guards=async(selector,keys)=>{
  await evaluate(cdp,`document.querySelector(${JSON.stringify(selector)}).focus()`);
  const before=await evaluate(cdp,snapshot);
  for(const init of [{isComposing:true},{keyCode:229},{ctrlKey:true},{altKey:true},{metaKey:true}])for(const key of keys) {
   const result=await evaluate(cdp,`(async()=>{
    const focus=document.activeElement,event=new KeyboardEvent('keydown',{bubbles:true,cancelable:true,key:${JSON.stringify(key)},...${JSON.stringify(init)}});
    focus.dispatchEvent(event);await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    return {state:${snapshot},focused:document.activeElement===focus,prevented:event.defaultPrevented};
   })()`);
   assert.deepEqual(result.state,before,`${selector}: ${JSON.stringify(init)} ${key} must not change a choice`);
   assert.equal(result.focused,true,'Composition/modifier input must preserve focus');
   assert.equal(result.prevented,false,'Ignored keys must remain available to their input method or browser');
  }
 };
 const reports=[];
 for(const width of [1440,390]) {
  const setup=await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`
   localStorage.removeItem('web-katrain:auto_saved_game:v1');localStorage.removeItem('web-katrain:shortcuts:v1');
   localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
   localStorage.setItem('web-katrain:settings:v3',JSON.stringify({soundEnabled:false,loadSgfFastAnalysis:false,katagoBackend:'wasm'}));
  `});
  try{await setViewport(cdp,{width,height:width===390?844:900,mobile:width===390});await navigate(cdp,appUrl,15000,{acceptBeforeUnload:true})}
  finally{await cdp.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:setup.result.identifier})}
  await wait('!!document.querySelector("[data-board-snapshot]")');await evaluate(cdp,'document.activeElement?.blur()');await press('F8');
  await click('#tab-ai');await click('[data-katago-backend-option=wasm]');
  await guards('[data-katago-backend-option=wasm]',['ArrowDown','ArrowUp','ArrowLeft','ArrowRight','Home','End','Enter',' ']);
  const availableBackends=await evaluate(cdp,`[...document.querySelectorAll('[data-katago-backend-option][data-katago-backend-available=true]')].map(e=>e.dataset.katagoBackendOption)`);
  await press('End');await evaluate(cdp,'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  assert.equal(await evaluate(cdp,`document.activeElement?.dataset.katagoBackendOption`),availableBackends.at(-1),'End must focus the last available backend');
  assert.equal(await evaluate(cdp,`document.activeElement?.getAttribute('aria-checked')`),'true');
  await press('Home');await wait(`document.activeElement?.dataset.katagoBackendOption===${JSON.stringify(availableBackends[0])}&&document.activeElement.getAttribute('aria-checked')==='true'`);
  await click('[data-katago-backend-option=wasm]');
  await press('ArrowDown');await wait(`document.querySelector('[data-katago-backend-option=cpu]')?.getAttribute('aria-checked')==='true'&&document.activeElement?.dataset.katagoBackendOption==='cpu'`);
  await press('ArrowUp');await wait(`document.querySelector('[data-katago-backend-option=wasm]')?.getAttribute('aria-checked')==='true'&&document.activeElement?.dataset.katagoBackendOption==='wasm'`);
  await click('#tab-general');
  await click('[data-board-theme-disclosure] summary');
  await guards('[data-board-theme-choice][aria-checked=true]',['ArrowDown','ArrowUp','ArrowLeft','ArrowRight','Home','End']);
  const themes=await evaluate(cdp,`[...document.querySelectorAll('[data-board-theme-choice]')].map(e=>e.dataset.boardThemeChoice)`);
  await press('Home');await wait(`document.activeElement?.dataset.boardThemeChoice===${JSON.stringify(themes[0])}&&document.activeElement.getAttribute('aria-checked')==='true'`);
  await press('End');await wait(`document.activeElement?.dataset.boardThemeChoice===${JSON.stringify(themes.at(-1))}&&document.activeElement.getAttribute('aria-checked')==='true'`);
  await click('#settings-search-input');await cdp.send('Input.insertText',{text:'board theme'});
  await wait('!!document.querySelector("#settings-search-result-0")');await press('Enter');
  await wait(`document.activeElement?.dataset.boardThemeChoice===${JSON.stringify(themes.at(-1))}`);
  const searchVisibility=await evaluate(cdp,`(async()=>{
   const pane=document.querySelector('.settings-modal-content');let previous=pane.scrollTop,stable=0;const start=performance.now();
   while(stable<4||performance.now()-start<500){await new Promise(resolve=>requestAnimationFrame(resolve));const next=pane.scrollTop;stable=Math.abs(next-previous)<.5?stable+1:0;previous=next;}
   const target=document.activeElement.getBoundingClientRect(),bounds=pane.getBoundingClientRect();
   return {visible:Math.max(0,Math.min(target.bottom,bounds.bottom)-Math.max(target.top,bounds.top)),required:Math.min(target.height,bounds.height)};
  })()`);
  assert.ok(searchVisibility.visible>=searchVisibility.required-2,'Settings search must reveal its focused radio after scrolling settles');
  await press('ArrowRight');await wait(`document.activeElement?.dataset.boardThemeChoice===${JSON.stringify(themes[0])}&&document.activeElement.getAttribute('aria-checked')==='true'`);
  await click('#tab-general');await guards('#tab-general',['ArrowRight','ArrowLeft','Home','End']);
  for(const [key,id] of [['ArrowRight','analysis'],['End','shortcuts'],['Home','general'],['ArrowLeft','shortcuts']]) {
   await press(key);await wait(`document.activeElement?.id==='tab-${id}'&&document.activeElement.getAttribute('aria-selected')==='true'`);
  }
  await click('[aria-label="Close settings"]');await wait('!document.querySelector("[aria-labelledby=settings-title]")&&!history.state?.webKatrainOverlay');
  reports.push({width,compositionAndModifierKeysPreserveSettingsAndFocus:true,backendArrowsStillSelect:true,backendHomeEndSelectAvailableEndpoints:true,availableBackends,themeHomeEndAndWrapRetained:true,themeSearchKeepsFocusedChoiceVisible:true,tabHomeEndAndWrapRetained:true});
 }
 fs.writeFileSync(path.join(screenshotDir,'settings-choice-keyboard.json'),JSON.stringify(reports,null,2));
 console.log('Settings choices: desktop/phone composition/modifier keys preserve backend/theme/tab selection and focus; ordinary arrows, Home/End and wrapping still work.');
}
