import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evaluate, loadedModuleUrl, navigate, setViewport, sleep, waitForExpression } from './browser.mjs';

export async function assertNoteDraftRecovery(cdp, appUrl, screenshotDir) {
  let mobile=false;
  const wait=e=>waitForExpression(cdp,e,{label:'Note draft recovery',diagnose:`({width:innerWidth,active:document.activeElement?.getAttribute('aria-label'),dialogs:[...document.querySelectorAll('[role=dialog]')].map(e=>e.getAttribute('aria-labelledby')),editors:[...document.querySelectorAll('[data-note-editor]')].map(e=>{const r=e.getBoundingClientRect();return{rect:r.toJSON(),hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.outerHTML?.slice(0,300)}})})`});
  const key=async(key,code,windowsVirtualKeyCode,modifiers=0)=>{
    for(const type of ['keyDown','keyUp']) await cdp.send('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode,modifiers});
  };
  const click=async selector=>{
    const p=await wait(`(()=>{
      const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)return false;
      e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
      return r.width&&e.contains(document.elementFromPoint(x,y))?{x,y}:false;
    })()`);
    if(mobile) {
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    } else for(const type of ['mousePressed','mouseReleased']) await cdp.send('Input.dispatchMouseEvent',{type,...p,button:'left',clickCount:1});
  };
  const store=()=>evaluate(cdp,`(async()=>{
    const url=${loadedModuleUrl.toString()};window.noteRecoveryStore=(await import(url('/src/store/gameStore.ts'))).useGameStore;
    noteRecoveryStore.getState().updateSettings({soundEnabled:false,loadSgfFastAnalysis:false});
  })()`);
  const fresh=async()=>{
    const setup=await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`
      localStorage.removeItem('web-katrain:auto_saved_game:v1');
      localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');
      localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
    `});
    try {await navigate(cdp,appUrl,15000,{acceptBeforeUnload:true});}
    finally {await cdp.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:setup.result.identifier});}
    await wait('!!document.querySelector("[data-board-snapshot=true]")');await store();
  };
  const command=async(id,query)=>{
    await evaluate(cdp,'document.activeElement?.blur()');await key('k','KeyK',75,2);
    await wait('!!document.querySelector("[data-command-palette-search]")');
    await click('[data-command-palette-search]');await cdp.send('Input.insertText',{text:query});
    await click(`[data-command-palette-item="${id}"]`);
  };
  const typeNote=async text=>{
    if(!await evaluate(cdp,'!!document.querySelector("[data-note-editor=true]")')) await command('edit-note','Edit current note');
    await click('[data-note-editor=true]');await key('a','KeyA',65,2);await cdp.send('Input.insertText',{text});
  };
  const note=()=>evaluate(cdp,'noteRecoveryStore.getState().rootNode.note');
  const snapshot=()=>evaluate(cdp,`JSON.parse(localStorage.getItem('web-katrain:auto_saved_game:v1'))?.sgf`);
  const reports=[];
  for(const width of [1440,390]) {
    mobile=width===390;await setViewport(cdp,{width,height:mobile?844:900,mobile});
    await fresh();
    if(!mobile) {
      await click('.sidebar .section:last-child .section-head-toggle');
      await key('F','KeyF',70,8);await wait('!!document.querySelector("[data-focus=on]")');
      await key('c','KeyC',67);
      await wait(`document.querySelector('[data-focus]')?.dataset.focus==='off'&&document.activeElement===document.querySelector('[data-note-editor]')`);
      assert.equal(await evaluate(cdp,"document.querySelector('.sidebar .section:last-child .section-head-toggle').getAttribute('aria-expanded')"),'true');
    } else await typeNote('');
    await navigate(cdp,appUrl);
    await wait('!!document.querySelector("[data-board-snapshot=true]")');await store();
    assert.equal(await evaluate(cdp,'!!document.querySelector("[aria-labelledby=auto-save-recovery-title]")'),false,'Opening an unchanged editor must not create recovery or warn on reload');
    await typeNote('Unfinished reload note');
    await evaluate(cdp,`(()=>{
      const editor=document.querySelector('[data-note-editor]');
      for(const composition of [{isComposing:true},{keyCode:229}]) {
        for(const key of ['Enter','Escape','s']) editor.dispatchEvent(new KeyboardEvent('keydown',{key,ctrlKey:key==='s',...composition,bubbles:true,cancelable:true}));
      }
    })()`);
    assert.equal(await evaluate(cdp,"document.activeElement===document.querySelector('[data-note-editor]')"),true,'Composition keys must leave the note editor active');
    assert.equal(await note(),'','Typing alone must remain a cancellable draft');
    await assert.rejects(navigate(cdp,appUrl),/Navigation blocked by beforeunload/);
    assert.equal(await note(),'Unfinished reload note','Reload must include the open draft in its unsaved check');
    await navigate(cdp,appUrl,15000,{acceptBeforeUnload:true});
    await wait('!!document.querySelector("[aria-labelledby=auto-save-recovery-title]")');
    assert.ok((await snapshot()).includes('C[Unfinished reload note'));
    await click('[aria-labelledby="auto-save-recovery-title"] button.active');
    await wait('!document.querySelector("[aria-labelledby=auto-save-recovery-title]")');await store();
    assert.equal(await note(),'Unfinished reload note');
    await typeNote('Later pagehide note');await sleep(650);
    await evaluate(cdp,"window.dispatchEvent(new PageTransitionEvent('pagehide'))");
    assert.ok((await snapshot()).includes('C[Later pagehide note'));
    await typeNote('Canceled text');await key('Escape','Escape',27);
    await evaluate(cdp,"window.dispatchEvent(new PageTransitionEvent('pagehide'))");
    assert.ok(!(await snapshot()).includes('Canceled text'),'Escape must still discard an ordinary draft');
    assert.equal(await note(),'Later pagehide note');

    await fresh();await typeNote('Note included in saved copy');
    await command('save-library','Save copy to library');
    await wait('!!document.querySelector("#save-to-library-name")');
    await click('[aria-labelledby="save-to-library-title"] > .ui-bar:last-child button:last-child');
    await wait('!document.querySelector("[aria-labelledby=save-to-library-title]")');
    assert.equal(await note(),'Note included in saved copy');
    const persisted=await evaluate(cdp,`(async()=>{
      const url=${loadedModuleUrl.toString()};const {loadLibrary}=await import(url('/src/utils/library.ts'));
      return (await loadLibrary()).some(item=>item.type==='file'&&item.sgf.includes('C[Note included in saved copy'));
    })()`);
    assert.equal(persisted,true,'Save Copy must include a draft even after opening the palette blurs it');

    await evaluate(cdp,`(()=>{
      window.noteOriginalClipboard=Object.getOwnPropertyDescriptor(navigator,'clipboard');
      Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.noteDraftCopied=text}}});
    })()`);
    try {
      await typeNote('Note included in copied SGF');await command('copy-sgf','Copy SGF');
      await wait("window.noteDraftCopied?.includes('C[Note included in copied SGF')");
      await typeNote('Note included in copy shortcut');await evaluate(cdp,'document.activeElement?.blur()');
      await key('c','KeyC',67,2);
      await wait("window.noteDraftCopied?.includes('C[Note included in copy shortcut')");
      await typeNote('Note included in shared SGF');await command('copy-share-link','Copy share link');
      const shared=await evaluate(cdp,`(async()=>{
        const {decodeSgfFromShareUrl}=await import('/src/utils/shareLink.ts');
        return decodeSgfFromShareUrl(window.noteDraftCopied);
      })()`);
      assert.ok(shared?.includes('C[Note included in shared SGF'),'Share links must include the pending note');
    } finally {
      await evaluate(cdp,`(()=>{
        if(window.noteOriginalClipboard)Object.defineProperty(navigator,'clipboard',window.noteOriginalClipboard);
        else delete navigator.clipboard;
        delete window.noteOriginalClipboard;delete window.noteDraftCopied;
      })()`);
    }

    if(mobile) {
      await typeNote('Draft retained across phone tabs');
      await click('#mobile-tab-board');await click('#mobile-tab-info');
      assert.equal(await note(),'Draft retained across phone tabs','Closing the phone panel must preserve its draft on the same node');
      assert.equal(await evaluate(cdp,"document.querySelector('[data-note-editor]')?.value??document.querySelector('[data-note-preview]')?.textContent"),'Draft retained across phone tabs');
      await typeNote('Canceled before switching tabs');await key('Escape','Escape',27);
      await click('#mobile-tab-board');await click('#mobile-tab-info');
      assert.equal(await note(),'Draft retained across phone tabs','Closing a canceled editor must not save its discarded text');
      await typeNote('Draft retained across shell resize');
      await setViewport(cdp,{width:1440,height:900,mobile:false});
      await wait('!!document.querySelector(".dashboard") || !!document.querySelector("[data-focus]")');
      assert.equal(await note(),'Draft retained across shell resize','Switching shells must retain the phone draft');
      await wait(`(document.querySelector('[data-note-editor]')?.value??document.querySelector('[data-note-preview]')?.textContent)==='Draft retained across shell resize'`);
      await setViewport(cdp,{width,height:844,mobile:true});
      await wait('!!document.querySelector("#mobile-tab-info")');
      await wait(`(document.querySelector('[data-note-editor]')?.value??document.querySelector('[data-note-preview]')?.textContent)==='Draft retained across shell resize'`);
      await evaluate(cdp,"window.dispatchEvent(new PageTransitionEvent('pagehide'))");
      assert.equal(await note(),'Draft retained across shell resize');
    }

    if(!mobile) {
      await fresh();await typeNote('Old game draft');
      const original=await evaluate(cdp,'noteRecoveryStore.getState().rootNode.id');
      const drop=async()=>{
        const p=await evaluate(cdp,`(()=>{const r=document.querySelector('[data-board-snapshot=true]').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
        for(const type of ['dragEnter','dragOver','drop']) await cdp.send('Input.dispatchDragEvent',{
          type,...p,data:{items:[{mimeType:'text/plain',data:'(;SZ[9]PB[Imported];B[dd])'}],dragOperationsMask:1},
        });
        await wait('!!document.querySelector("[aria-labelledby=unsaved-changes-title]")');
      };
      await drop();assert.equal(await note(),'Old game draft');
      await click('[aria-label="Close unsaved changes dialog"]');
      assert.equal(await evaluate(cdp,'noteRecoveryStore.getState().rootNode.id'),original);
      await drop();await click('[aria-labelledby="unsaved-changes-title"] button:nth-of-type(2)');
      await wait(`noteRecoveryStore.getState().rootNode.id!==${JSON.stringify(original)}`);
      assert.equal(await note(),'','The old note must never overwrite the imported game');
    }
    reports.push({width,editRequestWorks:true,unchangedDraftStaysClean:true,reloadProtected:true,restored:true,pagehideSaved:true,escapeCancels:true,savedCopyIncludesDraft:true,phoneTabsChecked:mobile,trustedDropChecked:!mobile});
  }
  fs.writeFileSync(path.join(screenshotDir,'note-draft-recovery.json'),JSON.stringify(reports,null,2));
  console.log('Note drafts: edit access, reload/restore, pagehide, cancellation, Save Copy, clipboard/share, tab/resize retention, and trusted replacement passed.');
}
