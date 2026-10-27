import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evaluate, navigate, setViewport, waitForExpression } from './browser.mjs';

export async function assertNewGameBoard(cdp, appUrl, output) {
  const reports = [];
  let currentCase;
  const settle = () => evaluate(cdp, 'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))');
  const wait = expression => waitForExpression(cdp, expression, {
    label: 'New game board handoff',
    diagnose: `({focus:document.activeElement?.outerHTML.slice(0,180),dialog:document.querySelector('[role=dialog]')?.getAttribute('aria-labelledby'),board:document.querySelector('[data-board-snapshot]')?.dataset.boardMoveCount})`,
  });
  try {
    for (const viewport of [
      { width: 1440, height: 900, mobile: false },
      { width: 390, height: 844, mobile: true },
      { width: 320, height: 568, mobile: true },
      { width: 568, height: 320, mobile: true },
    ]) {
      const click = async (selector, text) => {
        const p = await wait(`(()=>{const b=[...document.querySelectorAll(${JSON.stringify(selector)})].find(b=>${text ? `b.textContent.includes(${JSON.stringify(text)})` : 'true'});if(!b||b.disabled)return false;b.scrollIntoView({block:'nearest'});const r=b.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return r.width&&b.contains(document.elementFromPoint(x,y))?{x,y}:false})()`);
        if (viewport.mobile) {
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] });
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        } else for (const type of ['mousePressed', 'mouseReleased']) await cdp.send('Input.dispatchMouseEvent', { type, ...p, button: 'left', clickCount: 1 });
      };
      const key = async (key, code, number, modifiers = 0) => {
        for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: number, modifiers });
      };
      const command = async (id, text) => {
        await key('k', 'KeyK', 75, 2);await click('[data-command-palette-search]');await cdp.send('Input.insertText', { text });await click(`[data-command-palette-item=${id}]`);
      };
      const reset = async () => {
        const setup = await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
          localStorage.removeItem('web-katrain:auto_saved_game:v1');localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');
          localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');localStorage.setItem('web-katrain:library_open:v1','false');
          localStorage.setItem('web-katrain:settings:v3',JSON.stringify({soundEnabled:false,loadSgfFastAnalysis:false,defaultBoardSize:9,defaultHandicap:0,timerMainTimeMinutes:0,timerByoPeriods:0}));
        ` });
        try {
          await setViewport(cdp, viewport);await navigate(cdp, appUrl, 15000, { acceptBeforeUnload: true });
        } finally { await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: setup.result.identifier }); }
        await wait('!!document.querySelector("[data-board-snapshot]")');await settle();
      };
      const routes = viewport.mobile ? ['board', 'library', 'review', 'home', 'scoring'] : ['board', 'scoring'];
      for (const entry of routes) for (const action of ['setup', 'quick']) {
        currentCase = { ...viewport, entry, action };await reset();
        if (entry === 'scoring') await command('toggle-scoring', 'Score position');
        if (entry === 'library') await click('#mobile-tab-library');
        if (entry === 'review') await click('#mobile-tab-info');
        if (entry === 'home') { await click('[aria-label="Menu"]');await click('[aria-label="Open home"]'); }
        if (entry === 'home') await click('[data-mobile-home=true] button', action === 'quick' ? 'Quick new game' : 'New game');
        else await command(action === 'quick' ? 'quick-new-game' : 'new-game', action === 'quick' ? 'Quick new game' : 'New game setup');
        if (action === 'setup') { await wait('!!document.querySelector("[aria-labelledby=new-game-title]")');await click('.new-game-modal-footer button', 'Start'); }
        await wait('!document.querySelector("[role=dialog]")');await settle();
        const board = await evaluate(cdp, `(()=>{const b=document.querySelector('[data-board-snapshot]'),r=b.getBoundingClientRect();return {focused:document.activeElement===b,visible:b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),moves:b.dataset.boardMoveCount,size:b.dataset.boardSize,selectedTab:document.querySelector('#mobile-tab-board')?.getAttribute('aria-selected')}})()`);
        assert.equal(board.focused, true);assert.equal(board.visible, true);assert.equal(board.moves, '0');
        if (viewport.mobile) assert.equal(board.selectedTab, 'true');
        await key('ArrowRight', 'ArrowRight', 39);await key('Enter', 'Enter', 13);await settle();
        assert.equal(await evaluate(cdp, 'document.querySelector("[data-board-snapshot]").dataset.boardMoveCount'), '1', 'Keyboard placement must work immediately after starting');
        reports.push({ ...currentCase, boardFocused: true, boardVisible: true, keyboardMove: true });
        fs.writeFileSync(path.join(output, 'new-game-board.json'), JSON.stringify(reports, null, 2));
        console.log('New game board', JSON.stringify(reports.at(-1)));
      }
      for (const entry of viewport.mobile ? ['library', 'home'] : ['board']) {
        await reset();
        if (entry === 'library') await click('#mobile-tab-library');
        if (entry === 'home') { await click('[aria-label="Menu"]');await click('[aria-label="Open home"]'); }
        currentCase = { ...viewport, entry, action: 'cancel-setup' };
        if (entry === 'home') await click('[data-mobile-home=true] button', 'New game');
        else await command('new-game', 'New game setup');
        await click('.new-game-modal-footer button', 'Cancel');await settle();
        assert.equal(await evaluate(cdp, '!!document.querySelector("[aria-labelledby=new-game-title]")'), false);
        assert.equal(await evaluate(cdp, 'document.querySelector("[data-board-snapshot]").dataset.boardMoveCount'), '0');
        if (entry === 'library') assert.equal(await evaluate(cdp, 'document.querySelector("#mobile-tab-library")?.getAttribute("aria-selected")'), 'true');
        if (entry === 'home') assert.equal(await evaluate(cdp, '!!document.querySelector("[data-mobile-home=true]")'), true);
        reports.push({ ...currentCase, workspacePreserved: true });
        for (const action of ['setup', 'quick']) {
          currentCase = { ...viewport, entry, action: `cancel-unsaved-${action}` };await reset();
          await command('quick-new-game', 'Quick new game');await settle();
          await key('ArrowRight', 'ArrowRight', 39);await key('Enter', 'Enter', 13);await settle();
          const before = await evaluate(cdp, '({stones:document.querySelector("[data-board-snapshot]").dataset.boardStones,moves:document.querySelector("[data-board-snapshot]").dataset.boardMoveCount})');
          assert.equal(before.moves, '1');
          if (entry === 'library') await click('#mobile-tab-library');
          if (entry === 'home') { await click('[aria-label="Menu"]');await click('[aria-label="Open home"]'); }
          if (entry === 'home') await click('[data-mobile-home=true] button', action === 'quick' ? 'Quick new game' : 'New game');
          else await command(action === 'quick' ? 'quick-new-game' : 'new-game', action === 'quick' ? 'Quick new game' : 'New game setup');
          await wait('!!document.querySelector("[aria-labelledby=unsaved-changes-title]")');
          await click('[aria-labelledby=unsaved-changes-title] button', 'Cancel');await settle();
          assert.equal(await evaluate(cdp, '!!document.querySelector("[aria-labelledby=unsaved-changes-title]")'), false);
          assert.deepEqual(await evaluate(cdp, '({stones:document.querySelector("[data-board-snapshot]").dataset.boardStones,moves:document.querySelector("[data-board-snapshot]").dataset.boardMoveCount})'), before);
          if (entry === 'library') assert.equal(await evaluate(cdp, 'document.querySelector("#mobile-tab-library")?.getAttribute("aria-selected")'), 'true');
          if (entry === 'home') assert.equal(await evaluate(cdp, '!!document.querySelector("[data-mobile-home=true]")'), true, 'Cancelling replacement must return to Home');
          reports.push({ ...currentCase, workspacePreserved: true, gamePreserved: true });
          fs.writeFileSync(path.join(output, 'new-game-board.json'), JSON.stringify(reports, null, 2));
          console.log('New game cancel', JSON.stringify(reports.at(-1)));
        }
      }
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(output, `new-game-board-${viewport.width}.png`), Buffer.from(shot.result.data, 'base64'));
    }
  } catch (error) {
    const state = await evaluate(cdp, '({body:document.body.innerText,focus:document.activeElement?.outerHTML})').catch(() => null);
    fs.writeFileSync(path.join(output, 'new-game-board-failure.json'), JSON.stringify({ case: currentCase, error: String(error), state }, null, 2));
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }).catch(() => null);
    if (shot) fs.writeFileSync(path.join(output, 'new-game-board-failure.png'), Buffer.from(shot.result.data, 'base64'));
    throw error;
  }
}
