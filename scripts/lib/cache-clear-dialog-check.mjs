import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evaluate, loadedModuleUrl, navigate, setViewport, waitForExpression } from './browser.mjs';

export async function assertCacheClearDialog(cdp, appUrl, screenshotDir) {
  const wait=e=>waitForExpression(cdp,e,{label:'Cache-clear keyboard access'});
  const key=async(key,code,windowsVirtualKeyCode,modifiers=0)=>{
    for(const type of ['keyDown','keyUp']) await cdp.send('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode,modifiers});
  };
  const click=async selector=>{
    const p=await wait(`(()=>{
      const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)return false;
      e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
      return r.width&&e.contains(document.elementFromPoint(x,y))?{x,y}:false;
    })()`);
    for(const type of ['mousePressed','mouseReleased']) await cdp.send('Input.dispatchMouseEvent',{type,...p,button:'left',clickCount:1});
  };
  const setup=await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`
    localStorage.removeItem('web-katrain:auto_saved_game:v1');
    localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');
    localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
  `});
  try {
    await setViewport(cdp,{width:1440,height:900,mobile:false});
    await navigate(cdp,appUrl,15000,{acceptBeforeUnload:true});
  } finally {await cdp.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:setup.result.identifier});}
  await wait('!!document.querySelector("[data-board-snapshot=true]")');
  await evaluate(cdp,`(async()=>{
    const url=${loadedModuleUrl.toString()};window.cacheDialogStore=(await import(url('/src/store/gameStore.ts'))).useGameStore;
    const s=cacheDialogStore.getState();s.updateSettings({soundEnabled:false,loadSgfFastAnalysis:false});
    s.setCurrentNodeNote('Keep this note');
    s.rootNode.analysis={rootWinRate:0.5,rootScoreLead:0,rootVisits:1,moves:[],territory:Array.from({length:19},()=>Array(19).fill(0))};
    cacheDialogStore.setState({treeVersion:cacheDialogStore.getState().treeVersion+1,analysisCacheSize:1});
  })()`);
  const open=async()=>{
    await click('#wk-engine-pill');await click('button[title="Clear cached positions"]');
    await wait(`document.activeElement?.textContent.trim()==='Cancel'&&!!document.querySelector('[data-analysis-cache-clear-confirm]')`);
  };
  const closed=async()=>{
    await wait('!document.querySelector("[data-analysis-cache-clear-confirm]")');
    await wait('document.activeElement===document.querySelector("#wk-engine-pill")');
  };
  await open();
  const focus=[];
  for(const modifiers of [0,8]) {
    for(let i=0;i<8;i++) {
      await key('Tab','Tab',9,modifiers);
      const current=await evaluate(cdp,`({inside:document.querySelector('[data-analysis-cache-clear-confirm]').contains(document.activeElement),label:document.activeElement.getAttribute('aria-label')??document.activeElement.textContent.trim()})`);
      assert.equal(current.inside,true,'Tab and Shift+Tab must stay inside the confirmation');focus.push(current.label);
    }
  }
  await evaluate(cdp,`(()=>{
    for(const composition of [{isComposing:true},{keyCode:229}])document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',...composition,bubbles:true,cancelable:true}));
  })()`);
  assert.equal(await evaluate(cdp,'!!document.querySelector("[data-analysis-cache-clear-confirm]")'),true);
  await key('p','KeyP',80);
  assert.equal(await evaluate(cdp,'cacheDialogStore.getState().moveHistory.length'),0,'A pass shortcut must not run behind the dialog');
  await key('Escape','Escape',27);await closed();
  assert.equal(await evaluate(cdp,'cacheDialogStore.getState().analysisCacheSize'),1,'Cancel must preserve analysis');
  await open();await click('[data-analysis-cache-clear-confirm] .ui-bar:last-child button:first-child');await closed();
  assert.equal(await evaluate(cdp,'cacheDialogStore.getState().analysisCacheSize'),1);
  await open();await click('[data-analysis-cache-clear-confirm] .ui-bar:last-child button:last-child');await closed();
  assert.equal(await evaluate(cdp,'cacheDialogStore.getState().analysisCacheSize'),0);
  assert.equal(await evaluate(cdp,'cacheDialogStore.getState().rootNode.note'),'Keep this note');
  assert.equal(await evaluate(cdp,'cacheDialogStore.getState().moveHistory.length'),0);
  fs.writeFileSync(path.join(screenshotDir,'cache-clear-dialog.json'),JSON.stringify({focus,compositionIgnored:true,backgroundPassBlocked:true,cancelPreservesAnalysis:true,confirmClearsAnalysis:true,focusReturnsToEngine:true},null,2));
  console.log('Cache-clear dialog: Tab/Shift+Tab containment, composition, background shortcuts, Cancel/Clear, and engine-button focus return passed.');
}
