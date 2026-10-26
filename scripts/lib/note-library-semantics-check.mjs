import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evaluate, navigate, setViewport, waitForExpression } from './browser.mjs';

export async function assertNoteLibrarySemantics(cdp, appUrl, screenshotDir) {
  const wait = expression => waitForExpression(cdp, expression, { label:'Note and Library accessible semantics' });
  const key = async (key,code,virtual,modifiers=0) => {
    for (const type of ['keyDown','keyUp']) await cdp.send('Input.dispatchKeyEvent', {
      type,key,code,windowsVirtualKeyCode:virtual,modifiers,
      ...(type==='keyDown'&&key==='Enter'?{text:'\r'}:{}),
    });
  };
  const click = async selector => {
    const point = await wait(`(() => {
      const e=document.querySelector(${JSON.stringify(selector)});
      if(!e||e.disabled)return false;
      e.scrollIntoView({block:'nearest'});
      const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
      return r.width&&e.contains(document.elementFromPoint(x,y))?{x,y}:false;
    })()`);
    for(const type of ['mousePressed','mouseReleased']) await cdp.send('Input.dispatchMouseEvent',{type,...point,button:'left',clickCount:1});
  };
  const reports=[];
  for(const width of [1440,390]) {
    const setup=await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`
      localStorage.removeItem('web-katrain:auto_saved_game:v1');
      localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');
      localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
      localStorage.setItem('web-katrain:library_open:v1','true');
      localStorage.setItem('web-katrain:settings:v3',JSON.stringify({soundEnabled:false,loadSgfFastAnalysis:false}));
      window.libraryLoadingSemantics=[];
      const observer=new MutationObserver(()=>{
        const badge=document.querySelector('[data-library-storage-badge]');
        const list=document.querySelector('.library-tree');
        if(badge?.textContent==='Loading'&&list) libraryLoadingSemantics.push({role:list.getAttribute('role'),busy:list.getAttribute('aria-busy')});
        if(badge?.textContent==='IndexedDB') observer.disconnect();
      });
      observer.observe(document,{childList:true,subtree:true,attributes:true});
    `});
    try {
      await setViewport(cdp,{width,height:width===390?844:900,mobile:width===390});
      await navigate(cdp,appUrl,15000,{acceptBeforeUnload:true});
    } finally {
      await cdp.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:setup.result.identifier});
    }
    await wait('!!document.querySelector("[data-board-snapshot]")');
    if(width===390) await click('#mobile-tab-library');
    await wait('document.querySelector("[data-library-storage-badge]")?.textContent==="IndexedDB"');
    const loading=await evaluate(cdp,'libraryLoadingSemantics');
    assert.ok(loading.length>0,'Observe the initial loading state before checking its semantics');
    assert.ok(loading.every(state=>state.role==='group'&&state.busy==='true'));
    assert.equal(await evaluate(cdp,'document.querySelector(".library-tree").getAttribute("role")'),'tree');
    await click('[aria-label="Search library"]');
    await cdp.send('Input.insertText',{text:'no-match-a11y-fixture-49327'});
    await wait('!document.querySelector("[data-library-row]")');
    assert.deepEqual(await evaluate(cdp,`(() => {
      const list=document.querySelector('.library-tree');
      return {role:list.getAttribute('role'),busy:list.getAttribute('aria-busy')};
    })()`),{role:'group',busy:'false'});
    await click('[data-library-reset-filters]');
    await wait('document.querySelector(".library-tree")?.getAttribute("role")==="tree"');

    await evaluate(cdp,'document.activeElement?.blur()');
    await key('k','KeyK',75,2);
    await wait('document.activeElement?.getAttribute("aria-label")==="Search commands"');
    await cdp.send('Input.insertText',{text:'Edit current note'});
    await click('[data-command-palette-item=edit-note]');
    await wait('!!document.querySelector("[data-note-editor]")');
    await key('Escape','Escape',27);
    await wait('!!document.querySelector("[data-note-preview][role=button]")');
    const documentRoot=(await cdp.send('DOM.getDocument')).result.root;
    const nodeId=(await cdp.send('DOM.querySelector',{nodeId:documentRoot.nodeId,selector:'[data-note-preview][role=button]'})).result.nodeId;
    const ax=(await cdp.send('Accessibility.getPartialAXTree',{nodeId,fetchRelatives:false})).result.nodes[0];
    const visibleText=await evaluate(cdp,String.raw`document.querySelector('[data-note-preview]').innerText.replace(/\s+/g,' ').trim()`);
    assert.equal(ax.role.value,'button');
    assert.equal(ax.name.value.replace(/\s+/g,' ').trim(),visibleText,'The note action name must contain all its visible prompt text');
    assert.ok(ax.name.value.startsWith('Add a note'));
    await evaluate(cdp,'document.querySelector("[data-note-preview]").focus()');
    for(const init of [{key:'Enter',isComposing:true},{key:'Enter',keyCode:229},
      {key:' ',isComposing:true},{key:' ',keyCode:229}]) {
      const state=await evaluate(cdp,`(async()=>{
        const event=new KeyboardEvent('keydown',{...${JSON.stringify(init)},bubbles:true,cancelable:true});
        document.activeElement.dispatchEvent(event);
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        return {editing:!!document.querySelector('[data-note-editor]'),prevented:event.defaultPrevented};
      })()`);
      assert.deepEqual(state,{editing:false,prevented:false},`Composition must retain the note prompt: ${JSON.stringify(init)}`);
    }
    await key('Enter','Enter',13);
    await wait('document.activeElement===document.querySelector("[data-note-editor]")');
    await key('Escape','Escape',27);
    reports.push({width,loadingIsBusyGroup:true,noMatchesIsGroup:true,resultsRestoreTree:true,
      noteName:ax.name.value,noteKeyboardActivation:true});
  }
  fs.writeFileSync(path.join(screenshotDir,'note-library-semantics.json'),JSON.stringify(reports,null,2));
  console.log('Accessible semantics: desktop/phone busy Library loading, empty search groups, restored trees, exact note prompt names, and keyboard editing passed.');
}
