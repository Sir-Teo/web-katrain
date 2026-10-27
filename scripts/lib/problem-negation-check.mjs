import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evaluate, navigate, setViewport, waitForExpression } from './browser.mjs';

export async function assertProblemNegation(cdp, appUrl, runDir, screenshotDir) {
  const comments = ['Not correct.', 'NOT RIGHT', '不正解', '不正确', '不正確'];
  const fixture = path.join(runDir, 'negated-problems.sgf');
  fs.writeFileSync(fixture, `(;GM[1]SZ[9]${comments.map(comment => `(;AB[aa]PL[B](;B[ee]C[${comment}])(;B[de]C[Correct.]))`).join('')})`);
  const wait = expression => waitForExpression(cdp, expression, { label: 'Negated problem verdicts',
    diagnose: `({message:document.querySelector('[data-problem-message]')?.textContent,focus:document.activeElement?.outerHTML.slice(0,200)})` });
  const key = async (key, code, windowsVirtualKeyCode, modifiers = 0) => {
    for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode, modifiers,
      ...(type === 'keyDown' && key === 'Enter' ? { text: '\r' } : {}) });
  };
  const click = async selector => {
    const point = await wait(`(()=>{
      const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)return false;
      e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
      return e.contains(document.elementFromPoint(x,y))?{x,y}:false;
    })()`);
    for (const type of ['mousePressed', 'mouseReleased']) await cdp.send('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 });
  };
  const boardFocused = 'document.activeElement?.getAttribute("data-static-board-interactive")==="true"';
  const feedbackReports = [];
  const assertFeedbackFits = async (width, index, kind, focusSelector) => {
    await evaluate(cdp, 'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))');
    const state = await evaluate(cdp, `(()=>{
      const e=document.querySelector('[data-problem-message]'),r=e.getBoundingClientRect();
      const body=document.querySelector('.problem-body'),b=body.getBoundingClientRect();
      return {text:e.textContent,visible:r.top>=b.top&&r.bottom<=b.bottom,scroll:body.scrollTop,
        focused:document.activeElement?.matches(${JSON.stringify(focusSelector)}),pageScroll:{x:scrollX,y:scrollY}};
    })()`);
    const shot=await cdp.send('Page.captureScreenshot',{format:'png'});
    fs.writeFileSync(path.join(screenshotDir,`problem-feedback-${width}-${index}-${kind}.png`),Buffer.from(shot.result.data,'base64'));
    assert.equal(state.visible,true,`${kind} problem feedback must be fully visible at ${width}px`);
    assert.equal(state.focused,true,'Revealing feedback must preserve the action or board focus');
    assert.deepEqual(state.pageScroll,{x:0,y:0});
    if(width!==320)assert.equal(state.scroll,0,'Roomy problem panes must not scroll unnecessarily');
    feedbackReports.push({width,index,kind,...state});
  };
  const reports = [];
  for (const [width, height] of [[1440, 900], [390, 844], [320, 568], [568, 320]]) {
    const setup = await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
      localStorage.removeItem('web-katrain:auto_saved_game:v1');localStorage.removeItem('web-katrain:shortcuts:v1');
      localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');
      localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
      localStorage.setItem('web-katrain:settings:v3',JSON.stringify({soundEnabled:false,loadSgfFastAnalysis:false,loadSgfRewind:true}));
    ` });
    try {
      await setViewport(cdp, { width, height, mobile: width !== 1440 });
      await navigate(cdp, appUrl, 15000, { acceptBeforeUnload: true });
    } finally { await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: setup.result.identifier }); }
    await wait('!!document.querySelector("[data-board-snapshot]")');
    const root = (await cdp.send('DOM.getDocument')).result.root;
    const input = (await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[type=file][accept^=".sgf"]:not([multiple])' })).result.nodeId;
    await cdp.send('DOM.setFileInputFiles', { nodeId: input, files: [fixture] });
    await wait('document.querySelector("[data-board-snapshot]")?.dataset.boardSize==="9"');
    await key('k', 'KeyK', 75, 2);await click('[data-command-palette-search]');
    await cdp.send('Input.insertText', { text: 'problem practice' });await click('[data-command-palette-item=problem-practice]');
    for (const [index, comment] of comments.entries()) {
      await wait(boardFocused);
      await evaluate(cdp,'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))');
      assert.equal(await evaluate(cdp,'document.querySelector(".problem-body").scrollTop'),0,'A new problem must reset its pane');
      await key('ArrowRight','ArrowRight',39);await key('Enter','Enter',13);
      await wait('document.querySelector("[data-problem-message]")?.textContent.includes("part of this problem")');
      await assertFeedbackFits(width,index,'unrecorded','[data-static-board-interactive=true]');
      const wheelPoint=await evaluate(cdp,`(()=>{const r=document.querySelector('.problem-body').getBoundingClientRect();return {x:r.right-12,y:r.top+Math.min(80,r.height/2)}})()`);
      await cdp.send('Input.dispatchMouseEvent',{type:'mouseWheel',...wheelPoint,deltaX:0,deltaY:-400});
      await wait('document.querySelector(".problem-body").scrollTop===0');
      await key('ArrowDown','ArrowDown',40);await key('Enter','Enter',13);
      await assertFeedbackFits(width,index,'unrecorded-repeat','[data-static-board-interactive=true]');
      await key('ArrowUp','ArrowUp',38);

      await key('ArrowLeft','ArrowLeft',37);await key('Enter','Enter',13);
      await wait('!!document.querySelector("[data-problem-message]")');
      await evaluate(cdp, 'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))');
      const state = await evaluate(cdp, `({message:document.querySelector('[data-problem-message]').textContent,
        retryFocused:document.activeElement?.hasAttribute('data-problem-retry')})`);
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(screenshotDir, `problem-negation-${width}-${index}.png`), Buffer.from(shot.result.data, 'base64'));
      fs.writeFileSync(path.join(screenshotDir, 'problem-negation-current.json'), JSON.stringify({ width, comment, ...state }, null, 2));
      assert.match(state.message, /^That line fails/, `Negated verdict ${comment} must not be graded correct`);
      assert.equal(state.retryFocused, true);
      await assertFeedbackFits(width,index,'refuted','[data-problem-retry]');
      await click('[data-problem-solution]');
      await wait('document.querySelector("[data-problem-message]")?.textContent==="Solution shown."');
      await assertFeedbackFits(width,index,'solution','[aria-label="Next problem"], [data-problem-retry]');
      assert.equal(await evaluate(cdp, `!!document.querySelector('[data-problem-modal] circle[fill="url(#sb-black)"][cx="3.7"][cy="4.7"]')`), true, 'Show Solution must select the correct D5 branch');
      assert.equal(await evaluate(cdp, `!!document.querySelector('[data-problem-modal] circle[fill="url(#sb-black)"][cx="4.7"][cy="4.7"]')`), false, 'Show Solution must skip the refuted E5 branch');
      if (index < comments.length - 1) await click('[aria-label="Next problem"]');
      reports.push({ width, height, comment, gradedWrong: true, retryFocused: true, correctSolution: true });
    }
    await click('[aria-label="Close problem practice"]');
    await wait('!document.querySelector("[data-problem-modal]")&&!history.state?.webKatrainOverlay');
    assert.equal(await evaluate(cdp, 'document.querySelector("[data-board-snapshot]").dataset.boardMoveCount'), '0');
    console.log('Negated problem verdicts', JSON.stringify({ width, height, cases: comments.length, gameUnchanged: true }));
  }
  fs.writeFileSync(path.join(screenshotDir, 'problem-feedback.json'), JSON.stringify(feedbackReports,null,2));
  fs.writeFileSync(path.join(screenshotDir, 'problem-negation.json'), JSON.stringify(reports, null, 2));
}
