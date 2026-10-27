import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evaluate, navigate, setViewport, waitForExpression } from './browser.mjs';

export async function assertPasteSubmitKeyboard(cdp, appUrl, screenshotDir) {
  let mobile = false;
  const reports = [];
  const wait = expression => waitForExpression(cdp, expression, { label: 'Paste editor keyboard submission',
    diagnose: `({body:document.body.innerText.slice(0,1800),requests:window.pasteKeyboardRequests?.length,focus:document.activeElement?.outerHTML.slice(0,200)})` });
  const settle = () => evaluate(cdp, 'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))');
  const key = async (key, code, windowsVirtualKeyCode, modifiers = 0) => {
    for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode, modifiers,
      ...(type === 'keyDown' && key === 'Enter' ? { text: String.fromCharCode(13) } : {}) });
  };
  const click = async selector => {
    const point = await wait(`(()=>{
      const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)return false;
      e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
      return e.contains(document.elementFromPoint(x,y))?{x,y}:false;
    })()`);
    if (mobile) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else for (const type of ['mousePressed', 'mouseReleased']) {
      await cdp.send('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 });
    }
  };
  const editor = '.paste-sgf-modal-textarea';
  const value = () => evaluate(cdp, `document.querySelector('${editor}').value`);
  const edit = async text => {
    await click(editor);await key('a', 'KeyA', 65, 2);await cdp.send('Input.insertText', { text });
  };
  for (const [width, height] of [[1440, 900], [390, 844], [320, 568], [568, 320]]) {
    mobile = width !== 1440;
    await setViewport(cdp, { width, height, mobile });
    const setup = await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
      localStorage.removeItem('web-katrain:auto_saved_game:v1');localStorage.removeItem('web-katrain:shortcuts:v1');
      localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');
      localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
      localStorage.setItem('web-katrain:settings:v3',JSON.stringify({soundEnabled:false,loadSgfFastAnalysis:false}));
    ` });
    try { await navigate(cdp, appUrl, 15000, { acceptBeforeUnload: true }); }
    finally { await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: setup.result.identifier }); }
    await wait('!!document.querySelector("[data-board-snapshot]")');await settle();
    await evaluate(cdp, `(()=>{
      window.pasteKeyboardRequests=[];
      Object.defineProperty(navigator,'clipboard',{configurable:true,value:{readText:async()=>''}});
      const original=window.fetch;window.fetch=(url,init)=>String(url).includes('online-go.com/api/v1/games/')
        ?new Promise(resolve=>pasteKeyboardRequests.push({resolve,signal:init?.signal})):original(url,init);
    })()`);
    await key('k', 'KeyK', 75, 2);await click('[data-command-palette-search]');
    await cdp.send('Input.insertText', { text: 'Paste SGF' });await click('[data-command-palette-item=paste-sgf]');
    await wait(`!!document.querySelector('${editor}')`);await click(editor);
    for (const modifiers of [2, 4]) {
      await key('Enter', 'Enter', 13, modifiers);await settle();
      assert.equal(await value(), '', 'Empty shortcut input must keep the editor empty and open');
    }
    const draft = '(;GM[1]SZ[9]GN[Keyboard import];B[dd])';
    await edit(draft);await key('Enter', 'Enter', 13);await settle();
    assert.ok((await value()).includes('\n'), 'Ordinary Enter must insert a newline');
    await edit('https://online-go.com/game/12345');
    await evaluate(cdp, `document.querySelector('${editor}').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',ctrlKey:true,isComposing:true,bubbles:true,cancelable:true}));void 0`);
    await settle();assert.equal(await evaluate(cdp, 'pasteKeyboardRequests.length'), 0, 'IME confirmation must not submit');
    await key('Enter', 'Enter', 13, 2);await wait('pasteKeyboardRequests.length===1');
    await key('Enter', 'Enter', 13, 2);await key('Enter', 'Enter', 13, 4);await settle();
    assert.equal(await evaluate(cdp, 'pasteKeyboardRequests.length'), 1, 'Shortcuts must not duplicate a pending import');
    await evaluate(cdp, `pasteKeyboardRequests[0].resolve(new Response('invalid SGF'));void 0`);
    await wait(`!!document.querySelector('[aria-labelledby=paste-sgf-title] [role=alert]')&&!document.querySelector('[aria-label="Open pasted SGF or OGS URL"]').disabled`);
    assert.equal(await evaluate(cdp, `document.activeElement===document.querySelector('${editor}')`), true, 'A failed keyboard import must restore editor focus');
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(screenshotDir, `paste-submit-keyboard-${width}x${height}.png`), Buffer.from(shot.result.data, 'base64'));
    await edit(draft);await key('Enter', 'Enter', 13, 4);
    await wait('!document.querySelector(".paste-sgf-modal-textarea")&&document.querySelector("[data-board-snapshot]").dataset.boardSize==="9"');
    const result = { width, height, emptyIgnored: true, newline: true, compositionIgnored: true, controlEnter: true, pendingDeduplicated: true, failureFocus: true, metaEnter: true };
    reports.push(result);console.log('Paste keyboard submission', JSON.stringify(result));
  }
  fs.writeFileSync(path.join(screenshotDir, 'paste-submit-keyboard.json'), JSON.stringify(reports, null, 2));
}
