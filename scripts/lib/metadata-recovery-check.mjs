import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evaluate, loadedModuleUrl, navigate, setViewport, sleep, waitForExpression } from './browser.mjs';

export async function assertMetadataRecovery(cdp, appUrl, screenshotDir) {
  const wait=e=>waitForExpression(cdp,e,{label:'Focused metadata recovery'});
  const key=async(key,code,windowsVirtualKeyCode,modifiers=0)=>{
    for(const type of ['keyDown','keyUp']) await cdp.send('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode,modifiers});
  };
  const click=async selector=>{
    const p=await wait(`(() => {
      const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)return false;
      e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
      return r.width&&e.contains(document.elementFromPoint(x,y))?{x,y}:false;
    })()`);
    for(const type of ['mousePressed','mouseReleased']) await cdp.send('Input.dispatchMouseEvent',{type,...p,button:'left',clickCount:1});
  };
  const store=()=>evaluate(cdp,`(async()=>{
    const url=${loadedModuleUrl.toString()};window.metadataRecoveryStore=(await import(url('/src/store/gameStore.ts'))).useGameStore;
    metadataRecoveryStore.getState().updateSettings({soundEnabled:false,loadSgfFastAnalysis:false});
  })()`);
  const openInfo=async()=>{
    if(await evaluate(cdp,`document.querySelector('button[aria-label="Analysis"]').getAttribute('aria-expanded')==='false'`)) await click('button[aria-label="Analysis"]');
    await click('.sidebar .section:first-child .section-head-toggle');
    await click('[data-game-info-edit-toggle]');
  };
  const type=async(placeholder,text)=>{
    await click(`input[placeholder="${placeholder}"]`);await key('a','KeyA',65,2);await cdp.send('Input.insertText',{text});
  };
  const setup=await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`
    localStorage.removeItem('web-katrain:auto_saved_game:v1');
    localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');
    localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
  `});
  try {
    await setViewport(cdp,{width:1440,height:900,mobile:false});
    await navigate(cdp,appUrl,15000,{acceptBeforeUnload:true});
  } finally {
    // The next navigation must read the real pagehide snapshot rather than
    // having this fixture setup erase the evidence in the arriving page.
    await cdp.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:setup.result.identifier});
  }
  await wait('!!document.querySelector("[data-board-snapshot=true]")');
  await store();await openInfo();
  await type('Black player','Uncommitted reload player');
  const originalRoot=await evaluate(cdp,'metadataRecoveryStore.getState().rootNode.id');
  await assert.rejects(navigate(cdp,appUrl),/Navigation blocked by beforeunload/);
  assert.equal(await evaluate(cdp,'metadataRecoveryStore.getState().rootNode.id'),originalRoot);
  assert.equal(await evaluate(cdp,'metadataRecoveryStore.getState().rootNode.properties.PB[0]'),'Uncommitted reload player');
  await navigate(cdp,appUrl,15000,{acceptBeforeUnload:true});
  await wait('!!document.querySelector("[aria-labelledby=auto-save-recovery-title]")');
  const reloaded=await evaluate(cdp,`JSON.parse(localStorage.getItem('web-katrain:auto_saved_game:v1')).sgf`);
  assert.ok(reloaded.includes('PB[Uncommitted reload player]'),'Accepted reload must retain the focused draft in recovery');
  await click('[aria-labelledby="auto-save-recovery-title"] button.active');
  await wait('!document.querySelector("[aria-labelledby=auto-save-recovery-title]")');
  await store();
  assert.equal(await evaluate(cdp,'metadataRecoveryStore.getState().rootNode.properties.PB[0]'),'Uncommitted reload player');
  await openInfo();
  const snapshots=[];
  for(const [placeholder,text,property] of [['6.5','3.5','KM'],['0','3','HA']]) {
    // Let the existing version's debounce run before typing a new draft.
    // A one-time written flag must not suppress this later lifecycle flush.
    await sleep(650);
    await type(placeholder,text);
    const sgf=await evaluate(cdp,`(() => {
      window.dispatchEvent(new PageTransitionEvent('pagehide'));
      return JSON.parse(localStorage.getItem('web-katrain:auto_saved_game:v1'))?.sgf;
    })()`);
    assert.ok(sgf?.includes(`${property}[${text}]`),`${property} must reach recovery synchronously when the page is hidden`);
    assert.ok(sgf.includes('PB[Uncommitted reload player]'),'Other recovered metadata must remain intact');
    snapshots.push({property,sgf});
  }
  fs.writeFileSync(path.join(screenshotDir,'metadata-recovery.json'),JSON.stringify({navigationCanceled:true,reloaded,snapshots},null,2));
  console.log('Metadata recovery: native reload cancellation, accepted reload/restore, and later komi/handicap pagehide flushes passed.');
}
