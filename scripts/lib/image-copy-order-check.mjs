import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evaluate, loadedModuleUrl, navigate, setViewport, waitForExpression } from './browser.mjs';

export async function assertImageCopyOrder(cdp,appUrl,runDir,screenshotDir) {
  const fixture=path.join(runDir,'image-copy-position.sgf');fs.writeFileSync(fixture,'(;GM[1]SZ[9]GN[Image copy ordering];B[dd];W[ff];B[fg])');
  const wait=expression=>waitForExpression(cdp,expression,{label:'Image/text clipboard ordering',diagnose:`({audit:window.imageCopyAudit?{writes:imageCopyAudit.images.length,texts:imageCopyAudit.texts.map(t=>({expired:t.expired,finished:t.finished})),legacy:imageCopyAudit.legacy}:null,held:window.imageCopyHeld?.ready,toast:document.querySelector('.notification-toast-message')?.title})`});
  const settle=()=>evaluate(cdp,'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))');
  let mobile=false;
  const activate=async p=>{
    if(mobile){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})}
    else for(const type of ['mousePressed','mouseReleased'])await cdp.send('Input.dispatchMouseEvent',{type,...p,button:'left',clickCount:1});
  };
  const click=async selector=>{
    const p=await wait(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.getClientRects().length&&!e.disabled);if(!e)return false;e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return r.width&&e.contains(document.elementFromPoint(x,y))?{x,y}:false})()`);
    await activate(p);
  };
  const key=async(key,code,windowsVirtualKeyCode,modifiers=0)=>{for(const type of ['keyDown','keyUp'])await cdp.send('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode,modifiers,...(type==='keyDown'&&key==='Enter'?{text:String.fromCharCode(13)}:{})})};
  const command=async text=>{
    await key('k','KeyK',75,2);await wait('!!document.querySelector("[data-command-palette-search]")');await click('[data-command-palette-search]');
    await cdp.send('Input.insertText',{text});await key('Enter','Enter',13);await wait('!document.querySelector("[data-command-palette-search]")');
  };
  const advance=async count=>{
    const p=await wait(`(()=>{const e=[...document.querySelectorAll('button')].find(b=>{const label=(b.getAttribute('aria-label')||b.title||b.textContent||'').trim();return b.getClientRects().length&&!b.disabled&&(label==='Forward'||label.startsWith('Forward ')&&!label.startsWith('Forward 10'))});if(!e)return false;const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return e.contains(document.elementFromPoint(x,y))?{x,y}:false})()`);
    await activate(p);await wait(`document.querySelector('[data-board-snapshot]').dataset.boardMoveCount===${JSON.stringify(String(count))}`);await settle();
  };
  const reports=[];
  await cdp.send('Emulation.setFocusEmulationEnabled',{enabled:true});
  await cdp.send('Browser.grantPermissions',{origin:new URL(appUrl).origin,permissions:['clipboardReadWrite','clipboardSanitizedWrite']});
  try {
    for(const width of [1440,390,320]){
      mobile=width<600;
      const setup=await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`
        localStorage.removeItem('web-katrain:auto_saved_game:v1');localStorage.removeItem('web-katrain:shortcuts:v1');localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
        localStorage.setItem('web-katrain:library_open:v1','false');localStorage.setItem('web-katrain:settings:v3',JSON.stringify({soundEnabled:false,loadSgfFastAnalysis:false,boardTheme:'hikaru',showNextMovePreview:false}));
      `});
      try{await setViewport(cdp,{width,height:mobile?(width===320?568:844):900,mobile});await navigate(cdp,appUrl,15000,{acceptBeforeUnload:true})}
      finally{await cdp.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:setup.result.identifier})}
      await wait('!!document.querySelector("[data-board-snapshot]")');if(mobile)await click('#mobile-tab-board');
      const root=(await cdp.send('DOM.getDocument')).result.root,input=(await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector:'input[type=file][accept*=".sgf"][accept*=".bin"]'})).result.nodeId;
      await cdp.send('DOM.setFileInputFiles',{nodeId:input,files:[fixture]});
      await wait(`document.querySelector('input[type=file][accept*=".bin"]').files.length===0 && document.querySelector('[data-board-snapshot]').dataset.boardSize==='9'`);await advance(1);
      await evaluate(cdp,`(async()=>{
        const url=${loadedModuleUrl.toString()},module=await import(url('/src/utils/clipboard.ts'));
        const clipboard=navigator.clipboard,exec=document.execCommand.bind(document),setTimeout=window.setTimeout.bind(window),OriginalImage=window.Image,descriptor=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');
        window.imageCopyOriginals={clipboard,exec,setTimeout,Image:OriginalImage};window.imageCopyAudit={images:[],texts:[],legacy:[],holdText:false,armTexture:false,timeout:module.CLIPBOARD_OPERATION_TIMEOUT_MS};
        window.imageCopyHash=async blob=>{const image=await createImageBitmap(blob),canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);image.close();const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;const digest=await crypto.subtle.digest('SHA-256',pixels);return [...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('')};
        Object.defineProperty(navigator,'clipboard',{configurable:true,value:{
          writeText:text=>{const entry={text,started:performance.now(),finished:false,expired:false};imageCopyAudit.texts.push(entry);imageCopyAudit.pendingText=entry;
            const operation=imageCopyAudit.holdText?(imageCopyAudit.holdText=false,new Promise((resolve,reject)=>{entry.reject=reject})):clipboard.writeText(text);
            return operation.finally(()=>{entry.finished=true});
          },
          write:async items=>{const blob=await items[0].getType('image/png'),hash=await imageCopyHash(blob);await clipboard.write(items);imageCopyAudit.images.push({blob,hash})},
        }});
        document.execCommand=(command,...args)=>{const result=exec(command,...args);if(command==='copy')imageCopyAudit.legacy.push({text:document.activeElement?.value,result});return result};
        window.setTimeout=(callback,delay,...args)=>{if(typeof callback!=='function')return setTimeout(callback,delay,...args);const entry=delay===imageCopyAudit.timeout?imageCopyAudit.pendingText:null;return setTimeout((...values)=>{if(entry)entry.expired=true;return callback.apply(window,values)},delay,...args)};
        window.Image=function(...args){const img=new OriginalImage(...args);Object.defineProperty(img,'src',{configurable:true,get:()=>descriptor.get.call(img),set:value=>{
          const background=/url\\(["']?(.+?)["']?\\)/.exec(getComputedStyle(document.querySelector('[data-board-snapshot]')).backgroundImage)?.[1];
          if(imageCopyAudit.armTexture&&value===background){imageCopyAudit.armTexture=false;const onload=img.onload;window.imageCopyHeld={ready:false,release:()=>onload.call(img,new Event('load'))};img.onload=()=>{imageCopyHeld.ready=true}}
          descriptor.set.call(img,value);
        }});return img};window.Image.prototype=OriginalImage.prototype;
      })()`);
      const arm=()=>evaluate(cdp,'imageCopyAudit.armTexture=true;window.imageCopyHeld=null;void 0');
      const release=async()=>{await evaluate(cdp,'imageCopyHeld.release();void 0');await settle()};
      const title=()=>evaluate(cdp,'document.querySelector(".notification-toast-message")?.title');
      const clipboardImageHash=()=>evaluate(cdp,`(async()=>{const items=await imageCopyOriginals.clipboard.read(),item=items.find(item=>item.types.includes('image/png'));if(!item)throw new Error('The clipboard must contain a PNG');return imageCopyHash(await item.getType('image/png'))})()`);
      const cases=[];
      // An older prepared PNG must not overwrite newly copied SGF text.
      let writes=await evaluate(cdp,'imageCopyAudit.images.length');await arm();await command('Copy board image');await wait('imageCopyHeld?.ready');
      await command('Copy SGF');await wait('imageCopyAudit.texts.at(-1)?.finished');await settle();
      const text=await evaluate(cdp,'imageCopyOriginals.clipboard.readText()');assert.ok(text.includes('GN[Image copy ordering]'));
      let latestTitle=await title();await release();assert.equal(await evaluate(cdp,'imageCopyOriginals.clipboard.readText()'),text);assert.equal(await evaluate(cdp,'imageCopyAudit.images.length'),writes);assert.equal(await title(),latestTitle);cases.push('image-then-text');
      // A newer PNG owns the clipboard even when an older capture finishes last.
      await arm();await command('Copy board image');await wait('imageCopyHeld?.ready');await advance(2);
      await command('Copy board image');await wait(`imageCopyAudit.images.length===${writes+1}`);await settle();
      let expectedHash=await evaluate(cdp,'imageCopyAudit.images.at(-1).hash');assert.equal(await clipboardImageHash(),expectedHash);latestTitle=await title();
      await release();assert.equal(await evaluate(cdp,'imageCopyAudit.images.length'),writes+1);assert.equal(await clipboardImageHash(),expectedHash);assert.equal(await title(),latestTitle);cases.push('image-then-image');
      // The text fallback must also yield to a newer image request.
      for(const outcome of ['rejection','timeout']){
        const index=await evaluate(cdp,'imageCopyAudit.texts.length');writes=await evaluate(cdp,'imageCopyAudit.images.length');
        await evaluate(cdp,'imageCopyAudit.holdText=true;void 0');await command('Copy SGF');await wait(`imageCopyAudit.texts.length===${index+1}`);
        await command('Copy board image');await wait(`imageCopyAudit.images.length===${writes+1}`);await settle();
        const elapsed=await evaluate(cdp,`performance.now()-imageCopyAudit.texts[${index}].started`);assert.ok(elapsed<1000,`New image must finish before the old 1200 ms text timeout (${elapsed} ms)`);
        expectedHash=await evaluate(cdp,'imageCopyAudit.images.at(-1).hash');latestTitle=await title();
        if(outcome==='rejection')await evaluate(cdp,`imageCopyAudit.texts[${index}].reject(new Error('Old text denied'));void 0`);
        else await wait(`imageCopyAudit.texts[${index}].expired`);
        await settle();assert.equal(await clipboardImageHash(),expectedHash);assert.equal(await evaluate(cdp,'imageCopyAudit.legacy.length'),0);assert.equal(await title(),latestTitle);cases.push(`text-then-image-${outcome}`);
      }
      const png=await evaluate(cdp,`(async()=>{const items=await imageCopyOriginals.clipboard.read(),blob=await items.find(item=>item.types.includes('image/png')).getType('image/png');return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob)})})()`);
      fs.writeFileSync(path.join(screenshotDir,`clipboard-image-${width}.png`),Buffer.from(png.split(',')[1],'base64'));
      await command('Copy SGF');await wait('imageCopyAudit.texts.at(-1)?.finished');assert.ok((await evaluate(cdp,'imageCopyOriginals.clipboard.readText()')).includes('GN[Image copy ordering]'));cases.push('fresh-text-retry');
      reports.push({width,cases,realPngClipboard:true,staleImageWritesSkipped:true,staleFeedbackIgnored:true});console.log('Image/text copy ordering',JSON.stringify(reports.at(-1)));
    }
    fs.writeFileSync(path.join(screenshotDir,'image-copy-order.json'),JSON.stringify(reports,null,2));
  }finally{
    await evaluate(cdp,`(async()=>{const o=window.imageCopyOriginals;if(!o)return;await o.clipboard.writeText('');Object.defineProperty(navigator,'clipboard',{configurable:true,value:o.clipboard});document.execCommand=o.exec;window.setTimeout=o.setTimeout;window.Image=o.Image})()`).catch(()=>undefined);
    await cdp.send('Browser.resetPermissions');
  }
}
