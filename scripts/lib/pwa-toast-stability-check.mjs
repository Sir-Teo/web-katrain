import assert from 'node:assert/strict';
import fs from 'node:fs';
import {evaluate,navigate,setViewport,waitForExpression} from './browser.mjs';

// A banner's hidden-height measurement can arrive after a toast has appeared.
// Hold only that callback, then release it between locating and tapping Close.
export async function assertPwaToastStability(cdp,appUrl,screenshotDir) {
const dir=screenshotDir,url=appUrl;
const wait=e=>waitForExpression(cdp,e,{label:'PWA reserve / mobile notification stability',diagnose:"({body:document.body.innerText.slice(-1200),reserve:getComputedStyle(document.documentElement).getPropertyValue('--pwa-banner-height'),held:window.heldBannerMeasurements?.length})"});
const click=async selector=>{const p=await wait(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return false;const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return e.contains(document.elementFromPoint(x,y))?{x,y}:false})()`);await tap(p);};
const tap=async p=>{await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});};
const settle=()=>evaluate(cdp,'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
const position=()=>evaluate(cdp,"(()=>{const b=document.querySelector('[aria-label=\"Dismiss notification\"]'),r=b.getBoundingClientRect(),t=document.querySelector('.notification-toast-region').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,region:t.toJSON(),reserve:getComputedStyle(document.documentElement).getPropertyValue('--pwa-banner-height'),held:heldBannerMeasurements.length}})()");
const reports=[];
fs.writeFileSync(`${dir}/pwa-toast-stability-foreign.json`,JSON.stringify({app:'another-app',version:2,items:[]}));
try{
for(const[width,height]of[[390,844],[320,568]])for(const font of ['100%','200%']){
 const setup=await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`
  localStorage.removeItem('web-katrain:auto_saved_game:v1');localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');localStorage.setItem('web-katrain:library_open:v1','true');localStorage.setItem('web-katrain:settings:v3',JSON.stringify({soundEnabled:false,loadSgfFastAnalysis:false}));
  window.holdBannerMeasurement=false;window.heldBannerMeasurements=[];
  window.pwaToastNativeResizeObserver=window.ResizeObserver;const NativeResizeObserver=window.pwaToastNativeResizeObserver;
  window.ResizeObserver=class extends NativeResizeObserver{constructor(callback){super((entries,observer)=>{if(holdBannerMeasurement&&entries.some(e=>e.target.classList.contains('pwa-install-banner')&&e.contentRect.height===0)){heldBannerMeasurements.push(()=>callback(entries,observer));return}callback(entries,observer)})}};
 `});
 try{await setViewport(cdp,{width,height,mobile:true});await navigate(cdp,url,15000,{acceptBeforeUnload:true});}finally{await cdp.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:setup.result.identifier});}
 await wait('!!document.querySelector("[data-board-snapshot]")');await click('#mobile-tab-library');await wait('!!document.querySelector(".library-tree")');await evaluate(cdp,`document.documentElement.style.fontSize=${JSON.stringify(font)};window.dispatchEvent(new Event('web-katrain:pwa-offline-ready'));void 0`);await wait("parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--pwa-banner-height'))>0");

 const originalBoard=await evaluate(cdp,"(()=>{const d=document.querySelector('[data-board-snapshot]').dataset;return{size:d.boardSize,stones:d.boardStones,moves:d.boardMoveCount,player:d.boardCurrentPlayer,files:document.querySelectorAll('[data-library-row=file]').length}})()");
 await evaluate(cdp,'holdBannerMeasurement=true;void 0');const root=(await cdp.send('DOM.getDocument')).result.root.nodeId,input=(await cdp.send('DOM.querySelector',{nodeId:root,selector:'input[type=file][accept=".json,application/json"]'})).result.nodeId;
 await cdp.send('DOM.setFileInputFiles',{nodeId:input,files:[`${dir}/pwa-toast-stability-foreign.json`]});await wait('heldBannerMeasurements.length>0&&!!document.querySelector(".notification-toast-message")');await wait("document.querySelector('.notification-toast').getAnimations().every(a=>a.playState!=='running')");
 const before=await position();await evaluate(cdp,'holdBannerMeasurement=false;heldBannerMeasurements.splice(0).forEach(release=>release());void 0');await wait("!getComputedStyle(document.documentElement).getPropertyValue('--pwa-banner-height')");await settle();const after=await position();
 fs.writeFileSync(`${dir}/pwa-toast-stability-${width}-${font.replace('%','')}-visible.png`,Buffer.from((await cdp.send('Page.captureScreenshot',{format:'png'})).result.data,'base64'));
 await tap({x:before.x,y:before.y});await settle();const dismissed=await evaluate(cdp,'!document.querySelector(".notification-toast-message")');const report={width,height,font,before,after,jump:after.y-before.y,dismissed};reports.push(report);console.log('PWA toast stability',JSON.stringify(report));fs.writeFileSync(`${dir}/pwa-toast-stability-${width}-${font.replace('%','')}-dismissed.png`,Buffer.from((await cdp.send('Page.captureScreenshot',{format:'png'})).result.data,'base64'));
 assert.ok(Math.abs(report.jump)<1,'The notification must stay anchored while a hidden PWA banner releases its measured height');assert.equal(dismissed,true,'The original Close target must remain clickable');
 assert.deepEqual(await evaluate(cdp,"(()=>{const d=document.querySelector('[data-board-snapshot]').dataset;return{size:d.boardSize,stones:d.boardStones,moves:d.boardMoveCount,player:d.boardCurrentPlayer,files:document.querySelectorAll('[data-library-row=file]').length}})()"),originalBoard,'The rejected backup and notification tap must preserve the board and Library');
 // The next navigation resets the intentionally missed baseline tap.
}
fs.writeFileSync(`${dir}/pwa-toast-stability.json`,JSON.stringify(reports,null,2));
}catch(error){fs.writeFileSync(`${dir}/pwa-toast-stability-failure.json`,JSON.stringify({error:error.stack,reports},null,2));throw error;}finally{await evaluate(cdp,'holdBannerMeasurement=false;window.heldBannerMeasurements?.splice(0).forEach(release=>release());if(window.pwaToastNativeResizeObserver)window.ResizeObserver=pwaToastNativeResizeObserver;void 0').catch(()=>{});}
}
