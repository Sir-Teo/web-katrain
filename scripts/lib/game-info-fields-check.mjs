import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evaluate, loadedModuleUrl, navigate, setViewport, waitForExpression } from './browser.mjs';

export async function assertGameInfoNumericEdits(cdp, appUrl, screenshotDir) {
  const wait = (e) => waitForExpression(cdp, e, {label:'Game Info numeric editing'});
  const key = async (key, code, windowsVirtualKeyCode, modifiers = 0) => {
    for (const type of ['keyDown','keyUp']) await cdp.send('Input.dispatchKeyEvent', {type,key,code,windowsVirtualKeyCode,modifiers});
  };
  const click = async (selector) => {
    const point = await wait(`(() => {
      const e=document.querySelector(${JSON.stringify(selector)}); if(!e) return false;
      e.scrollIntoView({block:'nearest'}); const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
      return r.width&&e.contains(document.elementFromPoint(x,y))?{x,y}:false;
    })()`);
    await cdp.send('Input.dispatchTouchEvent', {type:'touchStart',touchPoints:[point]});
    await cdp.send('Input.dispatchTouchEvent', {type:'touchEnd',touchPoints:[]});
  };
  const setup = await cdp.send('Page.addScriptToEvaluateOnNewDocument', {source:`
    localStorage.removeItem('web-katrain:auto_saved_game:v1');
    localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');
    localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
  `});
  const results = [];
  try {
    await setViewport(cdp, {width:390,height:844,mobile:true});
    await navigate(cdp, appUrl);
    await wait('!!document.querySelector("[data-board-snapshot=true]")');
    await evaluate(cdp, `(async () => {
      const url=${loadedModuleUrl.toString()};
      window.gameInfoKeyStore=(await import(url('/src/store/gameStore.ts'))).useGameStore;
      gameInfoKeyStore.getState().startNewGame({boardSize:19,komi:6.5,rules:'japanese',handicap:0});
      gameInfoKeyStore.getState().updateSettings({soundEnabled:false,loadSgfFastAnalysis:false});
    })()`);
    await click('#mobile-tab-info');
    await click('[data-game-info-edit-toggle]');
    await wait('!!document.querySelector("[data-game-info-edit-form]")');
    const selector = (field) => `[data-game-info-edit-form] input[placeholder="${field==='komi'?'6.5':'0'}"]`;
    const read = () => evaluate(cdp, `(() => {
      const s=gameInfoKeyStore.getState();
      return {komi:s.komi,handicap:s.rootNode.properties?.HA?.[0]??'0',undo:s.editUndoCount,redo:s.editRedoCount,
        stones:document.querySelector('[data-board-snapshot=true]').dataset.boardStones};
    })()`);
    for (const [field,text,end,expected] of [
      ['komi','25','Escape',null], ['handicap','4','Escape',null],
      ['komi','','Tab',null], ['komi','invalid','Tab',null], ['komi','1001','Enter',null],
      ['komi','7.5','Enter',7.5], ['komi','0','Enter',0], ['komi','-3','Tab',-3],
      ['handicap','2','Enter','2'], ['handicap','4','Escape',null], ['handicap','','Tab',null],
    ]) {
      const before=await read();
      await click(selector(field)); await key('a','KeyA',65,2);
      await cdp.send('Input.insertText', {text});
      await key(end,end,end==='Escape'?27:end==='Enter'?13:9);
      const after=await read();
      if (expected===null) assert.deepEqual(after,before,`${field} ${JSON.stringify(text)} + ${end} must preserve the game and undo history`);
      else assert.equal(after[field],expected,`${field} must commit a valid draft`);
      const input=await evaluate(cdp, `document.querySelector(${JSON.stringify(selector(field))}).value`);
      assert.equal(input,String(after[field]),'A finished edit must show its committed value');
      results.push({field,text,end,before,after});
    }
    await click(selector('komi')); await key('a','KeyA',65,2); await cdp.send('Input.insertText',{text:'25'});
    const before=await read();
    await evaluate(cdp, `(() => {
      const input=document.querySelector(${JSON.stringify(selector('komi'))});
      for(const key of ['Enter','Escape']) input.dispatchEvent(new KeyboardEvent('keydown',{key,isComposing:true,bubbles:true,cancelable:true}));
    })()`);
    assert.deepEqual(await read(),before,'IME confirmation keys must leave the game untouched');
    assert.equal(await evaluate(cdp,`document.activeElement===document.querySelector(${JSON.stringify(selector('komi'))})`),true);
    await key('Escape','Escape',27);
    assert.deepEqual(await read(),before,'Ordinary Escape after composition must still cancel');
    results.push({compositionKeysPreserveFocusAndGame:true});
  } finally {
    await cdp.send('Page.removeScriptToEvaluateOnNewDocument', {identifier:setup.result.identifier});
  }
  fs.writeFileSync(path.join(screenshotDir,'game-info-numeric-edits.json'),JSON.stringify(results,null,2));
  console.log('Game Info: numeric Escape, empty/invalid drafts, valid zero/negative komi, handicap commits, undo history, and composition passed.');
}
