import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evaluate, navigate, setViewport, sleep, waitForExpression } from './browser.mjs';

export async function assertPasteImportCancellation(cdp, appUrl, screenshotDir) {
  const wait = (expression) => waitForExpression(cdp, expression, { label: 'Cancel pending SGF import' });
  let mobile = false;
  const click = async (selector) => {
    const point = await wait(`(() => {
      const e=document.querySelector(${JSON.stringify(selector)});
      if (!e || e.disabled) return false;
      e.scrollIntoView({block:'nearest'});
      const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
      return r.width && e.contains(document.elementFromPoint(x,y)) ? {x,y} : false;
    })()`);
    if (mobile) {
      await cdp.send('Input.dispatchTouchEvent', {type:'touchStart',touchPoints:[point]});
      await cdp.send('Input.dispatchTouchEvent', {type:'touchEnd',touchPoints:[]});
    } else {
      for (const type of ['mousePressed','mouseReleased']) {
        await cdp.send('Input.dispatchMouseEvent', {type,...point,button:'left',clickCount:1});
      }
    }
  };
  const key = async (key, code, windowsVirtualKeyCode, modifiers = 0) => {
    for (const type of ['keyDown','keyUp']) {
      await cdp.send('Input.dispatchKeyEvent', {type,key,code,windowsVirtualKeyCode,modifiers});
    }
  };
  const openImport = async () => {
    await key('k','KeyK',75,2);
    await wait('!!document.querySelector("[data-command-palette-search]")');
    await click('[data-command-palette-search]');
    await cdp.send('Input.insertText', {text:'Paste SGF'});
    await key('Enter','Enter',13);
    await wait('!!document.querySelector(".paste-sgf-modal-textarea")');
    await click('.paste-sgf-modal-textarea');
    await cdp.send('Input.insertText', {text:'https://online-go.com/game/12345'});
    await click('[aria-label="Open pasted SGF or OGS URL"]');
    await wait('!!window.releaseHeldImport');
  };
  const board = () => evaluate(cdp, `(() => {
    const b=document.querySelector('[data-board-snapshot=true]');
    return {size:b.dataset.boardSize,stones:b.dataset.boardStones,moves:b.dataset.boardMoveCount};
  })()`);
  // Install in the arriving document so a departing pagehide flush cannot
  // restore the recovery snapshot between setup and the next navigation.
  const setup = await cdp.send('Page.addScriptToEvaluateOnNewDocument', {source:`
    localStorage.removeItem('web-katrain:auto_saved_game:v1');
    localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');
    localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
  `});
  const results = [];
  try {
    for (const dismissal of ['close','escape','cancel','back','photo']) {
      mobile = ['cancel','back','photo'].includes(dismissal);
      await setViewport(cdp, {width:mobile?390:1280,height:mobile?844:800,mobile});
      await navigate(cdp, appUrl, 15000, { acceptBeforeUnload: true });
      await wait('!!document.querySelector("[data-board-snapshot=true]")');
      await evaluate(cdp, `(() => {
        Object.defineProperty(navigator,'clipboard',{configurable:true,value:{readText:async()=>''}});
        const original=window.fetch;
        window.fetch=(url,init)=>String(url).includes('online-go.com/api/v1/games/')
          ? new Promise(resolve=>{
            window.heldImportSignal=init?.signal;
            // Deliberately ignore abort: a late response must still be refused.
            window.releaseHeldImport=()=>resolve(new Response('(;GM[1]SZ[9]GN[Delayed OGS game];B[dd])'));
          }) : original(url,init);
      })()`);
      const before = await board();
      await openImport();
      const pendingFocus = await evaluate(cdp, `({inside:document.querySelector('[aria-labelledby=paste-sgf-title]').contains(document.activeElement),tag:document.activeElement?.tagName})`);
      console.log('Paste import pending focus', JSON.stringify({ dismissal, ...pendingFocus }));
      assert.equal(pendingFocus.inside, true, 'A pending pasted import must keep focus in its dialog when Open becomes disabled');
      for (const modifiers of [0, 8, 0, 8]) {
        await key('Tab', 'Tab', 9, modifiers);
        assert.equal(await evaluate(cdp, `document.querySelector('[aria-labelledby=paste-sgf-title]').contains(document.activeElement)`), true, 'Tab and Shift+Tab must remain inside the pending pasted import');
      }
      if (dismissal === 'close') await click('[aria-label="Close paste SGF"]');
      if (dismissal === 'escape') await key('Escape','Escape',27);
      if (dismissal === 'cancel') await click('.paste-sgf-modal-footer > div:last-child > button:first-child');
      if (dismissal === 'back') await evaluate(cdp, 'history.back()');
      if (dismissal === 'photo') await click('[data-paste-sgf-photo-board=true]');
      await wait('!document.querySelector(".paste-sgf-modal-textarea")');
      await evaluate(cdp, 'window.releaseHeldImport()');
      await sleep(150);
      const after = await board();
      assert.deepEqual(after, before, `${dismissal} must preserve the exact board after a late download`);
      assert.equal(await evaluate(cdp, 'window.heldImportSignal?.aborted'), true, `${dismissal} must abort the download`);
      assert.equal(await evaluate(cdp, `!!document.querySelector('.notification-toast-message')?.textContent.includes('Downloaded OGS')`), false);
      results.push({dismissal,mobile,before,after,aborted:true});
      if (dismissal === 'close') {
        // A new dialog owns a new request; cancellation must not poison retries.
        await evaluate(cdp, 'window.releaseHeldImport=null');
        await openImport();
        await evaluate(cdp, 'window.releaseHeldImport()');
        await wait('!document.querySelector(".paste-sgf-modal-textarea") && document.querySelector("[data-board-snapshot=true]")?.dataset.boardSize === "9"');
        results.push({retryLoaded:true});
      }
    }
    // A failed download leaves the editor ready for a correction or retry.
    await navigate(cdp, appUrl, 15000, { acceptBeforeUnload: true });
    await wait('!!document.querySelector("[data-board-snapshot=true]")');
    const beforeFailure = await board();
    await evaluate(cdp, `(()=>{const original=window.fetch;window.fetch=(url,init)=>String(url).includes('online-go.com/api/v1/games/')?new Promise(resolve=>window.releaseHeldImport=()=>resolve(new Response('not an SGF game'))):original(url,init)})()`);
    await openImport();
    await evaluate(cdp, 'releaseHeldImport();void 0');
    await wait(`!!document.querySelector('[aria-labelledby=paste-sgf-title] [role=alert]')&&!document.querySelector('[aria-label="Open pasted SGF or OGS URL"]').disabled`);
    assert.equal(await evaluate(cdp, 'document.activeElement===document.querySelector(".paste-sgf-modal-textarea")'), true, 'An unsuccessful import must restore the text editor');
    assert.deepEqual(await board(), beforeFailure);
    results.push({ failedImportRestoresEditor: true, failedImportPreservesBoard: true });
    await click('[aria-label="Close paste SGF"]');
    await wait('!document.querySelector(".paste-sgf-modal-textarea")');
    // A history marker restored by reload is not popped by this document:
    // overlayBackStack deliberately avoids navigating away over a stale marker.
    results.push({ afterFailedImportClose: await evaluate(cdp, '({history:history.state,dialogs:[...document.querySelectorAll("[role=dialog]")].map(e=>e.getAttribute("aria-labelledby"))})') });
    // A composition-confirming Enter belongs to the username editor, too.
    await navigate(cdp, appUrl, 15000, { acceptBeforeUnload: true });
    await wait('!!document.querySelector("#mobile-tab-library")');
    await click('#mobile-tab-library');
    await click('button[aria-label="More library actions"]');
    await click('[role=menu][aria-label="More library actions"] button:nth-of-type(4)');
    await wait('!!document.querySelector("#ogs-sync-username")');
    await click('#ogs-sync-username');
    await cdp.send('Input.insertText', {text:'ExampleUser'});
    await evaluate(cdp, `(() => {
      window.ogsLookupCount=0;
      const original=window.fetch;
      window.fetch=(url,init)=>String(url).includes('online-go.com/')
        ? (window.ogsLookupCount++,Promise.resolve(new Response('{"results":[]}')))
        : original(url,init);
      document.querySelector('#ogs-sync-username').dispatchEvent(new KeyboardEvent('keydown',
        {key:'Enter',isComposing:true,bubbles:true,cancelable:true}));
    })()`);
    await sleep(50);
    assert.equal(await evaluate(cdp, 'window.ogsLookupCount'), 0, 'IME confirmation must not start OGS sync');
    await key('Enter','Enter',13);
    await wait('window.ogsLookupCount > 0');
    results.push({compositionEnterIgnored:true,ordinaryEnterStartsSync:true});
  } finally {
    await cdp.send('Page.removeScriptToEvaluateOnNewDocument', {identifier:setup.result.identifier});
  }
  fs.writeFileSync(path.join(screenshotDir,'paste-import-cancellation.json'),JSON.stringify(results,null,2));
  console.log('SGF import: pending Tab containment, failed-import editor focus, Close, Escape, Cancel, mobile Back, Photo Board, fresh retry and OGS username composition passed.');
}
