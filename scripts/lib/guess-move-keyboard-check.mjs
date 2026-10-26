import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evaluate, navigate, setViewport, waitForExpression } from './browser.mjs';

export async function assertGuessMoveKeyboard(cdp, appUrl, runDir, screenshotDir) {
  const fixture = path.join(runDir, 'guess-keyboard.sgf');
  fs.writeFileSync(fixture, '(;GM[1]SZ[9]PB[Alice]PW[Bob];B[ee];W[dd];B[ff])');
  const wait = expression => waitForExpression(cdp, expression, {
    label: 'Guess the Move keyboard flow',
    diagnose: `({ active: document.activeElement?.getAttribute('aria-label') || document.activeElement?.tagName,
      phase: document.querySelector('[data-guess-move-phase]')?.dataset.guessMovePhase,
      prompt: document.querySelector('[data-guess-move-prompt]')?.textContent,
      stats: document.querySelector('[data-guess-move-stats]')?.textContent })`,
  });
  const key = async (key, code, virtual, modifiers = 0) => {
    for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', {
      type, key, code, windowsVirtualKeyCode: virtual, modifiers,
      ...(type === 'keyDown' && key === 'Enter' ? { text: '\r' } : {}),
    });
  };
  const click = async selector => {
    const point = await wait(`(() => {
      const e = document.querySelector(${JSON.stringify(selector)});
      if (!e || e.disabled) return false;
      e.scrollIntoView({ block: 'nearest' });
      const r = e.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
      return r.width && e.contains(document.elementFromPoint(x, y)) ? { x, y } : false;
    })()`);
    for (const type of ['mousePressed', 'mouseReleased']) await cdp.send('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 });
  };
  const boardFocused = `document.activeElement?.getAttribute('data-static-board-interactive')==='true'`;
  const reports = [];
  for (const width of [1440, 390]) {
    const setup = await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
      localStorage.removeItem('web-katrain:auto_saved_game:v1');
      localStorage.removeItem('web-katrain:shortcuts:v1');
      localStorage.setItem('web-katrain:mobile_home_dismissed:v1', 'true');
      localStorage.setItem('web-katrain:pwa-install-dismissed:v1', 'true');
      localStorage.setItem('web-katrain:settings:v3', JSON.stringify({ soundEnabled: false, loadSgfFastAnalysis: false, loadSgfRewind: true }));
    ` });
    try {
      await setViewport(cdp, { width, height: width === 390 ? 844 : 900, mobile: width === 390 });
      await navigate(cdp, appUrl, 15000, { acceptBeforeUnload: true });
    } finally {
      await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: setup.result.identifier });
    }
    await wait('!!document.querySelector("[data-board-snapshot]")');
    const root = (await cdp.send('DOM.getDocument')).result.root;
    const node = (await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[type=file][accept^=".sgf"]:not([multiple])' })).result.nodeId;
    await cdp.send('DOM.setFileInputFiles', { nodeId: node, files: [fixture] });
    await wait('document.querySelector("[data-board-snapshot]")?.dataset.boardSize==="9"');
    await evaluate(cdp, 'document.activeElement?.blur()');
    await key('k', 'KeyK', 75, 2);
    await wait('document.activeElement?.getAttribute("aria-label")==="Search commands"');
    await cdp.send('Input.insertText', { text: 'Guess the move' });
    await click('[data-command-palette-item=guess-move]');
    await wait('!!document.querySelector("[data-guess-move-modal]")');
    await click('[aria-label="Show answer"]');
    await wait('document.querySelector("[data-guess-move-phase]")?.dataset.guessMovePhase==="revealed"');
    await wait('document.activeElement?.getAttribute("data-guess-move-next")==="true"');
    assert.equal(await evaluate(cdp, 'document.querySelector("[data-guess-move-result]").getAttribute("role")'), 'status');
    await key('Enter', 'Enter', 13);
    await wait('document.querySelector("[data-guess-move-prompt]")?.textContent.includes("move 2")');
    await wait(boardFocused);
    assert.equal(await evaluate(cdp, 'document.querySelector("[data-guess-move-stats]").textContent.includes("Correct:")'), false, 'Revealing an answer must not count as an attempt');
    await click('[aria-label="Show answer"]');
    await wait('document.activeElement?.getAttribute("data-guess-move-next")==="true"');
    await key('Enter', 'Enter', 13);
    await wait('document.querySelector("[data-guess-move-prompt]")?.textContent.includes("move 3")');
    await wait(boardFocused);
    await key('ArrowRight', 'ArrowRight', 39); await key('ArrowDown', 'ArrowDown', 40);
    await key('Enter', 'Enter', 13);
    await wait('document.querySelector("[data-guess-move-result]")?.textContent.includes("Exact match!")');
    await wait('document.activeElement?.getAttribute("aria-label")==="Start again"');
    await wait('document.querySelector("[data-guess-move-stats]")?.textContent.includes("1/1")');
    await key('Enter', 'Enter', 13);
    await wait('document.querySelector("[data-guess-move-prompt]")?.textContent.includes("move 1")');
    await wait(boardFocused);
    assert.equal(await evaluate(cdp, 'document.querySelector("[data-guess-move-stats]").textContent.includes("Correct:")'), false);
    await key('Enter', 'Enter', 13);
    await wait('document.querySelector("[data-guess-move-result]")?.textContent.includes("Exact match!")');
    await wait('document.querySelector("[data-guess-move-stats]")?.textContent.includes("1/1")');
    // White has one recorded move: its first position is also its last.
    await click('[aria-label="Which moves to guess"] button:nth-child(3)');
    await wait(boardFocused);
    await wait('document.querySelector("[data-guess-move-stats]")?.textContent.includes("Position 1 / 1")');
    await click('[aria-label="Show answer"]');
    await wait('document.activeElement?.getAttribute("aria-label")==="Start again"');
    await key('Enter', 'Enter', 13);
    await wait(boardFocused);
    await wait('document.querySelector("[data-guess-move-prompt]")?.textContent.includes("move 2")');
    assert.equal(await evaluate(cdp, `document.querySelector('[aria-label="Which moves to guess"] button:nth-child(3)').getAttribute('aria-pressed')`), 'true', 'Restart must retain the selected player filter');
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(screenshotDir, `guess-keyboard-${width}.png`), Buffer.from(shot.result.data, 'base64'));
    await click('[aria-label="Close guess the move"]');
    await wait('!document.querySelector("[data-guess-move-modal]") && !history.state?.webKatrainOverlay');
    assert.equal(await evaluate(cdp, 'document.querySelector("[data-board-snapshot]").dataset.boardMoveCount'), '0', 'Practice must leave the loaded position unchanged');
    reports.push({ width, revealFocusesNext: true, nextFocusesBoard: true, answersAnnounced: true,
      keyboardGuessGraded: true, finalRoundCanRestart: true, restartResetsScoreAndCursor: true,
      singleMoveFilterCanRestart: true, restartRetainsFilter: true, actualGameUnchanged: true });
  }
  fs.writeFileSync(path.join(screenshotDir, 'guess-keyboard.json'), JSON.stringify(reports, null, 2));
  console.log('Guess the Move: desktop/phone reveal/Next focus, keyboard grading, live results, restart with reset score/cursor, and unchanged game passed.');
}
