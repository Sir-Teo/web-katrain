import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evaluate, navigate, setViewport, waitForExpression } from './browser.mjs';

export async function assertCommandDialogFocus(cdp, appUrl, screenshotDir) {
  const wait=expression=>waitForExpression(cdp,expression,{label:'Command palette dialog focus',diagnose:`(()=>{
    const input=document.querySelector('[data-command-palette-search]');
    const selected=document.getElementById(input?.getAttribute('aria-activedescendant'));
    return {query:input?.value,active:document.activeElement?.getAttribute('aria-label'),selected:selected?.getAttribute('data-command-palette-item'),
      first:document.querySelector('[role=listbox] [role=option]')?.getAttribute('data-command-palette-item'),
      options:[...document.querySelectorAll('[data-command-palette-item]')].slice(0,4).map(e=>({id:e.dataset.commandPaletteItem,selected:e.getAttribute('aria-selected')}))};
  })()`});
  const key=async(key,code,virtual,modifiers=0)=>{
    for(const type of ['keyDown','keyUp'])await cdp.send('Input.dispatchKeyEvent',{
      type,key,code,windowsVirtualKeyCode:virtual,modifiers,...(type==='keyDown'&&key==='Enter'?{text:'\r'}:{}),
    });
  };
  const click=async selector=>{
    const p=await wait(`(()=>{
      const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)return false;
      e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
      return r.width&&e.contains(document.elementFromPoint(x,y))?{x,y}:false;
    })()`);
    for(const type of ['mousePressed','mouseReleased'])await cdp.send('Input.dispatchMouseEvent',{type,...p,button:'left',clickCount:1});
  };
  const reports=[];
  for(const width of [1440,390,568]) {
    const setup=await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`
      localStorage.removeItem('web-katrain:auto_saved_game:v1');
      localStorage.removeItem('web-katrain:shortcuts:v1');
      localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');
      localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
      localStorage.setItem('web-katrain:settings:v3',JSON.stringify({soundEnabled:false,loadSgfFastAnalysis:false}));
    `});
    try {
      await setViewport(cdp,{width,height:width===568?320:width===390?844:900,mobile:width<1000});
      await navigate(cdp,appUrl,15000,{acceptBeforeUnload:true});
    } finally {await cdp.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:setup.result.identifier});}
    await wait('!!document.querySelector("[data-board-snapshot]")');
    for(const origin of ['board','control']) {
      if(width===568)await evaluate(cdp,"document.documentElement.style.fontSize='200%'");
      const selector=origin==='board'?'[data-board-snapshot]':width<1000?'button[aria-label="Tools"]':'button[aria-label="Settings"]';
      await evaluate(cdp,`window.paletteReturnOrigin=document.querySelector(${JSON.stringify(selector)});paletteReturnOrigin.focus()`);
      await key('k','KeyK',75,2);
      await wait('document.activeElement?.getAttribute("aria-label")==="Search commands"');
      assert.equal(await evaluate(cdp,`[...document.querySelectorAll('[data-command-palette-item]')]
        .filter(e=>!e.disabled&&e.tabIndex>=0).length`),0,'Combobox results must not add a Tab stop for every command');
      await key('ArrowDown','ArrowDown',40);
      assert.equal(await evaluate(cdp,'document.activeElement?.getAttribute("aria-label")'),'Search commands','Arrow navigation must keep focus on the combobox');
      await key('Tab','Tab',9);
      assert.equal(await evaluate(cdp,'document.activeElement?.getAttribute("aria-label")'),'Close command palette','Tab should reach dialog controls without traversing every result');
      await key('Tab','Tab',9,8);
      assert.equal(await evaluate(cdp,'document.activeElement?.getAttribute("aria-label")'),'Search commands');
      await cdp.send('Input.insertText',{text:'settings'});
      await key('Tab','Tab',9);
      assert.equal(await evaluate(cdp,'document.activeElement?.getAttribute("aria-label")'),'Clear command search');
      await key('Tab','Tab',9);
      assert.equal(await evaluate(cdp,'document.activeElement?.getAttribute("aria-label")'),'Close command palette');
      await key('Tab','Tab',9,8);
      assert.equal(await evaluate(cdp,'document.activeElement?.getAttribute("aria-label")'),'Clear command search');
      await key('Enter','Enter',13);
      await wait('document.activeElement?.getAttribute("aria-label")==="Search commands" && document.activeElement.value===""');
      for(let step=0;step<25;step++)await key('ArrowDown','ArrowDown',40);
      const visibleSelection=()=>evaluate(cdp,`(()=>{
        const input=document.querySelector('[data-command-palette-search]');
        const selected=document.getElementById(input.getAttribute('aria-activedescendant'));
        const list=document.querySelector('[role=listbox][aria-label=Commands]');
        const a=selected.getBoundingClientRect(),b=list.getBoundingClientRect();
        return {visible:a.top>=b.top-1&&a.bottom<=b.bottom+1,selectedTop:a.top,selectedBottom:a.bottom,
          listTop:b.top,listBottom:b.bottom,scrollTop:list.scrollTop,searchFocused:document.activeElement===input};
      })()`);
      await evaluate(cdp,'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      const deepSelection=await visibleSelection();
      assert.equal(deepSelection.visible,true,`Keyboard selection must stay in view: ${JSON.stringify(deepSelection)}`);
      assert.equal(deepSelection.searchFocused,true);
      await cdp.send('Input.insertText',{text:'analysis'});
      await wait(`document.getElementById(document.querySelector('[data-command-palette-search]').getAttribute('aria-activedescendant'))
        ===document.querySelector('[role=listbox] [role=option]')`);
      await evaluate(cdp,'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      assert.equal((await visibleSelection()).visible,true,'A filtered list must bring its first selection back into view');
      await key('Escape','Escape',27);
      await wait('!document.querySelector("[data-command-palette]")&&!history.state?.webKatrainOverlay');
      assert.equal(await evaluate(cdp,'document.activeElement===paletteReturnOrigin'),true,'Closing the palette itself must retain its original focus');
      // Destination dialogs have separate reflow checks. Retain this helper's
      // original handoff checks after exercising the enlarged palette itself.
      if(width===568)await evaluate(cdp,"document.documentElement.style.fontSize=''");
      for(const command of [
        {id:'settings-general',query:'general settings',dialog:'settings-title',close:'Close settings'},
        {id:'lessons',query:'lessons',dialog:'lessons-title',close:'Close lessons',keyboard:true},
        {id:'keyboard-help',query:'keyboard',dialog:'keyboard-help-title',close:'Close keyboard shortcuts',escape:true},
        {id:'about',query:'about',dialog:'about-title',close:'Close about dialog',keyboard:true,escape:origin==='board',name:'About Web KaTrain'},
      ]) {
        await key('k','KeyK',75,2);
        await wait('document.activeElement?.getAttribute("aria-label")==="Search commands"');
        await cdp.send('Input.insertText',{text:command.query});
        const option=`[data-command-palette-item="${command.id}"]`;
        await wait(`!!document.querySelector(${JSON.stringify(option)})`);
        if(command.keyboard) {
          await wait(`document.getElementById(document.querySelector('[data-command-palette-search]').getAttribute('aria-activedescendant'))?.dataset.commandPaletteItem==='${command.id}'`);
          await key('Enter','Enter',13);
        } else await click(option);
        await wait(`!!document.querySelector('[aria-labelledby="${command.dialog}"]')&&!document.querySelector('[data-command-palette]')`);
        if(command.name) {
          const dialog=(await cdp.send('Accessibility.getFullAXTree')).result.nodes.find(node=>node.role?.value==='dialog');
          assert.equal(dialog?.name?.value,command.name,'The dialog must announce its purpose as well as the product name');
        }
        if(command.escape)await key('Escape','Escape',27);
        else await click(`[aria-label="${command.close}"]`);
        await wait('!document.querySelector("[role=dialog]")&&!history.state?.webKatrainOverlay');
        await evaluate(cdp,'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
        assert.equal(await evaluate(cdp,'document.activeElement===paletteReturnOrigin'),true,
          `${width}: ${command.id} must return to the original ${origin}, rather than the removed palette item`);
      }
    }
    reports.push({width,paletteTextSize:width===568?'200%':'100%',origins:['board','control'],directPaletteClose:true,
      settingsLessonsHelpAndAboutRestoreOrigin:true,aboutAccessibleName:'About Web KaTrain',pointerAndKeyboardCommands:true,buttonAndEscapeClose:true,
      resultTabStops:0,arrowSelectionKeepsInputFocus:true,tabCyclesSearchCloseAndClear:true,
      deepSelectionVisible:true,filterBringsFirstSelectionIntoView:true});
  }
  fs.writeFileSync(path.join(screenshotDir,'command-dialog-focus.json'),JSON.stringify(reports,null,2));
  console.log('Command palette: desktop/phone compact Tab order, visible keyboard selections, first-match filter resets, and original focus across dialog handoffs passed.');
}
