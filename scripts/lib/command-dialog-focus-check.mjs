import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evaluate, navigate, setViewport, waitForExpression } from './browser.mjs';

export async function assertCommandDialogFocus(cdp, appUrl, screenshotDir) {
  const wait=expression=>waitForExpression(cdp,expression,{label:'Command palette dialog focus'});
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
  for(const width of [1440,390]) {
    const setup=await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`
      localStorage.removeItem('web-katrain:auto_saved_game:v1');
      localStorage.removeItem('web-katrain:shortcuts:v1');
      localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');
      localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
      localStorage.setItem('web-katrain:settings:v3',JSON.stringify({soundEnabled:false,loadSgfFastAnalysis:false}));
    `});
    try {
      await setViewport(cdp,{width,height:width===390?844:900,mobile:width===390});
      await navigate(cdp,appUrl,15000,{acceptBeforeUnload:true});
    } finally {await cdp.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:setup.result.identifier});}
    await wait('!!document.querySelector("[data-board-snapshot]")');
    for(const origin of ['board','control']) {
      const selector=origin==='board'?'[data-board-snapshot]':width===390?'button[aria-label="Tools"]':'button[aria-label="Settings"]';
      await evaluate(cdp,`window.paletteReturnOrigin=document.querySelector(${JSON.stringify(selector)});paletteReturnOrigin.focus()`);
      await key('k','KeyK',75,2);
      await wait('document.activeElement?.getAttribute("aria-label")==="Search commands"');
      await key('Escape','Escape',27);
      await wait('!document.querySelector("[data-command-palette]")&&!history.state?.webKatrainOverlay');
      assert.equal(await evaluate(cdp,'document.activeElement===paletteReturnOrigin'),true,'Closing the palette itself must retain its original focus');
      for(const command of [
        {id:'settings-general',query:'general settings',dialog:'settings-title',close:'Close settings'},
        {id:'lessons',query:'lessons',dialog:'lessons-title',close:'Close lessons',keyboard:true},
        {id:'keyboard-help',query:'keyboard',dialog:'keyboard-help-title',close:'Close keyboard shortcuts',escape:true},
      ]) {
        await key('k','KeyK',75,2);
        await wait('document.activeElement?.getAttribute("aria-label")==="Search commands"');
        await cdp.send('Input.insertText',{text:command.query});
        const option=`[data-command-palette-item="${command.id}"]`;
        await wait(`!!document.querySelector(${JSON.stringify(option)})`);
        if(command.keyboard) {
          await evaluate(cdp,`document.querySelector(${JSON.stringify(option)}).focus()`);
          await key('Enter','Enter',13);
        } else await click(option);
        await wait(`!!document.querySelector('[aria-labelledby="${command.dialog}"]')&&!document.querySelector('[data-command-palette]')`);
        if(command.escape)await key('Escape','Escape',27);
        else await click(`[aria-label="${command.close}"]`);
        await wait('!document.querySelector("[role=dialog]")&&!history.state?.webKatrainOverlay');
        await evaluate(cdp,'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
        assert.equal(await evaluate(cdp,'document.activeElement===paletteReturnOrigin'),true,
          `${width}: ${command.id} must return to the original ${origin}, rather than the removed palette item`);
      }
    }
    reports.push({width,origins:['board','control'],directPaletteClose:true,
      settingsLessonsAndHelpRestoreOrigin:true,pointerAndKeyboardCommands:true,buttonAndEscapeClose:true});
  }
  fs.writeFileSync(path.join(screenshotDir,'command-dialog-focus.json'),JSON.stringify(reports,null,2));
  console.log('Command palette handoffs: desktop/phone Settings, lessons and help restore the original board/control after pointer/keyboard commands and Close/Escape.');
}
