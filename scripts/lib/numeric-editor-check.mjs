import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evaluate, loadedModuleUrl, navigate, setViewport, waitForExpression } from './browser.mjs';

export async function assertNumericEditorComposition(cdp, appUrl, screenshotDir) {
  let mobile = false;
  const wait = e => waitForExpression(cdp,e,{label:'Numeric editor composition'});
  const key = async (key,code,windowsVirtualKeyCode,modifiers=0) => {
    for (const type of ['keyDown','keyUp']) await cdp.send('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode,modifiers});
  };
  const click = async selector => {
    const point = await wait(`(() => {
      const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.getBoundingClientRect().width>0);
      if(!e || e.disabled) return false; e.scrollIntoView({block:'nearest'});
      const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
      return e.contains(document.elementFromPoint(x,y))?{x,y}:false;
    })()`);
    if(mobile) {
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    } else {
      for(const type of ['mousePressed','mouseReleased']) await cdp.send('Input.dispatchMouseEvent',{type,...point,button:'left',clickCount:1});
    }
  };
  const setup = async width => {
    mobile=width===390;
    await setViewport(cdp,{width,height:mobile?844:900,mobile});
    await navigate(cdp,appUrl,15000,{acceptBeforeUnload:true});
    await wait('!!document.querySelector("[data-board-snapshot=true]")');
    await evaluate(cdp,`(async()=>{
      const url=${loadedModuleUrl.toString()};
      window.numericEditorStore=(await import(url('/src/store/gameStore.ts'))).useGameStore;
      numericEditorStore.getState().updateSettings({soundEnabled:false,loadSgfFastAnalysis:false,katagoVisits:16});
      numericEditorStore.getState().startNewGame({boardSize:9,komi:6.5,rules:'japanese',handicap:0});
      for(const point of [[3,3],[4,4],[5,5]]) numericEditorStore.getState().playMove(...point);
    })()`);
  };
  const type = async (selector,text) => {
    await click(selector); await key('a','KeyA',65,2); await cdp.send('Input.insertText',{text});
  };
  const composition = async selector => evaluate(cdp,`(() => {
    const input=document.querySelector(${JSON.stringify(selector)});
    for(const key of ['Enter','Escape']) {
      input.dispatchEvent(new KeyboardEvent('keydown',{key,isComposing:true,bubbles:true,cancelable:true}));
      input.dispatchEvent(new KeyboardEvent('keydown',{key,keyCode:229,bubbles:true,cancelable:true}));
    }
    return input.isConnected && document.activeElement===input;
  })()`);
  const setupScript = await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`
    localStorage.removeItem('web-katrain:auto_saved_game:v1');
    localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');
    localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
  `});
  const results=[];
  try {
    for(const width of [1440,390]) {
      await setup(width);
      if(mobile) await click('.mobile-bottom-move-button');
      const selector='input[aria-label="Move number"]';
      await type(selector,'1');
      assert.equal(await composition(selector),true,'Composition keys must leave move navigation focused');
      assert.equal(await evaluate(cdp,'numericEditorStore.getState().moveHistory.length'),3,'Composition must not navigate');
      await key('Enter','Enter',13);
      await wait('numericEditorStore.getState().moveHistory.length===1');
      results.push({width,moveCompositionIgnored:true,ordinaryEnterNavigates:true});
    }
    await setup(390);
    await evaluate(cdp,`(() => {
      const s=numericEditorStore.getState();s.navigateBack();s.navigateBack();s.playMove(6,6);s.switchToBranchIndex(1);
    })()`);
    await click('button[aria-label="More controls"]');
    await click('[data-bottom-more-sheet=true] button[aria-label^="Branch "]');
    const branch='input[aria-label="Branch number"]';
    await type(branch,'2');
    const originalNode=await evaluate(cdp,'numericEditorStore.getState().currentNode.id');
    assert.equal(await composition(branch),true,'Composition Escape must not dismiss the controls sheet');
    assert.equal(await evaluate(cdp,'numericEditorStore.getState().currentNode.id'),originalNode);
    await key('Enter','Enter',13);
    await wait(`numericEditorStore.getState().currentNode.move?.x===6`);
    await click('[aria-label="Close more controls"]');
    results.push({branchCompositionIgnored:true,ordinaryEnterSwitchesBranch:true});
    // Keep this check independent of neural inference and its network request.
    await evaluate(cdp,'numericEditorStore.setState({runAnalysis:async()=>{},isAnalysisMode:true})');
    await click('[data-analysis-live-depth=true]');
    const depth='input[aria-label="Exact live analysis visits"]';
    await type(depth,'64');
    assert.equal(await composition(depth),true,'Composition keys must leave the live-depth editor open and focused');
    assert.equal(await evaluate(cdp,'numericEditorStore.getState().settings.katagoVisits'),16);
    await key('Enter','Enter',13);
    await wait('numericEditorStore.getState().settings.katagoVisits===64');
    await key('Escape','Escape',27);
    await wait('!document.querySelector("[data-analysis-live-depth-popover=true]")');
    results.push({depthCompositionIgnored:true,ordinaryEnterCommits:true,ordinaryEscapeCloses:true});
  } finally {
    await cdp.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:setupScript.result.identifier});
  }
  fs.writeFileSync(path.join(screenshotDir,'numeric-editor-composition.json'),JSON.stringify(results,null,2));
  console.log('Numeric editors: desktop/phone moves, mobile branch navigation, live visits, IME/Safari keys, and ordinary Enter/Escape passed.');
}
