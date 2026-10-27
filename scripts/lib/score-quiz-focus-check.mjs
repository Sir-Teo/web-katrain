import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { captureHistoryEntry, waitForHistoryEntry, evaluate, navigate, setViewport, waitForExpression } from './browser.mjs';

export async function assertScoreQuizFocus(cdp, appUrl, screenshotDir) {
  let mobile = false;
  const reports = [];
  const wait = expression => waitForExpression(cdp, expression, { label: 'Score quiz keyboard focus',
    diagnose: `({focus:document.activeElement?.outerHTML.slice(0,250),requests:window.scoreQuizFocusRequests?.length,quiz:document.querySelector('[aria-labelledby=score-quiz-title]')?.innerText,history:history.state})` });
  const settle = () => evaluate(cdp, 'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))');
  const key = async (key, code, windowsVirtualKeyCode, modifiers = 0) => {
    for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode, modifiers,
      ...(type === 'keyDown' && key === 'Enter' ? { text: '\r' } : {}) });
  };
  const click = async (selector, text) => {
    const point = await wait(`(()=>{
      const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>${text ? `e.textContent.trim()===${JSON.stringify(text)}` : 'true'});
      if(!e||e.disabled)return false;e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
      return e.contains(document.elementFromPoint(x,y))?{x,y}:false;
    })()`);
    if (mobile) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else for (const type of ['mousePressed', 'mouseReleased']) {
      await cdp.send('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 });
    }
  };
  const quiz = '[aria-labelledby=score-quiz-title]';
  const inputFocused = `document.activeElement===document.querySelector('${quiz} input')`;
  const againFocused = `document.activeElement?.textContent.trim()==='Guess again'`;
  const respond = async (index, score, error) => evaluate(cdp, `(()=>{
    const r=scoreQuizFocusRequests[${index}];
    r.worker.dispatchEvent(new MessageEvent('message',{data:{type:'katago:eval_result',id:r.message.id,ok:${!error},
      ${error ? `error:${JSON.stringify(error)}` : `eval:{rootScoreLead:${score},rootWinRate:0.6,rootScoreSelfplay:${score},rootScoreStdev:1}`}}}));
  })()`);
  const open = async () => {
    await key('k', 'KeyK', 75, 2);await click('[data-command-palette-search]');
    await cdp.send('Input.insertText', { text: 'Score estimation' });await click('[data-command-palette-item=score-quiz]');
    await wait(inputFocused);
  };
  const pending = async count => {
    await wait(`scoreQuizFocusRequests.length===${count}`);await settle();
    assert.equal(await evaluate(cdp, `document.activeElement===document.querySelector('${quiz}')`), true, 'A disabled submit control must hand focus to the quiz');
    assert.equal(await evaluate(cdp, `document.querySelector('${quiz}').getAttribute('aria-busy')`), 'true');
  };
  const feedback = async (selector, width, kind) => {
    await settle();
    const state = await evaluate(cdp, `(()=>{
      const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect(),b=document.querySelector('.score-quiz-body').getBoundingClientRect();
      return {text:e.textContent,role:e.getAttribute('role'),visible:r.top>=b.top&&r.bottom<=b.bottom,pageScroll:{x:scrollX,y:scrollY},bounds:{top:r.top,bottom:r.bottom,height:r.height},pane:{top:b.top,bottom:b.bottom,height:b.height,scroll:document.querySelector('.score-quiz-body').scrollTop,scrollHeight:document.querySelector('.score-quiz-body').scrollHeight}};
    })()`);
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(screenshotDir, `score-quiz-focus-${width}-${kind}.png`), Buffer.from(shot.result.data, 'base64'));
    fs.writeFileSync(path.join(screenshotDir,`score-quiz-focus-${width}-${kind}.json`),JSON.stringify(state,null,2));
    assert.equal(state.visible, true, `${kind} score feedback must be fully visible`);
    assert.deepEqual(state.pageScroll, { x: 0, y: 0 });
    assert.equal(state.role, kind === 'error' ? 'alert' : 'status');
    return state;
  };
  for (const [width, height] of [[1440, 900], [390, 844], [320, 568], [568, 320]]) {
    mobile = width !== 1440;
    const setup = await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
      performance.setResourceTimingBufferSize(5000);
      localStorage.removeItem('web-katrain:auto_saved_game:v1');localStorage.removeItem('web-katrain:shortcuts:v1');
      localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
      localStorage.setItem('web-katrain:settings:v3',JSON.stringify({soundEnabled:false,loadSgfFastAnalysis:false}));
      window.scoreQuizFocusRequests=[];
      const post=Worker.prototype.postMessage;
      Worker.prototype.postMessage=function(message,...rest){
        // Hold actual client protocol requests; leave all other worker traffic intact.
        if(message?.type==='katago:eval'){scoreQuizFocusRequests.push({worker:this,message});return;}
        return post.call(this,message,...rest);
      };
    ` });
    try { await setViewport(cdp, { width, height, mobile });await navigate(cdp, appUrl, 15000, { acceptBeforeUnload: true }); }
    finally { await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: setup.result.identifier }); }
    await wait('!!document.querySelector("[data-board-snapshot]")');await settle();
    const entryHistory=await captureHistoryEntry(cdp);await open();
    const original = await evaluate(cdp, `({stones:document.querySelector('[data-board-snapshot]').dataset.boardStones,moves:document.querySelector('[data-board-snapshot]').dataset.boardMoveCount})`);
    await key('Enter', 'Enter', 13);await pending(1);
    await respond(0, 0, 'Could not evaluate this position. Check that the model is available, then try again.');
    await wait(inputFocused);await wait('!!document.querySelector("#score-quiz-evaluation-error")');
    const failure = await feedback('#score-quiz-evaluation-error', width, 'error');
    assert.equal(await evaluate(cdp, `document.querySelector('${quiz} input').getAttribute('aria-describedby')`), 'score-quiz-evaluation-error');
    await key('Enter', 'Enter', 13);await pending(2);await respond(1, 5);await wait(againFocused);
    const result = await feedback('.score-quiz-response[role=status]', width, 'result');
    assert.ok(result.text.includes('Black +5.0'));
    await key('Enter', 'Enter', 13);await wait(inputFocused);
    await key('Enter', 'Enter', 13);await pending(3);
    for (const modifiers of [0, 8, 0, 8]) {
      await key('Tab', 'Tab', 9, modifiers);
      assert.equal(await evaluate(cdp, `document.querySelector('${quiz}').contains(document.activeElement)`), true, 'Pending Tab navigation must stay inside the quiz');
    }
    assert.equal(await evaluate(cdp, 'document.activeElement?.getAttribute("aria-label")'), 'Close quiz');
    await respond(2, 7);await wait('!!document.querySelector(".score-quiz-response[role=status]")');await settle();
    assert.equal(await evaluate(cdp, 'document.activeElement?.getAttribute("aria-label")'), 'Close quiz', 'A result must preserve a control the user chose while waiting');
    assert.ok(await evaluate(cdp, 'document.querySelector(".score-quiz-stats")?.textContent.includes("Rounds: 1")'), 'Retrying a known position must not inflate the score');
    await click('.score-quiz-footer button', 'Guess again');await wait(inputFocused);
    await click('[aria-label="Reveal score"]');await pending(4);
    await key('Tab', 'Tab', 9);await key('Enter', 'Enter', 13);
    await waitForHistoryEntry(cdp,entryHistory,`!document.querySelector('${quiz}')`);
    await respond(3, 99);await settle();assert.equal(await evaluate(cdp, `!!document.querySelector('${quiz}')`), false, 'A dismissed evaluation must not restore the quiz');
    assert.deepEqual(await evaluate(cdp, `({stones:document.querySelector('[data-board-snapshot]').dataset.boardStones,moves:document.querySelector('[data-board-snapshot]').dataset.boardMoveCount})`), original);
    await open();assert.equal(await evaluate(cdp, '!!document.querySelector(".score-quiz-stats")'), false, 'Reopening starts a fresh quiz');
    await click('[aria-label="Close quiz"]');await waitForHistoryEntry(cdp,entryHistory,`!document.querySelector('${quiz}')`);
    reports.push({ width, height, error: failure, result, pendingTabContained: true, retryFocus: true, resultFocus: true, chosenFocusPreserved: true, lateReplyIgnored: true, gameUnchanged: true });
    console.log('Score quiz focus', JSON.stringify({ width, height, retry: true, result: true, pendingTabs: true, lateReply: true }));
  }
  fs.writeFileSync(path.join(screenshotDir, 'score-quiz-focus.json'), JSON.stringify(reports, null, 2));
}
