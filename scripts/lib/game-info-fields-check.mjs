import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evaluate, loadedModuleUrl, navigate, setViewport, waitForExpression } from './browser.mjs';

export async function assertGameInfoNumericEdits(cdp, appUrl, screenshotDir) {
  const wait = (e) => waitForExpression(cdp, e, {label:'Game Info numeric editing'});
  let mobile = true;
  const key = async (key, code, windowsVirtualKeyCode, modifiers = 0) => {
    for (const type of ['keyDown','keyUp']) await cdp.send('Input.dispatchKeyEvent', {type,key,code,windowsVirtualKeyCode,modifiers});
  };
  const click = async (selector) => {
    const point = await wait(`(() => {
      const e=document.querySelector(${JSON.stringify(selector)}); if(!e) return false;
      e.scrollIntoView({block:'nearest'}); const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
      return r.width&&e.contains(document.elementFromPoint(x,y))?{x,y}:false;
    })()`);
    if (mobile) {
      await cdp.send('Input.dispatchTouchEvent', {type:'touchStart',touchPoints:[point]});
      await cdp.send('Input.dispatchTouchEvent', {type:'touchEnd',touchPoints:[]});
    } else {
      for (const type of ['mousePressed','mouseReleased']) await cdp.send('Input.dispatchMouseEvent', {type,...point,button:'left',clickCount:1});
    }
  };
  const setup = await cdp.send('Page.addScriptToEvaluateOnNewDocument', {source:`
    localStorage.removeItem('web-katrain:auto_saved_game:v1');
    localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');
    localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
  `});
  const results = [];
  try {
    await setViewport(cdp, {width:390,height:844,mobile:true});
    await navigate(cdp, appUrl, 15000, { acceptBeforeUnload: true });
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

    mobile = false;
    await setViewport(cdp, {width:1440,height:900,mobile:false});
    for (const [placeholder,draft,property,expected] of [
      ['Black player','Previous game draft','PB','Previous game draft'],
      ['6.5','3.5','KM','3.5'], ['0','3','HA','3'],
    ]) {
      await navigate(cdp,appUrl,15000,{acceptBeforeUnload:true});
      await wait('!!document.querySelector("[data-board-snapshot=true]")');
      await evaluate(cdp, `(async () => {
        const url=${loadedModuleUrl.toString()};
        window.gameInfoKeyStore=(await import(url('/src/store/gameStore.ts'))).useGameStore;
        gameInfoKeyStore.getState().updateSettings({soundEnabled:false,loadSgfFastAnalysis:false});
      })()`);
      if (await evaluate(cdp, `document.querySelector('button[aria-label="Analysis"]').getAttribute('aria-expanded')==='false'`)) await click('button[aria-label="Analysis"]');
      await click('.sidebar .section:first-child .section-head-toggle');
      await click('[data-game-info-edit-toggle]');
      const input=`[data-game-info-edit-form] input[placeholder="${placeholder}"]`;
      await click(input); await key('a','KeyA',65,2); await cdp.send('Input.insertText',{text:draft});
      const originalRoot=await evaluate(cdp,'gameInfoKeyStore.getState().rootNode.id');
      const drop = async () => {
        const point=await evaluate(cdp,`(() => {const r=document.querySelector('[data-board-snapshot=true]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
        for (const type of ['dragEnter','dragOver','drop']) await cdp.send('Input.dispatchDragEvent', {
          type,...point,data:{items:[{mimeType:'text/plain',data:'(;GM[1]SZ[9]PB[Imported player]KM[7.5];B[dd])'}],dragOperationsMask:1},
        });
        await wait('!!document.querySelector("[aria-labelledby=unsaved-changes-title]")');
      };
      await drop();
      assert.equal(await evaluate(cdp,'gameInfoKeyStore.getState().rootNode.id'),originalRoot,'Pending metadata must trigger confirmation before replacement');
      assert.equal(await evaluate(cdp,`gameInfoKeyStore.getState().rootNode.properties?.${property}?.[0]`),expected,'The draft must belong to the old game');
      if (property==='PB') {
        await click('[aria-label="Close unsaved changes dialog"]');
        assert.equal(await evaluate(cdp,'gameInfoKeyStore.getState().rootNode.id'),originalRoot,'Cancel must retain the edited game');
        await drop();
      }
      await click('[aria-labelledby="unsaved-changes-title"] button:nth-of-type(2)');
      await wait(`gameInfoKeyStore.getState().rootNode.id!==${JSON.stringify(originalRoot)}`);
      await click(input); await key('Tab','Tab',9);
      const imported=await evaluate(cdp,`({black:gameInfoKeyStore.getState().rootNode.properties.PB[0],komi:gameInfoKeyStore.getState().komi,handicap:gameInfoKeyStore.getState().rootNode.properties.HA?.[0]??'0'})`);
      assert.deepEqual(imported,{black:'Imported player',komi:7.5,handicap:'0'},'Old metadata drafts must never overwrite the imported game');
      results.push({replacementDraft:property,oldGameConfirmed:true,imported});
    }
    const play = async (x,y) => {
      const point=await evaluate(cdp,`(() => {
        const b=document.querySelector('[data-board-snapshot=true]'),r=b.getBoundingClientRect();
        return {x:r.x+Number(b.dataset.boardOriginX)+${x}*Number(b.dataset.boardCellSize),y:r.y+Number(b.dataset.boardOriginY)+${y}*Number(b.dataset.boardCellSize)};
      })()`);
      for (const type of ['mousePressed','mouseReleased']) await cdp.send('Input.dispatchMouseEvent',{type,...point,button:'left',clickCount:1});
    };
    await play(0,0);
    await key('s','KeyS',83,10);
    await wait('!!document.querySelector("#save-to-library-name")');
    await click('[aria-labelledby="save-to-library-title"] button.ui-accent-bg');
    await wait('!document.querySelector("#save-to-library-name")');
    await play(1,1);
    await click('#wk-file-actions button[aria-label="New game"]');
    await wait('!!document.querySelector("[aria-labelledby=unsaved-changes-title]")');
    await evaluate(cdp,`(() => {
      const open=indexedDB.open.bind(indexedDB); window.metadataHeldSaves=[];
      indexedDB.open=(...args)=>{
        const request=open(...args);
        Object.defineProperty(request,'onsuccess',{set(fn){request.addEventListener('success',e=>metadataHeldSaves.push(()=>fn.call(request,e)),{once:true})}});
        return request;
      };
      window.releaseMetadataSaves=()=>{indexedDB.open=open;metadataHeldSaves.splice(0).forEach(fn=>fn())};
    })()`);
    try {
      await click('[aria-labelledby="unsaved-changes-title"] button.col-span-2');
      await wait('metadataHeldSaves.length>0');
      await click('input[placeholder="Black player"]'); await key('a','KeyA',65,2);
      await cdp.send('Input.insertText',{text:'Latest player during save'});
      await evaluate(cdp,'releaseMetadataSaves()');
      await wait(`document.querySelector('.notification-toast-message')?.textContent.includes('The game changed while saving')`);
      assert.equal(await evaluate(cdp,'!!document.querySelector("[aria-labelledby=new-game-title]")'),false);
      assert.equal(await evaluate(cdp,'gameInfoKeyStore.getState().rootNode.properties.PB[0]'),'Latest player during save');
      await wait(`JSON.parse(localStorage.getItem('web-katrain:auto_saved_game:v1'))?.sgf.includes('PB[Latest player during save]')`);
      results.push({metadataDuringSaveRetained:true,recoveryContainsLatestDraft:true,replacementBlocked:true});
    } finally {
      await evaluate(cdp,'releaseMetadataSaves()');
    }
  } finally {
    await cdp.send('Page.removeScriptToEvaluateOnNewDocument', {identifier:setup.result.identifier});
  }
  fs.writeFileSync(path.join(screenshotDir,'game-info-numeric-edits.json'),JSON.stringify(results,null,2));
  console.log('Game Info: numeric cancel/commit, undo history, composition, drafts during trusted drops, and metadata during a delayed save passed.');
}
