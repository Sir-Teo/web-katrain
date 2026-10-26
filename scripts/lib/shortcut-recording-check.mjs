import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evaluate, navigate, setViewport, waitForExpression } from './browser.mjs';

export async function assertShortcutRecording(cdp, appUrl, screenshotDir) {
  const reports = [];
  const wait = (expression) => waitForExpression(cdp, expression, { label: 'Shortcut recording' });
  const click = async (selector) => {
    const point = await wait(`(() => {
      const e = document.querySelector(${JSON.stringify(selector)});
      if (!e) return false;
      e.scrollIntoView({ block: 'nearest' });
      const r = e.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
      return r.width && e.contains(document.elementFromPoint(x, y)) ? { x, y } : false;
    })()`);
    for (const type of ['mousePressed', 'mouseReleased']) {
      await cdp.send('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 });
    }
  };
  for (const width of [1440, 390]) {
    const setup = await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
      localStorage.removeItem('web-katrain:auto_saved_game:v1');
      localStorage.removeItem('web-katrain:shortcuts:v1');
      localStorage.setItem('web-katrain:mobile_home_dismissed:v1', 'true');
      localStorage.setItem('web-katrain:pwa-install-dismissed:v1', 'true');
    ` });
    try {
      await setViewport(cdp, { width, height: width === 390 ? 844 : 900, mobile: width === 390 });
      await navigate(cdp, appUrl, 15000, { acceptBeforeUnload: true });
    } finally {
      await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: setup.result.identifier });
    }
    await wait('!!document.querySelector("[data-board-snapshot]")');
    await evaluate(cdp, `(() => {
      document.activeElement?.blur();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F8', bubbles: true }));
    })()`);
    await click('#tab-shortcuts');
    await click('[aria-label="Record shortcut for New game"]');
    await wait('!!document.querySelector("[data-shortcut-recording=true]")');
    const cases = [
      { key: 'Enter', isComposing: true },
      { key: 'Escape', isComposing: true },
      { key: 'Enter', keyCode: 229 },
      { key: 'Escape', keyCode: 229 },
      { key: 'Process', keyCode: 229 },
      { key: 'Dead' },
      { key: 'Unidentified' },
      { key: 'Compose' },
    ];
    for (const init of cases) {
      const state = await evaluate(cdp, `(async () => {
        const event = new KeyboardEvent('keydown', { ...${JSON.stringify(init)}, bubbles: true, cancelable: true });
        document.activeElement.dispatchEvent(event);
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return {
          recording: !!document.querySelector('[data-shortcut-recording=true]'),
          collision: !!document.querySelector('[data-shortcut-collision]'),
          overrides: localStorage.getItem('web-katrain:shortcuts:v1'),
          prevented: event.defaultPrevented,
        };
      })()`);
      assert.equal(state.recording, true, `${width}: ${JSON.stringify(init)} must leave recording active`);
      assert.equal(state.collision, false);
      assert.equal(state.overrides, null);
      if (init.isComposing || init.keyCode === 229) assert.equal(state.prevented, false);
    }
    // A normal trusted chord still records after ignored input-method events.
    for (const type of ['keyDown', 'keyUp']) {
      await cdp.send('Input.dispatchKeyEvent', {
        type, key: 'F9', code: 'F9', windowsVirtualKeyCode: 120, modifiers: 10,
      });
    }
    await wait('!document.querySelector("[data-shortcut-recording=true]")');
    const bindings = await evaluate(cdp, 'JSON.parse(localStorage.getItem("web-katrain:shortcuts:v1"))');
    assert.deepEqual(bindings['new-game'], [{ key: 'F9', ctrl: true, shift: true, alt: false }]);
    await click('[aria-label="Record shortcut for New game"]');
    await wait('!!document.querySelector("[data-shortcut-recording=true]")');
    for (const type of ['keyDown', 'keyUp']) {
      await cdp.send('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    }
    await wait('!document.querySelector("[data-shortcut-recording=true]")');
    assert.equal(await evaluate(cdp, '!!document.querySelector("[aria-labelledby=settings-title]")'), true);
    assert.deepEqual(await evaluate(cdp, 'JSON.parse(localStorage.getItem("web-katrain:shortcuts:v1"))'), bindings);
    await click('[aria-label="Close settings"]');
    await wait('!document.querySelector("[aria-labelledby=settings-title]")');
    await evaluate(cdp, `(() => {
      localStorage.removeItem('web-katrain:shortcuts:v1');
      window.dispatchEvent(new CustomEvent('web-katrain:shortcuts-updated'));
    })()`);
    reports.push({ width, ignoredInputMethodEvents: cases.length, normalChordRecorded: true, escapeCancelsOnlyRecording: true });
  }
  fs.writeFileSync(path.join(screenshotDir, 'shortcut-recording.json'), JSON.stringify(reports, null, 2));
  console.log('Shortcut recording: input-method keys ignored, normal chord recorded, and Escape cancels recording on desktop/phone.');
}
