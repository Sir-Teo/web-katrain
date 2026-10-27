import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { connectDevtools, evaluate, loadedModuleUrl, navigate, setViewport, waitForExpression } from './browser.mjs';
export async function assertLessonProgressPeers(debugPort, appUrl, output) {
 const version=await (await fetch(`http://127.0.0.1:${debugPort}/json/version`)).json();
 const browser=connectDevtools(version.webSocketDebuggerUrl);await browser.ready;
 const reports=[];
 try { for(const width of [1440,390,320]) {
 const mobile=width<600;
 const context=(await browser.send('Target.createBrowserContext')).result.browserContextId,pages=[];
 const wait=(cdp,expression)=>waitForExpression(cdp,expression,{label:'Lesson progress in two tabs'});
 const key=async(cdp,key,code,number,modifiers=0)=>{for(const type of ['keyDown','keyUp'])await cdp.send('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode:number,modifiers})};
 const click=async(cdp,selector,text)=>{
  const point=await wait(cdp,`(()=>{const b=[...document.querySelectorAll(${JSON.stringify(selector)})].find(b=>${text?`b.textContent.trim()===${JSON.stringify(text)}`:'true'});if(!b||b.disabled)return false;b.scrollIntoView({block:'nearest'});const r=b.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return r.width&&b.contains(document.elementFromPoint(x,y))?{x,y}:false})()`);
  if(mobile){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})}
  else for(const type of ['mousePressed','mouseReleased'])await cdp.send('Input.dispatchMouseEvent',{type,...point,button:'left',clickCount:1});
 };
 try {
  for(let index=0;index<2;index++){
   const target=(await browser.send('Target.createTarget',{url:'about:blank',browserContextId:context})).result.targetId;
   const cdp=connectDevtools(`ws://127.0.0.1:${debugPort}/devtools/page/${target}`);await cdp.ready;pages.push(cdp);
   await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`
    performance.setResourceTimingBufferSize(5000);

    localStorage.removeItem('web-katrain:auto_saved_game:v1');localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');
    localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
    localStorage.setItem('web-katrain:settings:v3',JSON.stringify({soundEnabled:false,loadSgfFastAnalysis:false}));
    window.lessonStorageEvents=[];window.addEventListener('storage',e=>{if(e.key?.startsWith('web-katrain:lesson_progress:'))lessonStorageEvents.push({key:e.key,value:e.newValue})});
   `});
   await setViewport(cdp,{width,height:mobile?(width===320?568:844):900,mobile});await navigate(cdp,appUrl);await wait(cdp,'!!document.querySelector("[data-board-snapshot]")');
   await evaluate(cdp,'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))');
   await key(cdp,'k','KeyK',75,2);await click(cdp,'[data-command-palette-search]');await cdp.send('Input.insertText',{text:'Interactive lessons'});await click(cdp,'[data-command-palette-item=lessons]');
   await wait(cdp,'!!document.querySelector("[data-lesson-id=capture]")');
   await evaluate(cdp,`(async()=>{const url=${loadedModuleUrl.toString()};window.peerProgress=await import(url('/src/utils/lessonProgress.ts'));window.peerLessons=(await import(url('/src/data/lessons.ts'))).LESSONS})()`);
  }
  const [a,b]=pages;
  await a.send('Page.bringToFront');await click(a,'[data-lesson-id=capture]');await click(a,'.lessons-footer button','Next');
  await wait(a,'peerProgress.loadLessonProgress(peerLessons)?.capture?.stepIndex===1');
  await wait(b,'peerProgress.loadLessonProgress(peerLessons)?.capture?.stepIndex===1');
  await b.send('Page.bringToFront');await click(b,'[data-lesson-id=atari]');
  await wait(b,'document.activeElement===document.querySelector("[data-static-board-interactive]")');
  await key(b,'ArrowUp','ArrowUp',38);await key(b,'Enter','Enter',13);await click(b,'.lessons-footer button','Finish');
  await wait(b,'peerProgress.loadLessonProgress(peerLessons)?.atari?.completed===true');
  await wait(b,'document.querySelector("[data-lesson-id=capture]")?.textContent.includes("Continue")');
  await a.send('Page.bringToFront');await click(a,'.lessons-step button','All lessons');
  await wait(a,'!!document.querySelector("[data-lesson-id=atari] [aria-label=Completed]")');
  const url=loadedModuleUrl.toString();
  const report=await evaluate(b,`(async()=>{const url=${url};const p=await import(url('/src/utils/lessonProgress.ts'));const d=await import(url('/src/data/lessons.ts'));return {stored:JSON.parse(localStorage.getItem(p.LESSON_PROGRESS_KEY)),loaded:p.loadLessonProgress(d.LESSONS),events:lessonStorageEvents}})()`);
  fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,`lesson-progress-peers-${width}.json`),JSON.stringify({...report,width},null,2));
  for(let index=0;index<pages.length;index++){
   await pages[index].send('Page.bringToFront');const shot=await pages[index].send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,`lesson-progress-${width}-tab-${index}.png`),Buffer.from(shot.result.data,'base64'));
  }
  console.log('Two-tab lesson progress',JSON.stringify({width,...report}));
  assert.equal(report.loaded.capture?.stepIndex,1,'Advancing another tab must retain the reached capture exercise');
  assert.equal(report.loaded.atari?.completed,true);
  for(const cdp of pages) {
   await navigate(cdp,appUrl,15000,{acceptBeforeUnload:true});
   await wait(cdp,'!!document.querySelector("[data-board-snapshot]")');
   await cdp.send('Page.bringToFront');
   await evaluate(cdp,'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))');
   await key(cdp,'k','KeyK',75,2);await click(cdp,'[data-command-palette-search]');await cdp.send('Input.insertText',{text:'Interactive lessons'});await click(cdp,'[data-command-palette-item=lessons]');
   await wait(cdp,'document.querySelector("[data-lesson-id=capture]")?.textContent.includes("Continue")&&!!document.querySelector("[data-lesson-id=atari] [aria-label=Completed]")');
   await evaluate(cdp,`(async()=>{const url=${loadedModuleUrl.toString()};window.peerProgress=await import(url('/src/utils/lessonProgress.ts'));window.peerLessons=(await import(url('/src/data/lessons.ts'))).LESSONS})()`);
   const reloaded=await evaluate(cdp,'peerProgress.loadLessonProgress(peerLessons)');
   assert.deepEqual(reloaded,report.loaded);
  }
  reports.push({width,peerProgressVisible:true,durableAfterReload:true,progress:report.loaded});
 }finally{
  for(const page of pages)page.close();await browser.send('Target.disposeBrowserContext',{browserContextId:context});
 }
 } fs.writeFileSync(path.join(output,'lesson-progress-peers.json'),JSON.stringify(reports,null,2));
 } finally {browser.close()}
}
