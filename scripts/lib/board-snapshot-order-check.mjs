import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evaluate, loadedModuleUrl, navigate, setViewport, waitForExpression } from './browser.mjs';

// Compare stable output with the previous background-first composition. The
// delayed export below separately verifies position and geometry ownership.
async function referenceSnapshot() {
  const board=document.querySelector('[data-board-snapshot]'),r=board.getBoundingClientRect();
  const width=Math.round(r.width),height=Math.round(r.height),dpr=window.devicePixelRatio||1;
  const canvas=document.createElement('canvas');canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
  const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);
  const style=getComputedStyle(board);ctx.fillStyle=style.backgroundColor;ctx.fillRect(0,0,width,height);
  const url=/url\(["']?(.+?)["']?\)/.exec(style.backgroundImage)?.[1];
  if(url){const image=await new Promise((resolve,reject)=>{const img=new Image();img.crossOrigin='anonymous';img.onload=()=>resolve(img);img.onerror=reject;img.src=url});ctx.drawImage(image,0,0,width,height)}
  const layers=[...board.querySelectorAll('canvas')].sort((a,b)=>(parseInt(getComputedStyle(a).zIndex)||0)-(parseInt(getComputedStyle(b).zIndex)||0));
  for(const layer of layers){const box=layer.getBoundingClientRect();if(box.width&&box.height&&layer.width&&layer.height)ctx.drawImage(layer,box.left-r.left,box.top-r.top,box.width,box.height)}
  return canvas.toDataURL('image/png');
}

export async function assertBoardSnapshotOrder(cdp,appUrl,runDir,screenshotDir) {
  const fixture=path.join(runDir,'snapshot-position.sgf');
  fs.writeFileSync(fixture,'(;GM[1]SZ[9]GN[Snapshot position];B[dd];W[ff];B[fg])');
  const wait=expression=>waitForExpression(cdp,expression,{label:'Board image snapshot position',diagnose:`({moves:document.querySelector('[data-board-snapshot]')?.dataset.boardMoveCount,texture:window.snapshotHeldTexture?{ready:snapshotHeldTexture.ready,failed:snapshotHeldTexture.failed}:null})`});
  const settle=()=>evaluate(cdp,'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))');
  let mobile=false;
  const activatePoint=async point=>{
    if(mobile){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})}
    else for(const type of ['mousePressed','mouseReleased'])await cdp.send('Input.dispatchMouseEvent',{type,...point,button:'left',clickCount:1});
  };
  const advance=async count=>{
    const point=await wait(`(()=>{const e=[...document.querySelectorAll('button')].find(b=>{const label=(b.getAttribute('aria-label')||b.title||b.textContent||'').trim();return b.getClientRects().length&&!b.disabled&&(label==='Forward'||label.startsWith('Forward ')&&!label.startsWith('Forward 10'))});if(!e)return false;const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return e.contains(document.elementFromPoint(x,y))?{x,y}:false})()`);
    await activatePoint(point);
    await wait(`document.querySelector('[data-board-snapshot]').dataset.boardMoveCount===${JSON.stringify(String(count))}`);await settle();
  };
  const reports=[];
  for(const width of [1440,390,320]){
    mobile=width<600;const height=mobile?(width===320?568:844):900;
    const setup=await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`
      localStorage.removeItem('web-katrain:auto_saved_game:v1');localStorage.removeItem('web-katrain:shortcuts:v1');
      localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');localStorage.setItem('web-katrain:library_open:v1','false');
      localStorage.setItem('web-katrain:settings:v3',JSON.stringify({soundEnabled:false,loadSgfFastAnalysis:false,boardTheme:'hikaru',showNextMovePreview:false}));
    `});
    try{await setViewport(cdp,{width,height,mobile});await navigate(cdp,appUrl,15000,{acceptBeforeUnload:true})}
    finally{await cdp.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:setup.result.identifier})}
    await wait('!!document.querySelector("[data-board-snapshot]")');
    if(mobile)await activatePoint(await wait(`(()=>{const e=document.querySelector('#mobile-tab-board');if(!e)return false;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`));
    const root=(await cdp.send('DOM.getDocument')).result.root;
    const input=(await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector:'input[type=file][accept*=".sgf"][accept*=".bin"]'})).result.nodeId;
    assert.ok(input);await cdp.send('DOM.setFileInputFiles',{nodeId:input,files:[fixture]});
    await wait(`document.querySelector('input[type=file][accept*=".bin"]').files.length===0 && document.querySelector('[data-board-snapshot]').dataset.boardSize==='9'`);
    await advance(1);
    await evaluate(cdp,`(async()=>{const url=${loadedModuleUrl.toString()};window.snapshotModule=await import(url('/src/utils/boardSnapshot.ts'));window.snapshotReference=await (${referenceSnapshot.toString()})();window.snapshotBefore=await snapshotModule.captureBoardSnapshot();return true})()`);
    // Alpha compositing can round a channel differently when its order changes.
    // Compare actual decoded pixels, allowing at most two 8-bit channel levels.
    const comparison=await evaluate(cdp,`(async()=>{
      const decode=src=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=src});
      const [a,b]=await Promise.all([decode(snapshotReference),decode(snapshotBefore)]);
      const c=document.createElement('canvas');c.width=a.width;c.height=a.height;const ctx=c.getContext('2d');
      ctx.drawImage(a,0,0);const original=ctx.getImageData(0,0,c.width,c.height).data;ctx.clearRect(0,0,c.width,c.height);ctx.drawImage(b,0,0);const actual=ctx.getImageData(0,0,c.width,c.height).data;
      let maximumDelta=0;for(let i=0;i<original.length;i++)maximumDelta=Math.max(maximumDelta,Math.abs(original[i]-actual[i]));
      return {width:a.width,height:a.height,maximumDelta};
    })()`);
    assert.ok(comparison.maximumDelta<=2,`Stable board colors must preserve their layer order: ${JSON.stringify(comparison)}`);
    await evaluate(cdp,`(()=>{
      const Original=window.Image,descriptor=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');
      const url=/url\\(["']?(.+?)["']?\\)/.exec(getComputedStyle(document.querySelector('[data-board-snapshot]')).backgroundImage)?.[1];
      if(!url)throw new Error('The fixture must load a real board texture');
      let held=false;window.snapshotOriginalImage=Original;
      window.Image=function(...args){const img=new Original(...args);Object.defineProperty(img,'src',{configurable:true,get:()=>descriptor.get.call(img),set:value=>{
        if(!held&&value===url){held=true;const onload=img.onload,onerror=img.onerror;window.snapshotHeldTexture={ready:false,failed:false,image:img,release:()=>onload.call(img,new Event('load')),fail:()=>onerror.call(img,new Event('error'))};img.onload=()=>{snapshotHeldTexture.ready=true};img.onerror=()=>{snapshotHeldTexture.failed=true}}
        descriptor.set.call(img,value);
      }});return img};window.Image.prototype=Original.prototype;
      window.snapshotPending=snapshotModule.captureBoardSnapshot();return true;
    })()`);
    try{
      await wait('!!window.snapshotHeldTexture && snapshotHeldTexture.ready');
      await advance(2);
      await setViewport(cdp,{width:mobile?(width===320?360:320):1280,height,mobile});await settle();
      await evaluate(cdp,'snapshotHeldTexture.release();void 0');
      const preserved=await evaluate(cdp,'snapshotPending.then(value=>{window.snapshotCaptured=value;return value===snapshotBefore})');
      assert.equal(preserved,true,'A delayed PNG must preserve the exact position and dimensions selected before navigation and resize');
    }finally{await evaluate(cdp,'window.Image=snapshotOriginalImage;void 0')}
    await evaluate(cdp,'snapshotModule.captureBoardSnapshot().then(value=>{window.snapshotAfter=value;return true})');
    assert.equal(await evaluate(cdp,'snapshotCaptured!==snapshotAfter'),true,'A fresh export must reflect the later position and viewport');
    for(const [name,expression] of [['chosen','snapshotCaptured'],['later','snapshotAfter']]){
      const png=await evaluate(cdp,expression);assert.ok(png?.startsWith('data:image/png;base64,'));
      fs.writeFileSync(path.join(screenshotDir,`board-snapshot-${width}-${name}.png`),Buffer.from(png.split(',')[1],'base64'));
    }
    reports.push({viewportWidth:width,pngWidth:comparison.width,pngHeight:comparison.height,maximumChannelDelta:comparison.maximumDelta,preservedPosition:true,preservedGeometry:true,freshExport:true});console.log('Board snapshot ordering',JSON.stringify(reports.at(-1)));
  }
  fs.writeFileSync(path.join(screenshotDir,'board-snapshot-order.json'),JSON.stringify(reports,null,2));
}
