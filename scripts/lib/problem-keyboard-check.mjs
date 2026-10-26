import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evaluate, navigate, setViewport, waitForExpression } from './browser.mjs';

export async function assertProblemKeyboard(cdp, appUrl, runDir, screenshotDir) {
  const file=path.join(runDir,'keyboard-problems.sgf');
  fs.writeFileSync(file,'(;GM[1]SZ[9](;AB[aa]PL[B](;B[ee]C[Correct])(;B[de]C[Wrong]))(;AB[ii]PL[B];B[ee];W[dd];B[ff]C[Correct]))');
  const wait=expression=>waitForExpression(cdp,expression,{label:'Problem practice keyboard flow',
    diagnose:`({active:document.activeElement?.getAttribute('aria-label')||document.activeElement?.tagName,
      prompt:document.querySelector('[data-problem-prompt]')?.textContent,message:document.querySelector('[data-problem-message]')?.textContent})`});
  const key=async(key,code,virtual,modifiers=0)=>{
    for(const type of ['keyDown','keyUp']) await cdp.send('Input.dispatchKeyEvent',{
      type,key,code,windowsVirtualKeyCode:virtual,modifiers,...(type==='keyDown'&&key==='Enter'?{text:'\r'}:{}),
    });
  };
  const click=async selector=>{
    const point=await wait(`(()=>{
      const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)return false;
      e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
      return r.width&&e.contains(document.elementFromPoint(x,y))?{x,y}:false;
    })()`);
    for(const type of ['mousePressed','mouseReleased']) await cdp.send('Input.dispatchMouseEvent',{type,...point,button:'left',clickCount:1});
  };
  const boardFocused=`document.activeElement?.getAttribute('data-static-board-interactive')==='true'`;
  const reports=[];
  for(const width of [1440,390]) {
    const setup=await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`
      localStorage.removeItem('web-katrain:auto_saved_game:v1');
      localStorage.removeItem('web-katrain:shortcuts:v1');
      localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');
      localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
      localStorage.setItem('web-katrain:settings:v3',JSON.stringify({soundEnabled:false,loadSgfFastAnalysis:false,loadSgfRewind:true}));
    `});
    try {
      await setViewport(cdp,{width,height:width===390?844:900,mobile:width===390});
      await navigate(cdp,appUrl,15000,{acceptBeforeUnload:true});
    } finally {await cdp.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:setup.result.identifier});}
    await wait('!!document.querySelector("[data-board-snapshot]")');
    const root=(await cdp.send('DOM.getDocument')).result.root;
    const input=(await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector:'input[type=file][accept^=".sgf"]:not([multiple])'})).result.nodeId;
    await cdp.send('DOM.setFileInputFiles',{nodeId:input,files:[file]});
    await wait('document.querySelector("[data-board-snapshot]")?.dataset.boardSize==="9"');
    await evaluate(cdp,'document.activeElement?.blur()');await key('k','KeyK',75,2);
    await wait('document.activeElement?.getAttribute("aria-label")==="Search commands"');
    await cdp.send('Input.insertText',{text:'problem practice'});
    await click('[data-command-palette-item=problem-practice]');
    await wait('!!document.querySelector("[data-problem-modal] [data-static-board-interactive]")');
    await evaluate(cdp,'document.querySelector("[data-problem-modal] [data-static-board-interactive]").focus()');
    await key('Enter','Enter',13);
    await wait('document.querySelector("[data-problem-message]")?.textContent.startsWith("Correct")');
    await evaluate(cdp,'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    assert.equal(await evaluate(cdp,'document.activeElement?.getAttribute("aria-label")'),'Next problem','A solved problem should focus the next problem');
    await key('Enter','Enter',13);
    await wait('document.querySelector("[data-problem-modal]")?.textContent.includes("Problem 2 / 2")');
    await wait(boardFocused);
    await key('Enter','Enter',13);
    await wait('document.querySelector("[data-problem-prompt]")?.textContent.includes("replying")');
    await wait('document.querySelector("[data-problem-prompt]")?.textContent==="Black to play"');
    await wait(boardFocused);
    assert.equal(await evaluate(cdp,`document.querySelectorAll('[data-problem-modal] circle[fill="url(#sb-white)"]').length`),1,'The recorded opponent reply must appear');
    await key('ArrowRight','ArrowRight',39);await key('ArrowDown','ArrowDown',40);await key('Enter','Enter',13);
    await wait('document.querySelector("[data-problem-message]")?.textContent.startsWith("Correct")');
    await wait('document.activeElement?.getAttribute("data-problem-retry")==="true"');
    await key('Enter','Enter',13);await wait(boardFocused);
    assert.equal(await evaluate(cdp,'document.querySelector("[data-problem-modal] svg[data-static-board-interactive]").hasAttribute("data-static-board-cursor")'),false,'Retry must start with a fresh keyboard cursor');
    await click('[data-problem-solution]');
    await wait('document.querySelector("[data-problem-message]")?.textContent==="Solution shown."');
    await wait('document.activeElement?.getAttribute("data-problem-retry")==="true"');
    await key('Enter','Enter',13);await wait(boardFocused);
    await click('[aria-label="Previous problem"]');await wait(boardFocused);
    await key('ArrowLeft','ArrowLeft',37);await key('Enter','Enter',13);
    await wait('document.querySelector("[data-problem-message]")?.textContent.startsWith("That line fails")');
    await wait('document.activeElement?.getAttribute("data-problem-retry")==="true"');
    await key('Enter','Enter',13);await wait(boardFocused);
    const shot=await cdp.send('Page.captureScreenshot',{format:'png'});
    fs.writeFileSync(path.join(screenshotDir,`problem-keyboard-${width}.png`),Buffer.from(shot.result.data,'base64'));
    await click('[aria-label="Close problem practice"]');
    await wait('!document.querySelector("[data-problem-modal]")&&!history.state?.webKatrainOverlay');
    assert.equal(await evaluate(cdp,'document.querySelector("[data-board-snapshot]").dataset.boardMoveCount'),'0');
    reports.push({width,correctFocusesNext:true,nextFocusesBoard:true,opponentReplyRestoresBoardFocus:true,
      finalAndWrongFocusRetry:true,solutionFocusesRetry:true,retryResetsCursor:true,actualGameUnchanged:true});
  }
  fs.writeFileSync(path.join(screenshotDir,'problem-keyboard.json'),JSON.stringify(reports,null,2));
  console.log('Problem practice: desktop/phone answer/Next/Retry focus, recorded opponent replies, wrong lines, solutions, fresh cursors, and unchanged game passed.');
}
