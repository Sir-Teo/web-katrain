import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evaluate, navigate, setViewport, waitForExpression } from './browser.mjs';

export async function assertPasteClipboardDraft(cdp, appUrl, screenshotDir) {
  const wait = expression => waitForExpression(cdp, expression, {
    label: 'Pasted draft and clipboard ordering',
    diagnose: `({text:document.querySelector('.paste-sgf-modal-textarea')?.value,status:document.querySelector('[aria-labelledby=paste-sgf-title] [role=alert], [aria-labelledby=paste-sgf-title] [role=status]')?.textContent,requests:window.clipboardDraftRequests?.length,ready:document.readyState,url:location.href,focus:document.activeElement?.outerHTML.slice(0,250),body:document.body.innerText.slice(0,1200)})`,
  });
  let mobile = false;
  const click = async (selector, text) => {
    const point = await wait(`(() => {
      const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>${text ? `e.textContent.trim()===${JSON.stringify(text)}` : 'true'});
      if(!e || e.disabled)return false;
      e.scrollIntoView({block:'nearest'});
      const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
      return r.width && e.contains(document.elementFromPoint(x,y))?{x,y}:false;
    })()`);
    if (mobile) {
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    } else {
      for (const type of ['mousePressed','mouseReleased']) await cdp.send('Input.dispatchMouseEvent',{type,...point,button:'left',clickCount:1});
    }
  };
  const key = async (key,code,windowsVirtualKeyCode,modifiers=0) => {
    for (const type of ['keyDown','keyUp']) await cdp.send('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode,modifiers,...(type==='keyDown' && key==='Enter'?{text:String.fromCharCode(13)}:{})});
  };
  const settle = () => evaluate(cdp,'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))');
  const open = async () => {
    await key('k','KeyK',75,2);await wait('!!document.querySelector("[data-command-palette-search]")');
    await click('[data-command-palette-search]');await cdp.send('Input.insertText',{text:'Paste SGF'});await key('Enter','Enter',13);
    await wait('!!document.querySelector(".paste-sgf-modal-textarea")');
  };
  const edit = async text => {
    await click('.paste-sgf-modal-textarea');await key('a','KeyA',65,2);await cdp.send('Input.insertText',{text});
  };
  const read = async () => {
    const index=await evaluate(cdp,'clipboardDraftRequests.length');
    await click('.paste-sgf-modal-footer button','Read Clipboard');
    await wait(`clipboardDraftRequests.length===${index+1}`);
    return index;
  };
  const finish = async (index, text, reject=false) => {
    const elapsed=await evaluate(cdp,`(() => {
      const r=clipboardDraftRequests[${index}],elapsed=performance.now()-r.started;
      ${reject ? "r.reject(new Error('Clipboard denied'))" : `r.resolve(${JSON.stringify(text)})`};return elapsed;
    })()`);
    assert.ok(elapsed<1000,`Clipboard fixture must complete before its 1200 ms timeout (${elapsed} ms)`);
    await settle();
  };
  const value = () => evaluate(cdp,'document.querySelector(".paste-sgf-modal-textarea").value');
  const status = () => evaluate(cdp,`document.querySelector('[aria-labelledby=paste-sgf-title] [role=alert], [aria-labelledby=paste-sgf-title] [role=status]')?.textContent ?? null`);
  const setup=await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`
    localStorage.removeItem('web-katrain:auto_saved_game:v1');
    localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');
    localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
    localStorage.setItem('web-katrain:library_open:v1','false');
    localStorage.setItem('web-katrain:settings:v3',JSON.stringify({soundEnabled:false,loadSgfFastAnalysis:false}));
  `});
  const results=[];
  try {
    for (const width of [1280,390,320]) {
      mobile=width<600;await setViewport(cdp,{width,height:mobile?(width===320?568:844):800,mobile});
      await navigate(cdp,appUrl,15000,{acceptBeforeUnload:true});await wait('!!document.querySelector("[data-board-snapshot]")');
      await settle();await open();
      await evaluate(cdp,`(() => {
        window.clipboardDraftRequests=[];
        Object.defineProperty(navigator,'clipboard',{configurable:true,value:{readText:()=>new Promise((resolve,reject)=>clipboardDraftRequests.push({resolve,reject,started:performance.now()}))}});
        const original=window.fetch;
        window.fetch=(url,init)=>String(url).includes('online-go.com/api/v1/games/')
          ? new Promise(resolve=>{window.releaseClipboardImport=()=>resolve(new Response('bad SGF'));window.clipboardImportSignal=init?.signal})
          : original(url,init);
        return true;
      })()`);
      const draft='(;GM[1]SZ[9]GN[My newer draft];B[dd])';
      for (const outcome of ['text','empty','denied']) {
        const typedDraft=draft.replace('newer draft',`newer ${outcome} draft`);
        const index=await read();await edit(typedDraft);
        await finish(index,outcome==='empty'?'':'(;SZ[13]GN[Older clipboard])',outcome==='denied');
        assert.equal(await value(),typedDraft,`${width}: stale ${outcome} read must preserve typed text`);
        assert.equal(await status(),null,`${width}: stale ${outcome} read must not replace feedback`);
      }
      const older=await read(),newer=await read(),latest='(;SZ[9]GN[Newest clipboard];B[ee])';
      await finish(newer,latest);await finish(older,'(;SZ[19]GN[Older request])');
      assert.equal(await value(),latest,`${width}: latest requested read wins`);
      const lateFailure=await read(),current=await read();await finish(current,latest);await finish(lateFailure,'',true);
      assert.equal(await value(),latest);assert.equal(await status(),null,'A stale rejection must not announce failure after a successful read');
      const empty=await read();await finish(empty,'');assert.equal(await value(),'');assert.equal(await status(),'Clipboard is empty.');
      await edit(draft);const denied=await read();await finish(denied,'',true);assert.equal(await value(),draft);assert.equal(await status(),'Clipboard unavailable.');
      await edit('https://online-go.com/game/12345');const pending=await read();await click('[aria-label="Open pasted SGF or OGS URL"]');await wait('!!window.releaseClipboardImport');
      await finish(pending,'(;SZ[13]GN[Too late])');assert.equal(await value(),'https://online-go.com/game/12345');assert.match(await status(),/Downloading OGS game 12345/);
      assert.equal(await evaluate(cdp,`[...document.querySelectorAll('.paste-sgf-modal-footer button')].find(e=>e.textContent.trim()==='Read Clipboard').disabled`),true);
      await evaluate(cdp,'window.releaseClipboardImport();void 0');await wait(`!document.querySelector('[aria-label="Open pasted SGF or OGS URL"]').disabled`);
      await edit(draft);const dismissed=await read();await click('[aria-label="Close paste SGF"]');await finish(dismissed,'(;SZ[13]GN[Dismissed read])');await open();
      assert.equal(await value(),'','A dismissed read must not appear in a new dialog');assert.equal(await status(),null);
      const shot=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(screenshotDir,`paste-clipboard-draft-${width}.png`),Buffer.from(shot.result.data,'base64'));
      await click('[aria-label="Close paste SGF"]');results.push({width,typedDraft:true,latestRead:true,emptyAndDenied:true,pendingImport:true,dismissal:true});
      console.log('Clipboard draft ordering',JSON.stringify(results.at(-1)));
    }
    fs.writeFileSync(path.join(screenshotDir,'paste-clipboard-draft.json'),JSON.stringify(results,null,2));
  } finally {
    await cdp.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:setup.result.identifier});
  }
}
