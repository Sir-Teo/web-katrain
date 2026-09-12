import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evaluate, setViewport, sleep } from './browser.mjs';
import { assertUnsavedNavigation } from './unsaved-navigation-check.mjs';

// Uses the real worker instrumentation installed by test:analysis. Complete a
// warm-up move, stop a second search in flight, then finish a fresh move. The
// UI must agree with the worker and no rejected request may retry after Stop.
export async function assertAiMoveCancellation(cdp, outputDir) {
  const reports = [];
  const wait = async (expression) => {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      const value = await evaluate(cdp, expression);
      if (value) return value;
      await sleep(50);
    }
    throw new Error(`AI move check timed out: ${expression}`);
  };
  const key = async (key, windowsVirtualKeyCode) => {
    const dispatchedAt = await evaluate(cdp, 'performance.now()');
    for (const type of ['keyDown', 'keyUp']) {
      await cdp.send('Input.dispatchKeyEvent', { type, key, code: key, windowsVirtualKeyCode });
    }
    return dispatchedAt;
  };
  const screenshot = async (name) => {
    const response = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(outputDir, `${name}.png`), Buffer.from(response.result.data, 'base64'));
  };
  const boardMoves = `Number(document.querySelector('[data-board-snapshot=true]')?.dataset.boardMoveCount)`;
  // The preceding live-analysis check leaves analysis mode enabled. Disable it
  // through its shortcut so playing a warm-up AI move does not also request a
  // separate evaluation 500 ms later.
  if (await evaluate(cdp, `document.querySelector('#wk-engine-pill-label')?.textContent==='Analysis mode'`)) {
    await key('Tab', 9);
    await wait(`document.querySelector('#wk-engine-pill-label')?.textContent!=='Analysis mode'`);
  }
  for (const [width, height] of [[1280, 800], [390, 844]]) {
    const mobile = width < 1000;
    const click = async (elementExpression) => {
      await wait(`!!(${elementExpression})`);
      await evaluate(cdp, `(${elementExpression}).scrollIntoView({block:'center'})`);
      const point = await wait(`(()=>{
        const e=${elementExpression}, r=e.getBoundingClientRect();
        const x=r.x+r.width/2, y=r.y+r.height/2;
        return !e.disabled && !e.closest('[inert]') && r.width && r.height
          && e.contains(document.elementFromPoint(x,y)) ? {x,y} : false;
      })()`);
      const dispatchedAt = await evaluate(cdp, 'performance.now()');
      if (mobile) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else {
        for (const type of ['mousePressed', 'mouseReleased']) {
          await cdp.send('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 });
        }
      }
      return dispatchedAt;
    };
    const tool = (label) => `[...document.querySelectorAll('[data-mobile-tools-dialog] button')]
      .find(e=>[...e.querySelectorAll('span')].some(s=>s.textContent===${JSON.stringify(label)}))`;
    const openTools = () => click(`document.querySelector('button[aria-label="Tools"]')`);
    const requestMove = async (keyboard = false) => {
      if (keyboard) await key('Enter', 13);
      else if (mobile) { await openTools(); await click(tool('AI move')); }
      else await click(`document.querySelector('button[title="AI move"]')`);
    };
    try {
      await setViewport(cdp, { width, height, mobile });
      await wait(`!!document.querySelector('[data-board-snapshot=true]')`);
      const initialMoves = await evaluate(cdp, boardMoves);
      const initialRequests = await evaluate(cdp, 'auditRequests.length');
      const lastId = await evaluate(cdp, 'auditRequests.at(-1)?.id ?? 0');
      await requestMove(!mobile);
      const warm = await wait(`auditResponses.find(r=>r.id>${lastId}&&r.type==='katago:analyze_result'&&r.ok&&r.visits>0)`);
      assert.equal(warm.backend, 'wasm');
      assert.equal(warm.canceled, false);
      await wait(`${boardMoves}===${initialMoves + 1}`);
      await requestMove(!mobile);
      const active = await wait(`auditRequests.find(r=>r.id>${warm.id})`);
      await sleep(500);
      if (mobile) await openTools();
      const stopDispatchedAt = mobile ? await click(tool('Stop analysis')) : await key('Escape', 27);
      const terminal = await wait(`auditResponses.find(r=>r.id===${active.id}&&r.type==='katago:analyze_result')`);
      assert.equal(terminal.canceled, true, 'Stop must cancel the AI worker search');
      const canceledAfterInputMs = terminal.at - stopDispatchedAt;
      assert.ok(canceledAfterInputMs >= 0, 'The AI search must still be active when Stop is pressed');
      assert.ok(canceledAfterInputMs < 1000, `AI worker searched another ${canceledAfterInputMs.toFixed(1)} ms`);
      await sleep(750);
      assert.equal(await evaluate(cdp, 'auditRequests.length'), initialRequests + 2, 'Stopped AI moves must not schedule retries');
      assert.equal(await evaluate(cdp, boardMoves), initialMoves + 1, 'The stopped AI must not play a move');
      if (mobile) {
        await openTools();
        assert.equal(await evaluate(cdp, `(${tool('Stop analysis')}).disabled`), true,
          'The phone must clear its thinking state');
        await screenshot(`${width}x${height}-ai-stopped-tools`);
        await click(`document.querySelector('button[aria-label="Close tools"]')`);
      } else {
        await wait(`document.querySelector('#wk-engine-pill-label')?.textContent!=='AI thinking…'`);
      }
      await screenshot(`${width}x${height}-ai-stopped`);
      await requestMove();
      const fresh = await wait(`auditResponses.find(r=>r.id>${active.id}&&r.type==='katago:analyze_result'&&r.ok&&r.visits>0)`);
      assert.equal(fresh.backend, 'wasm');
      assert.equal(fresh.canceled, false);
      await wait(`${boardMoves}===${initialMoves + 2}`);
      await sleep(350);
      assert.equal(await evaluate(cdp, 'auditRequests.length'), initialRequests + 3);
      await screenshot(`${width}x${height}-ai-restarted`);
      reports.push({ width, height, canceledAfterInputMs, warmVisits: warm.visits, freshVisits: fresh.visits,
        ...await evaluate(cdp, '({requests:auditRequests,responses:auditResponses})') });
      console.log(`AI move at ${width}x${height}: warm move, Stop, no retry, and fresh move passed.`);
      await assertUnsavedNavigation(cdp, await evaluate(cdp, 'location.href'), outputDir, { width, height });
    } catch (error) {
      await screenshot(`${width}x${height}-ai-failure`);
      fs.writeFileSync(path.join(outputDir, `${width}x${height}-ai-failure.json`), JSON.stringify(
        await evaluate(cdp, '({requests:auditRequests,responses:auditResponses})'), null, 2));
      throw error;
    }
  }
  fs.writeFileSync(path.join(outputDir, 'ai-move-results.json'), JSON.stringify(reports, null, 2));
}
