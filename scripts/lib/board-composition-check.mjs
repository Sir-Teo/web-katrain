import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evaluate, loadedModuleUrl, navigate, setViewport, waitForExpression } from './browser.mjs';

export async function assertBoardComposition(cdp, appUrl, screenshotDir) {
  const wait = expression => waitForExpression(cdp, expression, { label: 'Board composition keys' });
  const key = async (key, code, windowsVirtualKeyCode, modifiers = 0) => {
    for (const type of ['keyDown', 'keyUp']) {
      await cdp.send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode, modifiers, ...(type === 'keyDown' && key === 'Enter' ? { text: '\r' } : {}) });
    }
  };
  const compositionKeys = [
    { key: 'Enter', isComposing: true }, { key: 'Enter', keyCode: 229 },
    { key: ' ', isComposing: true }, { key: ' ', keyCode: 229 },
    { key: 'ArrowLeft', isComposing: true }, { key: 'ArrowLeft', keyCode: 229 },
    { key: 'Escape', isComposing: true }, { key: 'Escape', keyCode: 229 },
  ];
  const reports = [];
  const buffer = await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: 'performance.setResourceTimingBufferSize(5000)' });
  try {
    for (const width of [1440, 390]) {
      const setup = await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
        localStorage.removeItem('web-katrain:auto_saved_game:v1');
        localStorage.removeItem('web-katrain:shortcuts:v1');
        localStorage.setItem('web-katrain:mobile_home_dismissed:v1', 'true');
        localStorage.setItem('web-katrain:pwa-install-dismissed:v1', 'true');
        localStorage.setItem('web-katrain:settings:v3', JSON.stringify({ soundEnabled: false, loadSgfFastAnalysis: false }));
      ` });
      try {
        await setViewport(cdp, { width, height: width === 390 ? 844 : 900, mobile: width === 390 });
        await navigate(cdp, appUrl, 15000, { acceptBeforeUnload: true });
      } finally {
        await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: setup.result.identifier });
      }
      await wait('!!document.querySelector("[data-board-snapshot]")');
      await evaluate(cdp, 'document.querySelector("[data-board-snapshot]").focus()');
      await key('ArrowRight', 'ArrowRight', 39);
      await wait('!!document.querySelector("[data-board-keyboard-cursor]")');
      const readMain = () => evaluate(cdp, `(() => {
        const board = document.querySelector('[data-board-snapshot]');
        const cursor = board.querySelector('[data-board-keyboard-cursor]');
        return { moves: board.dataset.boardMoveCount, stones: board.dataset.boardStones,
          mode: board.dataset.boardInputMode, cursor: cursor ? [cursor.style.left, cursor.style.top] : null };
      })()`);
      const baseline = await readMain();
      const globalCompositionKeys = [
        { key: 'F8', isComposing: true }, { key: 'n', keyCode: 229 },
        { key: 'S', shiftKey: true, isComposing: true }, { key: 'F', shiftKey: true, keyCode: 229 },
      ];
      for (const init of [...compositionKeys, ...globalCompositionKeys]) {
        const prevented = await evaluate(cdp, `(async () => {
          const event = new KeyboardEvent('keydown', { ...${JSON.stringify(init)}, bubbles: true, cancelable: true });
          document.querySelector('[data-board-snapshot]').dispatchEvent(event);
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          return event.defaultPrevented;
        })()`);
        assert.deepEqual(await readMain(), baseline, `${width}: main board changed for ${JSON.stringify(init)}`);
        assert.equal(prevented, false, `The input method must retain ${JSON.stringify(init)}`);
        assert.equal(await evaluate(cdp, `!!document.querySelector('[role=dialog], [aria-label="Manual score"], [aria-label="Focus mode controls"]')`), false);
      }
      await key('Enter', 'Enter', 13);
      await wait('document.querySelector("[data-board-snapshot]")?.dataset.boardMoveCount==="1"');

      // Mount the same component used by lessons, tsumego and Guess the Move.
      // Count its real point callback without a grading or engine dependency.
      await evaluate(cdp, `(async () => {
        const url = ${loadedModuleUrl.toString()};
        const { default: React } = await import(url('/deps/react.js'));
        const { default: ReactDOM } = await import(url('/deps/react-dom_client.js'));
        const { StaticBoard } = await import(url('/src/components/StaticBoard.tsx', true));
        const host = document.createElement('div');
        host.dataset.boardCompositionFixture = 'true';
        host.style.cssText = 'position:fixed;z-index:9999;inset:20px auto auto 20px;width:280px;background:white';
        document.body.append(host);
        const root = ReactDOM.createRoot(host);
        window.boardCompositionPicks = [];
        window.cleanupBoardComposition = () => { root.unmount(); host.remove(); };
        root.render(React.createElement(StaticBoard, {
          board: Array.from({ length: 9 }, () => Array(9).fill(null)),
          ariaLabel: 'Composition test problem',
          onPointClick: (x, y) => boardCompositionPicks.push({ x, y }),
        }));
      })()`);
      await wait('!!document.querySelector("[data-board-composition-fixture] svg")');
      await evaluate(cdp, 'document.querySelector("[data-board-composition-fixture] svg").focus()');
      await key('ArrowRight', 'ArrowRight', 39);
      const readStudy = () => evaluate(cdp, `({
        picks: boardCompositionPicks,
        cursor: document.querySelector('[data-board-composition-fixture] svg').getAttribute('data-static-board-cursor'),
      })`);
      const studyBaseline = await readStudy();
      assert.ok(studyBaseline.cursor);
      const modifierKeys = ['ctrlKey', 'altKey', 'metaKey'].flatMap(modifier =>
        ['Enter', ' ', 'ArrowLeft', 'Escape'].map(key => ({ key, [modifier]: true })));
      for (const init of [...compositionKeys, ...modifierKeys]) {
        const prevented = await evaluate(cdp, `(async () => {
          const event = new KeyboardEvent('keydown', { ...${JSON.stringify(init)}, bubbles: true, cancelable: true });
          document.querySelector('[data-board-composition-fixture] svg').dispatchEvent(event);
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          return event.defaultPrevented;
        })()`);
        assert.deepEqual(await readStudy(), studyBaseline, `${width}: study board changed for ${JSON.stringify(init)}`);
        assert.equal(prevented, false);
      }
      await key('Enter', 'Enter', 13);
      await key(' ', 'Space', 32);
      assert.equal((await readStudy()).picks.length, 2, 'Ordinary Enter and Space must still answer');
      await key('Escape', 'Escape', 27);
      assert.equal((await readStudy()).cursor, null, 'Ordinary Escape still clears the cursor');
      await evaluate(cdp, 'cleanupBoardComposition()');
      for (const mode of [
        { key: 'F', code: 'KeyF', virtual: 70, selector: '[aria-label="Focus mode controls"]' },
        { key: 'S', code: 'KeyS', virtual: 83, selector: '[aria-label="Manual score"]' },
      ]) {
        await key(mode.key, mode.code, mode.virtual, 8);
        await wait(`!!document.querySelector(${JSON.stringify(mode.selector)})`);
        for (const init of [{ key: 'Escape', isComposing: true }, { key: 'Escape', keyCode: 229 }]) {
          const retained = await evaluate(cdp, `(async () => {
            const event = new KeyboardEvent('keydown', { ...${JSON.stringify(init)}, bubbles: true, cancelable: true });
            window.dispatchEvent(event);
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            return { open: !!document.querySelector(${JSON.stringify(mode.selector)}), prevented: event.defaultPrevented };
          })()`);
          assert.deepEqual(retained, { open: true, prevented: false }, `${mode.key}: composition Escape must preserve the mode`);
        }
        await key('Escape', 'Escape', 27);
        await wait(`!document.querySelector(${JSON.stringify(mode.selector)})`);
      }
      reports.push({ width, mainCompositionKeys: compositionKeys.length, studyCompositionKeys: compositionKeys.length,
        studyModifierKeys: modifierKeys.length, globalCompositionShortcutsIgnored: true,
        focusAndScoringRetainedDuringComposition: true, ordinaryPlayAndAnswersRetained: true });
    }
  } finally {
    await evaluate(cdp, 'window.cleanupBoardComposition?.()');
    await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: buffer.result.identifier });
  }
  fs.writeFileSync(path.join(screenshotDir, 'board-composition.json'), JSON.stringify(reports, null, 2));
  console.log('Board keys: desktop/phone retain IME keys, leave modified study keys alone, preserve focus/scoring during composition, and retain ordinary play and answers.');
}
