import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evaluate, navigate, setViewport, waitForExpression } from './browser.mjs';

export async function assertPhotoTraceKeyboard(cdp, appUrl, screenshotDir) {
  const wait = expression => waitForExpression(cdp, expression, { label: 'Photo trace keyboard navigation' });
  const key = async (key, code, virtual, modifiers = 0) => {
    for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', {
      type, key, code, windowsVirtualKeyCode: virtual, modifiers,
      ...(type === 'keyDown' && key === 'Enter' ? { text: '\r' } : {}),
    });
  };
  const click = async (selector, text) => {
    const point = await wait(`(() => {
      const e = [...document.querySelectorAll(${JSON.stringify(selector)})].find(e => ${text ? `e.textContent.includes(${JSON.stringify(text)})` : 'true'});
      if (!e || e.disabled) return false;
      e.scrollIntoView({ block: 'nearest' });
      const r = e.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
      return r.width && e.contains(document.elementFromPoint(x, y)) ? { x, y } : false;
    })()`);
    for (const type of ['mousePressed', 'mouseReleased']) await cdp.send('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 });
  };
  const focusedPoint = () => evaluate(cdp, 'document.activeElement?.getAttribute("data-photo-board-index")');
  const reports = [];
  for (const width of [1440, 390]) {
    const setup = await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
      localStorage.removeItem('web-katrain:auto_saved_game:v1');
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
    if (width === 390) {
      await click('[aria-label=Menu]'); await click('[aria-label="Open photo board"]');
    } else {
      await click('[aria-label="More file actions"]'); await click('button', 'Board from photo');
    }
    await wait('!!document.querySelector("[aria-labelledby=photo-board-title]")');
    if (width === 390) await click('[data-photo-board-mobile-tab=trace]');
    await wait('document.querySelectorAll("[data-photo-board-point]").length===361');
    assert.equal(await evaluate(cdp, 'document.querySelector("[data-photo-board-photo-align]").getBoundingClientRect().height'), 0, 'Manual tracing must not spend space on controls for an absent photo');
    assert.equal(await evaluate(cdp, `document.querySelectorAll('[data-photo-board-point][tabindex="0"]').length`), 1);
    // Tab into the grid from its actual preceding visible control.
    await evaluate(cdp, `(() => {
      const grid = document.querySelector('[data-photo-board-trace-grid]');
      const controls = [...document.querySelector('[aria-labelledby=photo-board-title]').querySelectorAll('button, input, select')]
        .filter(e => !e.disabled && e.tabIndex >= 0 && e.getBoundingClientRect().width && !e.closest('[hidden], [inert]'));
      const entry = controls.findIndex(e => grid.contains(e));
      if (entry < 1) throw Error('Trace grid must have a preceding control');
      window.photoTracePreviousControl = controls[entry - 1];
      photoTracePreviousControl.focus();
    })()`);
    await key('Tab', 'Tab', 9);
    assert.equal(await focusedPoint(), '180');
    await key('Enter', 'Enter', 13);
    await wait(`document.querySelector('[data-photo-board-index="180"]').getAttribute('aria-label').endsWith('black')`);
    await key(' ', 'Space', 32);
    await wait(`document.querySelector('[data-photo-board-index="180"]').getAttribute('aria-label').endsWith('empty')`);
    for (const [name, code, virtual, modifiers, index] of [
      ['ArrowRight', 'ArrowRight', 39, 0, 181], ['ArrowDown', 'ArrowDown', 40, 0, 200],
      ['ArrowLeft', 'ArrowLeft', 37, 0, 199], ['ArrowUp', 'ArrowUp', 38, 0, 180],
      ['Home', 'Home', 36, 0, 171], ['End', 'End', 35, 0, 189],
      ['Home', 'Home', 36, 2, 0], ['ArrowLeft', 'ArrowLeft', 37, 0, 18],
      ['ArrowUp', 'ArrowUp', 38, 0, 360], ['ArrowRight', 'ArrowRight', 39, 0, 342],
      ['ArrowDown', 'ArrowDown', 40, 0, 0], ['End', 'End', 35, 2, 360],
    ]) {
      await key(name, code, virtual, modifiers);
      assert.equal(await focusedPoint(), String(index), `${width}: ${name} (${modifiers})`);
    }
    for (const init of [
      { key: 'ArrowLeft', isComposing: true }, { key: 'ArrowLeft', keyCode: 229 },
      { key: 'ArrowLeft', ctrlKey: true }, { key: 'ArrowLeft', metaKey: true },
      { key: 'w', ctrlKey: true }, { key: 'w', metaKey: true },
      { key: 'w', isComposing: true }, { key: 'w', keyCode: 229 },
    ]) {
      assert.equal(await evaluate(cdp, `(async () => {
        const event = new KeyboardEvent('keydown', { ...${JSON.stringify(init)}, bubbles: true, cancelable: true });
        document.activeElement.dispatchEvent(event);
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return event.defaultPrevented;
      })()`), false);
      assert.equal(await focusedPoint(), '360');
      assert.equal(await evaluate(cdp, `document.querySelector('[aria-label="Trace tool"] [aria-pressed=true]')?.textContent.trim()`), 'Black');
    }
    await key('Tab', 'Tab', 9);
    assert.equal(await focusedPoint(), null, 'Tab must leave all 361 points');
    await key('Tab', 'Tab', 9, 8);
    assert.equal(await focusedPoint(), '360', 'Shift+Tab must return to the selected point');
    await click('[data-photo-board-index="5"]');
    await wait(`document.querySelector('[data-photo-board-index="5"]').getAttribute('aria-label').endsWith('black')`);
    assert.equal(await evaluate(cdp, `document.querySelectorAll('[data-photo-board-point][tabindex="0"]').length`), 1);
    assert.equal(await focusedPoint(), '5');
    await key('Tab', 'Tab', 9); await key('Tab', 'Tab', 9, 8);
    assert.equal(await focusedPoint(), '5', 'Pointer selection must update the keyboard entry point');
    await key('End', 'End', 35, 2);
    if (width === 390) await click('[data-photo-board-mobile-tab=photo]');
    for (const size of [9, 13, 19]) {
      await evaluate(cdp, `(() => {
        const select = [...document.querySelectorAll('[aria-labelledby=photo-board-title] select')].find(e => [...e.options].some(o => o.value==='9'));
        select.focus();
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, '${size}');
        select.dispatchEvent(new Event('change', { bubbles: true }));
      })()`);
      await wait(`document.querySelectorAll('[data-photo-board-point]').length===${size * size}`);
      assert.equal(await evaluate(cdp, `document.querySelectorAll('[data-photo-board-point][tabindex="0"]').length`), 1);
      assert.equal(await evaluate(cdp, 'document.activeElement?.tagName'), 'SELECT', 'Changing size must retain the size control');
      assert.equal(await evaluate(cdp, `document.querySelector('[data-photo-board-point][tabindex="0"]').getAttribute('data-photo-board-index')`),
        String(size === 19 ? 360 : Math.floor(size / 2) * (size + 1)), 'An out-of-range entry point must fall back to the centre');
    }
    if (width === 390) await click('[data-photo-board-mobile-tab=trace]');
    const tracedStones = () => evaluate(cdp, `Array.from(document.querySelectorAll('[data-photo-board-point]'))
      .filter(e=>!e.getAttribute('aria-label').endsWith('empty')).map(e=>e.getAttribute('aria-label'))`);
    await click('[aria-label="Trace tool"] button', 'White');
    await click('[data-photo-board-index="180"]');
    const beforeClear = await tracedStones();
    assert.equal(beforeClear.length, 2);
    await click('[data-photo-board-clear]');
    assert.deepEqual(await tracedStones(), []);
    assert.equal(await evaluate(cdp, 'document.activeElement===document.querySelector("[data-photo-board-clear]")'), true);
    assert.equal(await evaluate(cdp, 'document.querySelector("[data-photo-board-clear]").textContent.trim()'), 'Undo clear');
    await key('Tab', 'Tab', 9);
    assert.equal(await evaluate(cdp, 'document.querySelector("[aria-labelledby=photo-board-title]").contains(document.activeElement)'), true);
    await key('Tab', 'Tab', 9, 8);
    await key('Enter', 'Enter', 13);
    assert.deepEqual(await tracedStones(), beforeClear, 'Undo Clear must restore both stone colors and coordinates');
    assert.equal(await evaluate(cdp, 'document.querySelector("[data-photo-board-clear]").textContent.trim()'), 'Clear');
    await click('[data-photo-board-clear]');
    await click('[data-photo-board-index="0"]');
    await click('[aria-label="Trace tool"] button', 'Erase');
    await click('[data-photo-board-index="0"]');
    assert.deepEqual(await tracedStones(), []);
    assert.equal(await evaluate(cdp, 'document.querySelector("[data-photo-board-clear]").disabled'), true, 'A newer manual trace must discard the previous Clear snapshot');
    await click('[aria-label="Trace tool"] button', 'Black');
    await click('[data-photo-board-index="2"]');
    await click('[data-photo-board-clear]');
    if (width === 390) await click('[data-photo-board-mobile-tab=photo]');
    await evaluate(cdp, `(() => {
      const select=[...document.querySelectorAll('[aria-labelledby=photo-board-title] select')].find(e=>[...e.options].some(o=>o.value==='9'));
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,'9');
      select.dispatchEvent(new Event('change',{bubbles:true}));
    })()`);
    await wait('document.querySelectorAll("[data-photo-board-point]").length===81');
    assert.equal(await evaluate(cdp, 'document.querySelector("[data-photo-board-clear]").disabled'), true, 'Resizing must discard the incompatible Clear snapshot');
    reports.push({ width, oneTabStop: true, arrowsAndEdgeWrap: true, rowAndBoardHomeEnd: true,
      nativeEnterAndSpace: true, compositionAndModifierKeysIgnored: true, tabExitAndReturn: true,
      pointerUpdatesEntry: true, allBoardSizes: true, clearUndoKeepsFocus: true,
      clearUndoRestoresBothColors: true, newerTraceAndSizeDiscardUndo: true });
    await click('[aria-label="Close photo board"]');
    await wait('!document.querySelector("[aria-labelledby=photo-board-title]") && !history.state?.webKatrainOverlay');
  }
  fs.writeFileSync(path.join(screenshotDir, 'photo-trace-keyboard.json'), JSON.stringify(reports, null, 2));
  console.log('Photo trace keyboard: desktop/phone use one Tab stop, arrows/wrap/Home/End, ordinary activation, pointer re-entry, and valid entry points at every board size.');
}
