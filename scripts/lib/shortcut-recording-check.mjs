import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evaluate, navigate, setViewport, waitForExpression } from './browser.mjs';

export async function assertShortcutRecording(cdp, appUrl, screenshotDir) {
  const reports = [];
  let currentWidth;
  let lastClick;
  const wait = async (expression) => {
    try {
      return await waitForExpression(cdp, expression, { label: 'Shortcut recording',
        diagnose: `({width:innerWidth,focus:document.activeElement?.getAttribute('aria-label'),
          dialog:!!document.querySelector('[aria-labelledby=settings-title]'),
          recording:!!document.querySelector('[data-shortcut-recording=true]'),
          conflict:!!document.querySelector('[data-shortcut-collision]'),
          reset:!!document.querySelector('[data-shortcut-reset-confirm]'),history:history.state})` });
    } catch (error) {
      const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(screenshotDir, `shortcut-recording-failure-${currentWidth}.png`), Buffer.from(screenshot.result.data, 'base64'));
      throw new Error(`${error.message}; last click: ${JSON.stringify(lastClick)}`, { cause: error });
    }
  };
  const click = async (selector) => {
    const point = await wait(`(() => {
      const e = document.querySelector(${JSON.stringify(selector)});
      if (!e) return false;
      e.scrollIntoView({ block: 'nearest' });
      const r = e.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
      return r.width && e.contains(document.elementFromPoint(x, y)) ? { x, y } : false;
    })()`);
    lastClick = { selector, ...point };
    for (const type of ['mousePressed', 'mouseReleased']) {
      await cdp.send('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 });
    }
  };
  for (const width of [1440, 390]) {
    currentWidth = width;
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
    await click('#tab-general');
    for (const tab of ['ai', 'general', 'shortcuts']) {
      const scrolled = await evaluate(cdp, `(() => {
        const content = document.querySelector('.settings-modal-content');
        content.scrollTop = content.scrollHeight;
        return content.scrollTop;
      })()`);
      assert.ok(scrolled > 0, 'The previous Settings tab must be scrolled before switching');
      await click(`#tab-${tab}`);
      await wait(`!!document.querySelector('#panel-${tab}') && document.querySelector('.settings-modal-content').scrollTop===0`);
    }
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
    const escape = async () => {
      for (const type of ['keyDown', 'keyUp']) {
        await cdp.send('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      }
    };
    const focusIsRecord = (id) => wait(`document.activeElement?.getAttribute('data-shortcut-record-id')===${JSON.stringify(id)}`);
    const focusIsSearch = () => wait('document.activeElement?.getAttribute("data-shortcut-search")==="true"');
    const resetAll = async (action) => {
      await click('[data-shortcut-reset-all]');
      await wait('!!document.querySelector("[data-shortcut-reset-confirm]")');
      await click(`[data-shortcut-reset-confirm] button:${action === 'Cancel' ? 'last-child' : 'first-child'}`);
      await wait('!document.querySelector("[data-shortcut-reset-confirm]")');
    };
    await resetAll('Cancel');
    await wait('document.activeElement?.hasAttribute("data-shortcut-reset-all")');
    await click('[data-shortcut-reset-all]');
    await escape();
    await wait('!document.querySelector("[data-shortcut-reset-confirm]")');
    await wait('document.activeElement?.hasAttribute("data-shortcut-reset-all")');
    await resetAll('Reset defaults');
    await focusIsSearch();
    await cdp.send('Input.insertText', { text: 'Previous move' });
    assert.equal(await evaluate(cdp, 'document.querySelector("[data-shortcut-search]").value'), 'Previous move');
    await click('[aria-label="Clear shortcut search"]');
    const showConflict = async () => {
      await click('[data-shortcut-record-id="new-game"]');
      await wait('!!document.querySelector("[data-shortcut-recording=true]")');
      for (const type of ['keyDown', 'keyUp']) {
        await cdp.send('Input.dispatchKeyEvent', { type, key: 's', code: 'KeyS', windowsVirtualKeyCode: 83, modifiers: 2 });
      }
      await wait('!!document.querySelector("[data-shortcut-collision]")');
      await wait(`document.activeElement===document.querySelector('[data-shortcut-collision] button:last-child')`);
      await wait(`(() => {
        const warning = document.querySelector('[data-shortcut-collision]').getBoundingClientRect();
        const scroll = document.querySelector('.settings-modal-content').getBoundingClientRect();
        return warning.top >= scroll.top - 1 && warning.bottom <= scroll.bottom + 1;
      })()`);
    };
    await showConflict();
    await evaluate(cdp, `document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 229, bubbles: true, cancelable: true }))`);
    assert.equal(await evaluate(cdp, '!!document.querySelector("[data-shortcut-collision]")'), true);
    const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(screenshotDir, `shortcut-conflict-${width}.png`), Buffer.from(screenshot.result.data, 'base64'));
    await escape();
    await wait('!document.querySelector("[data-shortcut-collision]")');
    await focusIsRecord('new-game');
    await showConflict();
    await click('[data-shortcut-collision] button:last-child');
    await focusIsRecord('new-game');
    await showConflict();
    await click('[data-shortcut-collision] button:first-child');
    await focusIsRecord('new-game');
    const replaced = await evaluate(cdp, 'JSON.parse(localStorage.getItem("web-katrain:shortcuts:v1"))');
    assert.deepEqual(replaced['new-game'], [{ key: 's', ctrl: true, shift: false, alt: false }]);
    assert.equal(replaced['save-sgf'], null);
    await resetAll('Reset defaults');
    await focusIsSearch();
    await cdp.send('Input.insertText', { text: 'Previous move' });
    await click('[data-shortcut-record-id="nav-back"] + button');
    await focusIsRecord('nav-back');
    await click('[aria-label="Clear shortcut search"]');
    await cdp.send('Input.insertText', { text: 'Next move' });
    await click('[data-shortcut-record-id="nav-forward"] + button');
    await focusIsRecord('nav-forward');
    await click('[data-shortcut-filter="custom"]');
    await click('[aria-label="Clear shortcut search"]');
    await cdp.send('Input.insertText', { text: 'Previous move' });
    await click('[data-shortcut-record-id="nav-back"] ~ button:last-child');
    await focusIsSearch();
    assert.equal(await evaluate(cdp, 'document.querySelector("[data-shortcut-filter=custom]").getAttribute("aria-pressed")'), 'true');
    assert.equal(await evaluate(cdp, '!!document.querySelector("[data-shortcut-search-empty]")'), true);
    await resetAll('Reset defaults');
    await focusIsSearch();
    await click('[aria-label="Close settings"]');
    await wait('!document.querySelector("[aria-labelledby=settings-title]")');
    await wait('!history.state?.webKatrainOverlay');
    await evaluate(cdp, `(() => {
      localStorage.removeItem('web-katrain:shortcuts:v1');
      window.dispatchEvent(new CustomEvent('web-katrain:shortcuts-updated'));
    })()`);
    reports.push({ width, ignoredInputMethodEvents: cases.length, normalChordRecorded: true, escapeCancelsOnlyRecording: true, resetAndConflictFocusRetained: true, filteredRowRemovalFocusesSearch: true });
  }
  fs.writeFileSync(path.join(screenshotDir, 'shortcut-recording.json'), JSON.stringify(reports, null, 2));
  console.log('Shortcut editor: composition, real recording, visible conflicts, Cancel/Replace/Reset focus return, and filtered-row fallback passed on desktop/phone.');
}
