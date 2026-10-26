import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {evaluate,navigate,setViewport,waitForExpression} from './browser.mjs';
export async function assertReportGuideKeyboard(cdp,appUrl,screenshotDir) {
 const wait=expression=>waitForExpression(cdp,expression,{label:'Report guide keyboard',diagnose:`({url:location.href,focus:document.activeElement?.getAttribute('aria-label')||document.activeElement?.tagName,guide:!!document.querySelector('[aria-labelledby=report-guide-title]'),report:!!document.querySelector('[aria-labelledby=game-report-title]'),history:history.state})`});
 const press=async(key,modifiers=0)=>{for(const type of ['keyDown','keyUp'])await cdp.send('Input.dispatchKeyEvent',{type,key,code:key==='n'?'KeyN':key,windowsVirtualKeyCode:{F3:114,F8:119,n:78,Tab:9,Escape:27}[key],modifiers})};
 const click=async selector=>{
  const p=await wait(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)return false;e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return r.width&&e.contains(document.elementFromPoint(x,y))?{x,y}:false})()`);
  for(const type of ['mousePressed','mouseReleased'])await cdp.send('Input.dispatchMouseEvent',{type,...p,button:'left',clickCount:1});
 };
 const inside=`document.querySelector('[aria-labelledby=report-guide-title]')?.contains(document.activeElement)`;
 const reportOpen=`!!document.querySelector('[aria-labelledby=game-report-title]')`;
 const guideClosed=`!document.querySelector('[aria-labelledby=report-guide-title]')`;
 const focusReturned=`document.activeElement===document.querySelector('[aria-label="Open report guide"]')`;
 const openGuide=async()=>{await click('[aria-label="Open report guide"]');await wait(`document.activeElement===document.querySelector('[aria-label="Close report guide"]')`)};
 const reports=[];
 for(const width of [1440,390]) {
  const setup=await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`
   localStorage.removeItem('web-katrain:auto_saved_game:v1');localStorage.removeItem('web-katrain:shortcuts:v1');
   localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
   localStorage.setItem('web-katrain:settings:v3',JSON.stringify({soundEnabled:false,loadSgfFastAnalysis:false}));
  `});
  try{await setViewport(cdp,{width,height:width===390?844:900,mobile:width===390});await navigate(cdp,appUrl,15000,{acceptBeforeUnload:true})}
  finally{await cdp.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:setup.result.identifier})}
  await wait('!!document.querySelector("[data-board-snapshot]")');await evaluate(cdp,'document.querySelector("[data-board-snapshot]").focus()');
  await press('F3');await wait(reportOpen);await openGuide();
  for(const modifiers of [0,8])for(let i=0;i<4;i++) {
   await press('Tab',modifiers);
   assert.equal(await evaluate(cdp,inside),true,`${width}: Tab/Shift+Tab must stay in the guide: ${JSON.stringify(await evaluate(cdp,`({label:document.activeElement?.getAttribute('aria-label'),tag:document.activeElement?.tagName})`))}`);
  }
  for(const composition of [{isComposing:true},{keyCode:229}]) {
   const prevented=await evaluate(cdp,`(()=>{const e=new KeyboardEvent('keydown',{bubbles:true,cancelable:true,key:'Escape',...${JSON.stringify(composition)}});document.activeElement.dispatchEvent(e);return e.defaultPrevented})()`);
   assert.equal(await evaluate(cdp,inside),true,'Composition Escape must preserve the guide and focus');assert.equal(prevented,false);
  }
  for(const key of ['n','F8']) {
   await press(key);
   assert.equal(await evaluate(cdp,inside),true,'Background game/settings shortcuts must leave the guide in control');
   assert.equal(await evaluate(cdp,`!!document.querySelector('[aria-labelledby=new-game-title], [aria-labelledby=settings-title]')`),false);
  }
  await press('Escape');await wait(`${guideClosed}&&${reportOpen}&&${focusReturned}`);
  await openGuide();await click('[aria-label="Close report guide"]');await wait(`${guideClosed}&&${reportOpen}&&${focusReturned}`);
  await openGuide();
  assert.equal(await evaluate(cdp,`document.elementFromPoint(5,5)===document.querySelector('[aria-labelledby=report-guide-title]')`),true);
  for(const type of ['mousePressed','mouseReleased'])await cdp.send('Input.dispatchMouseEvent',{type,x:5,y:5,button:'left',clickCount:1});
  await wait(`${guideClosed}&&${reportOpen}&&${focusReturned}`);
  if(width===390) {
   await openGuide();await wait('!!history.state?.webKatrainOverlay');await evaluate(cdp,'history.back()');
   await wait(`${guideClosed}&&${reportOpen}&&${focusReturned}`);
   await wait('!!history.state?.webKatrainOverlay');await evaluate(cdp,'history.back()');
  } else await press('Escape');
  await wait(`!(${reportOpen})&&!history.state?.webKatrainOverlay&&document.activeElement===document.querySelector('[data-board-snapshot]')`);
  assert.deepEqual(await evaluate(cdp,`(()=>{const d=document.querySelector('[data-board-snapshot]').dataset;return {size:d.boardSize,moves:d.boardMoveCount,stones:d.boardStoneCount}})()`),{size:'19',moves:'0',stones:'0'});
  reports.push({width,tabAndShiftTabContained:true,compositionEscapePreserved:true,closeEscapeAndBackdropRestoreGuideButton:true,backgroundShortcutsBlocked:true,mobileBackClosesGuideThenReport:width===390,reportCloseRestoresBoard:true,gameUnchanged:true});
 }
 fs.writeFileSync(path.join(screenshotDir,'report-guide-keyboard.json'),JSON.stringify(reports,null,2));
 console.log('Report guide: desktop/phone Tab/Shift+Tab containment, composition, button/backdrop/Escape focus return, blocked background shortcuts, mobile Back closing guide before report, and unchanged game passed.');
}
