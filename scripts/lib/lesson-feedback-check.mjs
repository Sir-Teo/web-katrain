import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { captureHistoryEntry, waitForHistoryEntry, evaluate, navigate, setViewport, waitForExpression } from './browser.mjs';

export async function assertLessonFeedback(cdp, appUrl, screenshotDir) {
  const reports = [];
  let mobile = false;
  const wait = expression => waitForExpression(cdp, expression, { label: 'Visible lesson feedback' });
  const settle = () => evaluate(cdp, 'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))');
  const key = async (key, code, windowsVirtualKeyCode, modifiers = 0) => {
    for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode, modifiers });
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
  const screenshot = async file => {
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(screenshotDir, file), Buffer.from(shot.result.data, 'base64'));
  };
  for (const [width, height] of [[1440, 900], [390, 844], [320, 568], [568, 320]]) {
    mobile = width !== 1440;
    await setViewport(cdp, { width, height, mobile });
    const init = await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
      localStorage.removeItem('web-katrain:auto_saved_game:v1');
      localStorage.removeItem('web-katrain:shortcuts:v1');
      localStorage.removeItem('web-katrain:lesson_progress:v1');
      for(const key of Object.keys(localStorage))if(key.startsWith('web-katrain:lesson_progress:v2:'))localStorage.removeItem(key);
      localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');
      localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
      localStorage.setItem('web-katrain:settings:v3',JSON.stringify({soundEnabled:false,loadSgfFastAnalysis:false}));
    ` });
    try { await navigate(cdp, appUrl, 15000, { acceptBeforeUnload: true }); }
    finally { await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: init.result.identifier }); }
    await wait('!!document.querySelector("[data-board-snapshot]")');
    await settle();
    const entryHistory=await captureHistoryEntry(cdp);
    await key('k', 'KeyK', 75, 2);
    await click('[data-command-palette-search]');
    await cdp.send('Input.insertText', { text: 'Interactive lessons' });
    await click('[data-command-palette-item=lessons]');
    await click('[data-lesson-id=capture]');
    await click('.lessons-footer button:last-child');
    for (const [outcome, coordinate] of [['wrong', '0.7'], ['correct', '4.7']]) {
      const pageScroll = await evaluate(cdp, '({x:scrollX,y:scrollY})');
      await click(`.lessons-board circle[fill="transparent"][cx="${coordinate}"][cy="${coordinate}"]`);
      await wait('!!document.querySelector(".lessons-feedback")');
      await settle();
      const state = await evaluate(cdp, `(()=>{
        const feedback=document.querySelector('.lessons-feedback'),r=feedback.getBoundingClientRect();
        const body=document.querySelector('.lessons-body'),b=body.getBoundingClientRect();
        const board=document.querySelector('[data-static-board-interactive=true]');
        return {text:feedback.textContent,visible:r.top>=b.top&&r.bottom<=b.bottom,
          focused:document.activeElement===board,scroll:body.scrollTop,pageScroll:{x:scrollX,y:scrollY},
          nextDisabled:document.querySelector('.lessons-footer button:last-child').disabled};
      })()`);
      await screenshot(`lesson-feedback-${width}x${height}-${outcome}.png`);
      assert.equal(state.visible, true, `Lesson ${outcome} feedback must be fully visible at ${width}x${height}`);
      assert.equal(state.focused, true, 'Feedback must preserve keyboard focus on the board');
      assert.deepEqual(state.pageScroll, pageScroll, 'Feedback must not scroll the page behind the modal');
      assert.equal(state.nextDisabled, outcome === 'wrong');
      assert.ok(state.text.includes(outcome === 'wrong' ? 'Fill the only empty point' : 'Captured!'));
      if (width !== 320) assert.equal(state.scroll, 0, 'Roomy lesson panes must not scroll unnecessarily');
      reports.push({ width, height, outcome, ...state });
    }
    await click('.lessons-footer button:last-child');
    await wait('!!document.querySelector("[data-lesson-id=capture]")');
    await click('[data-lesson-id=capture]');
    assert.equal(await evaluate(cdp, 'document.querySelector(".lessons-body").scrollTop'), 0, 'Opening a lesson resets its pane');
    await click('.lessons-footer button:last-child');
    await wait('document.activeElement===document.querySelector("[data-static-board-interactive=true]")');
    for (const [outcome, arrow, code, keyCode] of [['wrong', 'ArrowUp', 'ArrowUp', 38], ['correct', 'ArrowDown', 'ArrowDown', 40]]) {
      await key(arrow, code, keyCode);
      await key('Enter', 'Enter', 13);
      await settle();
      const state = await evaluate(cdp, `(()=>{
        const e=document.querySelector('.lessons-feedback'),r=e?.getBoundingClientRect();
        const b=document.querySelector('.lessons-body').getBoundingClientRect();
        return {visible:!!r&&r.top>=b.top&&r.bottom<=b.bottom,text:e?.textContent,
          focused:document.activeElement===document.querySelector('[data-static-board-interactive=true]'),
          nextDisabled:document.querySelector('.lessons-footer button:last-child').disabled,pageScroll:{x:scrollX,y:scrollY}};
      })()`);
      await screenshot(`lesson-feedback-${width}x${height}-keyboard-${outcome}.png`);
      assert.equal(state.visible, true, 'Keyboard answers must expose the entire feedback');
      assert.equal(state.focused, true);
      assert.equal(state.nextDisabled, outcome === 'wrong');
      assert.ok(state.text.includes(outcome === 'wrong' ? 'Fill the only empty point' : 'Captured!'));
      assert.deepEqual(state.pageScroll, { x: 0, y: 0 });
      reports.push({ width, height, input: 'keyboard', outcome, ...state });
    }
    await click('[aria-label="Close lessons"]');
    await waitForHistoryEntry(cdp,entryHistory,'!document.querySelector("[aria-labelledby=lessons-title]")');
    console.log('Lesson feedback', JSON.stringify({ width, height, wrong: true, correct: true, keyboard: true, focusPreserved: true, reset: true }));
  }
  fs.writeFileSync(path.join(screenshotDir, 'lesson-feedback.json'), JSON.stringify(reports, null, 2));
}
