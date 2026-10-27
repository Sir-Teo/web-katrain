import assert from 'node:assert/strict';
import fs from 'node:fs';
import {evaluate,navigate,setViewport,waitForExpression} from './browser.mjs';
import {installStorageControls} from './library-save-check.mjs';

// A completed copy belongs to the game that requested it, even when the OS
// opens another file (including identical SGF) while IndexedDB is writing.
export async function assertLibraryCopyLaunch(cdp,appUrl,screenshotDir) {
const dir=screenshotDir,url=appUrl;
await cdp.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:dir,eventsEnabled:true});
const wait=e=>waitForExpression(cdp,e,{label:'Save Copy / operating-system file launch',diagnose:"({title:document.title,body:document.body.innerText.slice(-1000),held:window.librarySaveAudit?.held.length})"});
const key=async(key,code,windowsVirtualKeyCode,modifiers=0)=>{for(const type of ['keyDown','keyUp'])await cdp.send('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode,modifiers});};
let mobile=false;
const click=async selector=>{const p=await wait(`(async()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)return false;e.scrollIntoView({block:'nearest',behavior:'instant'});await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return e.contains(document.elementFromPoint(x,y))?{x,y}:false})()`);if(mobile){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}else for(const type of ['mousePressed','mouseReleased'])await cdp.send('Input.dispatchMouseEvent',{type,...p,button:'left',clickCount:1});};
const game=()=>evaluate(cdp,"(()=>{const d=document.querySelector('[data-board-snapshot]').dataset;return{size:d.boardSize,stones:d.boardStones,moves:d.boardMoveCount,player:d.boardCurrentPlayer}})()");
const stored=`new Promise((resolve,reject)=>{const o=librarySaveAudit.open('web-katrain-library');o.onerror=()=>reject(o.error);o.onsuccess=()=>{const db=o.result,r=db.transaction('items','readonly').objectStore('items').getAll();r.onsuccess=()=>{db.close();resolve(r.result)};r.onerror=()=>{db.close();reject(r.error)}}})`;
const original='(;GM[1]FF[4]SZ[9]GN[Original clean file]AB[cc])',different='(;GM[1]FF[4]SZ[13]GN[New OS file]AW[dd])';
const launch=async(sgf,name)=>{await evaluate(cdp,`copyLaunchConsumer({files:[{getFile:async()=>new File([${JSON.stringify(sgf)}],${JSON.stringify(name)})}]});void 0`);await wait(`document.title.includes(${JSON.stringify(name)})`);};
const reports=[];
try{
for(const[width,height]of[[1440,900],[390,844],[320,568]])for(const identical of [false,true]){
 mobile=width<1000;
 const setup=await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:"localStorage.removeItem('web-katrain:auto_saved_game:v1');localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');localStorage.setItem('web-katrain:settings:v3',JSON.stringify({soundEnabled:false,loadSgfFastAnalysis:false,loadSgfRewind:true}));Object.defineProperty(window,'launchQueue',{configurable:true,value:{setConsumer:consumer=>window.copyLaunchConsumer=consumer}});"});
 try{await setViewport(cdp,{width,height,mobile});await navigate(cdp,url,15000,{acceptBeforeUnload:true});}finally{await cdp.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:setup.result.identifier});}
 await wait('!!document.querySelector("[data-board-snapshot]")&&typeof copyLaunchConsumer==="function"');await launch(original,'original-source.sgf');
 await key('s','KeyS',83,10);await wait('!!document.querySelector("#save-to-library-name")');await click('#save-to-library-name');await key('a','KeyA',65,2);const name=`Saved original ${width} ${identical?'same':'different'}`;await cdp.send('Input.insertText',{text:name});
 await evaluate(cdp,installStorageControls.replace("if(librarySaveAudit.mode==='delay'&&librarySaveAudit.skipDelayedOpens--<=0)","if(librarySaveAudit.mode==='delay'&&args[0]==='web-katrain-library'&&librarySaveAudit.skipDelayedOpens--<=0)"));await evaluate(cdp,"librarySaveAudit.mode='delay';void 0");await click('[aria-labelledby=save-to-library-title] > .ui-bar:last-child button:last-child');await wait('librarySaveAudit.held.length>0');
 await launch(identical?original:different,'new-os-source.sgf');const current=await game();
 await evaluate(cdp,"librarySaveAudit.mode='normal';librarySaveAudit.held.splice(0).forEach(release=>release());void 0");await wait('!document.querySelector("[aria-labelledby=save-to-library-title]")');const saved=await wait(`${stored}.then(items=>items.find(e=>e.name===${JSON.stringify(name)})||false)`);assert.ok(saved.sgf.includes('SZ[9]')&&saved.sgf.includes('AB[cc]'));assert.deepEqual(await game(),current);const afterTitle=await evaluate(cdp,'document.title');
 await key('s','KeyS',83,2);await wait("document.querySelector('.notification-toast-message')?.title.includes('Downloaded SGF')||document.querySelector('.notification-toast-message')?.title.includes('Updated ')");const afterSave=await evaluate(cdp,`${stored}.then(items=>items.find(e=>e.id===${JSON.stringify(saved.id)}))`);
 const report={width,height,identical,afterTitle,current,savedSgf:saved.sgf,afterSaveSgf:afterSave.sgf,associationPreserved:afterTitle.includes('new-os-source.sgf'),copyPreserved:afterSave.sgf===saved.sgf};reports.push(report);console.log('Copy launch overlap',JSON.stringify(report));fs.writeFileSync(`${dir}/library-copy-launch-${width}-${identical?'same':'different'}.png`,Buffer.from((await cdp.send('Page.captureScreenshot',{format:'png'})).result.data,'base64'));
 assert.ok(report.associationPreserved,'A late copy must not attach its saved file to the newly opened game');assert.ok(report.copyPreserved,'Saving the new game must not overwrite the original copied game');assert.equal(await evaluate(cdp,"document.querySelector('.notification-toast-message')?.title"),'Downloaded SGF.','The new external file must save independently of the copied Library game');
}
fs.writeFileSync(`${dir}/library-copy-launch.json`,JSON.stringify(reports,null,2));
}catch(error){fs.writeFileSync(`${dir}/library-copy-launch-failure.json`,JSON.stringify({error:error.stack,reports},null,2));throw error;}finally{await evaluate(cdp,"if(window.librarySaveAudit){librarySaveAudit.mode='normal';librarySaveAudit.held.splice(0).forEach(release=>release())}").catch(()=>{});await cdp.send('Browser.setDownloadBehavior',{behavior:'default'});}
}
