import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evaluate, navigate, sleep } from './browser.mjs';

// Run after a real AI move: the game is dirty and WASM has initialized. A
// beforeunload confirmation must preserve the page when canceled and allow
// the saved game to be recovered after an explicitly accepted navigation.
export async function assertUnsavedNavigation(cdp, appUrl, outputDir, { width, height, gameRules }) {
  const mobile = width < 1000;
  const stem = `${width}x${height}-unsaved-navigation`;
  const dialogs = [];
  const unsubscribe = cdp.on(message => {
    if (message.method === 'Page.javascriptDialogOpening') dialogs.push({ event: 'opened', type: message.params.type });
    if (message.method === 'Page.javascriptDialogClosed') dialogs.push({ event: 'closed', accepted: message.params.result });
  });
  const wait = async expression => {
    for (let i = 0; i < 100; i++) {
      const value = await evaluate(cdp, expression);
      if (value) return value;
      await sleep(100);
    }
    throw new Error(`Unsaved navigation check timed out: ${expression}`);
  };
  const board = () => evaluate(cdp, `(()=>{
    const d=document.querySelector('[data-board-snapshot=true]').dataset;
    return {size:d.boardSize,stones:d.boardStones,moves:Number(d.boardMoveCount),player:d.boardCurrentPlayer};
  })()`);
  const screenshot = async suffix => {
    const response = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(outputDir, `${stem}-${suffix}.png`), Buffer.from(response.result.data, 'base64'));
  };
  const click = async expression => {
    const point = await wait(`(()=>{
      const e=${expression};if(!e)return false;const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
      return r.width&&!e.disabled&&e.contains(document.elementFromPoint(x,y))?{x,y}:false;
    })()`);
    if (mobile) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      for (const type of ['mousePressed', 'mouseReleased']) {
        await cdp.send('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 });
      }
    }
  };
  try {
    const before = await board();
    assert.ok(before.moves > 0, 'Navigation must start with a played game');
    // Let the final move's 500 ms autosave debounce finish. The recovered
    // board below verifies that the saved SGF includes the latest position.
    await sleep(650);
    const saved = await wait(`(()=>{
      const raw=localStorage.getItem('web-katrain:auto_saved_game:v1');
      return raw?JSON.parse(raw):false;
    })()`);
    const sgfRule = {
      japanese: 'Japanese', korean: 'Korean', chinese: 'Chinese', aga: 'AGA',
      'new-zealand': 'New Zealand', 'tromp-taylor': 'Tromp-Taylor', 'stone-scoring': 'Stone Scoring',
    }[gameRules];
    assert.ok(sgfRule, 'Recovery QA requires a known rules preset');
    assert.ok(saved.sgf.includes(`RU[${sgfRule}]`), 'Autosaved SGF must describe the rules used to play');
    await evaluate(cdp, `window.unsavedNavigationMarker=${JSON.stringify(stem)}`);
    const startedCancel = performance.now();
    await assert.rejects(navigate(cdp, appUrl), /Navigation blocked by beforeunload/);
    const cancelMs = performance.now() - startedCancel;
    assert.equal(await evaluate(cdp, 'window.unsavedNavigationMarker'), stem, 'Cancel must preserve the same document');
    assert.deepEqual(await board(), before, 'Cancel must preserve the board and turn');
    assert.equal(await evaluate(cdp, `JSON.parse(localStorage.getItem('web-katrain:auto_saved_game:v1')).sgf`), saved.sgf);
    await screenshot('kept');

    const startedLeave = performance.now();
    await navigate(cdp, appUrl, 15000, { acceptBeforeUnload: true });
    const navigationMs = performance.now() - startedLeave;
    assert.equal(await evaluate(cdp, 'window.unsavedNavigationMarker'), undefined, 'Accepted navigation must load a new document');
    const restore = `[...document.querySelectorAll('[role="dialog"] button')].find(b=>b.textContent.trim()==='Restore Game')`;
    await wait(`!!(${restore})`);
    assert.equal(await evaluate(cdp, `JSON.parse(localStorage.getItem('web-katrain:auto_saved_game:v1')).sgf`), saved.sgf,
      'Reload must preserve the complete SGF for recovery');
    await screenshot('recovery');
    await click(restore);
    await wait(`Number(document.querySelector('[data-board-snapshot=true]')?.dataset.boardMoveCount)===${before.moves}`);
    // A reload can reopen the phone's start screen. Continue through it with
    // touch so a recovered board hidden behind that screen cannot pass QA.
    const continueBoard = `[...document.querySelectorAll('.mobile-home-actions--primary button')].find(b=>b.querySelector('.mobile-home-action-label-full')?.textContent==='Continue board'&&b.getBoundingClientRect().width>0)`;
    if (await evaluate(cdp, `!!(${continueBoard})`)) await click(continueBoard);
    await wait(`(()=>{
      const e=document.querySelector('[data-board-snapshot=true]'),r=e.getBoundingClientRect();
      return r.width>100&&r.left>=0&&r.right<=innerWidth+1&&e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));
    })()`);
    const restored = await board();
    assert.deepEqual(restored, before, 'Recovery must restore every stone, the move number and the next player');
    assert.deepEqual(dialogs, [
      { event: 'opened', type: 'beforeunload' }, { event: 'closed', accepted: false },
      { event: 'opened', type: 'beforeunload' }, { event: 'closed', accepted: true },
    ]);
    await screenshot('restored');
    // Inspect the real worker request after restoration: correct stones and
    // an unchanged save do not prove that the loaded game kept its rules.
    const analyze = mobile
      ? `document.querySelector('button[title^="Toggle analysis mode"]')`
      : `document.querySelector('.analyze-toggle')`;
    await click(analyze);
    const response = await wait('auditResponses.find(r=>r.ok&&r.visits>0)');
    const request = await evaluate(cdp, `auditRequests.find(r=>r.id===${response.id})`);
    assert.equal(request.rules, gameRules, 'Recovered analysis must use the original rules');
    assert.ok(await evaluate(cdp, `auditRequests.every(r=>r.rules===${JSON.stringify(gameRules)})`),
      'Every request after recovery must use the original rules');
    assert.equal(response.backend, 'wasm');
    // Desktop Analyze controls continuous search; Tab also leaves analysis
    // mode so the next AI-move fixture cannot schedule a second evaluation.
    if (mobile) await click(analyze);
    else for (const type of ['keyDown', 'keyUp']) {
      await cdp.send('Input.dispatchKeyEvent', { type, key: 'Tab', windowsVirtualKeyCode: 9 });
    }
    await wait(`auditResponses.some(r=>r.id===${request.id}&&r.type==='katago:analyze_result')`);
    fs.writeFileSync(path.join(outputDir, `${stem}.json`), JSON.stringify({ width, height, gameRules, sgfRule,
      before, restored, request, response, dialogs, cancelMs, navigationMs }, null, 2));
    console.log(`Unsaved game at ${width}x${height}: Cancel preserves the document; Leave and Restore recover the position and ${gameRules} analysis.`);
  } finally {
    unsubscribe();
  }
}
