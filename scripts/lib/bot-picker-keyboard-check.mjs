import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evaluate, navigate, setViewport, waitForExpression } from './browser.mjs';

export async function assertBotPickerKeyboard(cdp, appUrl, screenshotDir) {
  const wait = expression => waitForExpression(cdp, expression, { label: 'Bot picker keyboard navigation' });
  const key = async (key, code, windowsVirtualKeyCode, modifiers = 0) => {
    for (const type of ['keyDown', 'keyUp']) {
      await cdp.send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode, modifiers });
    }
  };
  const board = () => evaluate(cdp, `(() => {
    const d = document.querySelector('[data-board-snapshot]').dataset;
    return { size: d.boardSize, stones: d.boardStones, moves: d.boardMoveCount, player: d.boardCurrentPlayer };
  })()`);
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
    const before = await board();
    await evaluate(cdp, `(() => {
      document.activeElement?.blur();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true }));
    })()`);
    await wait('!!document.querySelector("#new-game-opponent")');
    await evaluate(cdp, `(() => {
      const input = document.querySelector('#new-game-opponent');
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(input, 'white');
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.focus();
    })()`);
    await wait('!!document.querySelector("[data-bot-persona]")');
    const ids = await evaluate(cdp, '[...document.querySelectorAll("[data-bot-persona]")].map(e => e.dataset.botPersona)');
    assert.ok(ids.length > 2);
    const oneStop = () => evaluate(cdp, '[...document.querySelectorAll("[data-bot-persona]")].filter(e => e.tabIndex === 0).length');
    assert.equal(await oneStop(), 1);
    await key('Tab', 'Tab', 9);
    await wait(`document.activeElement?.dataset.botPersona===${JSON.stringify(ids[0])}`);
    const selected = (index) => wait(`(() => {
      const checked = document.querySelector('[data-bot-persona][aria-checked=true]');
      return checked?.dataset.botPersona===${JSON.stringify(ids[index])} && checked===document.activeElement && checked.tabIndex===0;
    })()`);
    for (const [name, vk, index] of [
      ['ArrowRight', 39, 1], ['ArrowLeft', 37, 0], ['ArrowUp', 38, ids.length - 1],
      ['ArrowDown', 40, 0], ['End', 35, ids.length - 1], ['Home', 36, 0], ['ArrowRight', 39, 1],
    ]) {
      await key(name, name, vk);
      await selected(index);
      assert.equal(await oneStop(), 1);
    }
    for (const init of [{ isComposing: true }, { keyCode: 229 }, { ctrlKey: true }, { altKey: true }, { metaKey: true }]) {
      await evaluate(cdp, `document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', ...${JSON.stringify(init)}, bubbles: true, cancelable: true }))`);
      await selected(1);
    }
    await key('Tab', 'Tab', 9);
    assert.equal(await evaluate(cdp, 'document.activeElement?.hasAttribute("data-bot-persona")'), false, 'Tab must leave the group');
    await key('Tab', 'Tab', 9, 8);
    await selected(1);
    const point = await wait(`(() => {
      const e = document.querySelector('[data-bot-persona="${ids.at(-1)}"]');
      e.scrollIntoView({ block: 'center' });
      const r = e.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
      return e.contains(document.elementFromPoint(x, y)) ? { x, y } : false;
    })()`);
    if (width === 390) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      for (const type of ['mousePressed', 'mouseReleased']) {
        await cdp.send('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 });
      }
    }
    await wait(`document.querySelector('[data-bot-persona][aria-checked=true]')?.dataset.botPersona===${JSON.stringify(ids.at(-1))}`);
    assert.equal(await oneStop(), 1);
    const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(screenshotDir, `bot-picker-keyboard-${width}.png`), Buffer.from(screenshot.result.data, 'base64'));
    await key('Escape', 'Escape', 27);
    await wait('!document.querySelector("[aria-labelledby=new-game-title]") && !history.state?.webKatrainOverlay');
    assert.deepEqual(await board(), before, 'Choosing a bot in a cancelled setup must preserve the game');
    reports.push({ width, bots: ids.length, tabStops: 1, arrowsHomeEndAndWrap: true, compositionAndModifiersIgnored: true, pointerSelectionRetained: true, cancelledSetupPreservesGame: true });
  }
  fs.writeFileSync(path.join(screenshotDir, 'bot-picker-keyboard.json'), JSON.stringify(reports, null, 2));
  console.log('Bot picker: one Tab stop, arrow/Home/End selection and focus, wrapping, ignored composition/modifiers, touch selection, and cancelled-setup preservation passed.');
}
