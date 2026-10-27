import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evaluate, loadedModuleUrl, navigate, setViewport, waitForExpression } from './browser.mjs';

export async function assertLessonPractice(cdp, appUrl, screenshotDir) {
  const reports = [];
  let mobile = false;
  const wait = expression => waitForExpression(cdp, expression, {
    label: 'Lesson practice board',
    diagnose: `({title:document.title,dialog:document.querySelector('[role=dialog]')?.innerText,moves:document.querySelector('[data-board-snapshot]')?.dataset.boardMoveCount,focus:document.activeElement?.outerHTML.slice(0,200)})`,
  });
  const activate = async point => {
    if (mobile) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else for (const type of ['mousePressed', 'mouseReleased']) {
      await cdp.send('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 });
    }
  };
  const click = async (selector, text) => activate(await wait(`(()=>{
    const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>${text ? `e.textContent.trim()===${JSON.stringify(text)}` : 'true'});
    if(!e||e.disabled)return false;e.scrollIntoView({block:'nearest'});
    const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
    return r.width&&e.contains(document.elementFromPoint(x,y))?{x,y}:false;
  })()`));
  const key = async (key, code, windowsVirtualKeyCode, modifiers = 0) => {
    for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode, modifiers });
  };
  const command = async (text, id) => {
    await key('k', 'KeyK', 75, 2);
    await click('[data-command-palette-search]');
    await cdp.send('Input.insertText', { text });
    await click(`[data-command-palette-item="${id}"]`);
    await wait('!document.querySelector("[data-command-palette-search]")');
  };
  const lessons = '[aria-labelledby=lessons-title]';
  const unsaved = '[aria-labelledby=unsaved-changes-title]';
  const practice = `${lessons} .lessons-practice button`;
  const screenshot = async file => {
    const result = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(screenshotDir, file), Buffer.from(result.result.data, 'base64'));
  };

  for (const viewport of [
    { width: 1440, height: 900, mobile: false },
    { width: 390, height: 844, mobile: true },
    { width: 320, height: 568, mobile: true },
    { width: 568, height: 320, mobile: true },
  ]) {
    mobile = viewport.mobile;
    const setup = await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
      performance.setResourceTimingBufferSize(5000);
      localStorage.removeItem('web-katrain:auto_saved_game:v1');
      localStorage.removeItem('web-katrain:shortcuts:v1');
      localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');
      localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
      localStorage.setItem('web-katrain:library_open:v1','true');
      localStorage.setItem('web-katrain:settings:v3',JSON.stringify({soundEnabled:false,loadSgfFastAnalysis:false,loadSgfRewind:true,defaultBoardSize:19,defaultHandicap:4}));
      if(!localStorage.getItem('web-katrain:lesson_progress:v1'))localStorage.setItem('web-katrain:lesson_progress:v1',JSON.stringify({capture:{stepIndex:1,completed:true}}));
    ` });
    try {
      await setViewport(cdp, viewport);
      await navigate(cdp, appUrl, 15000, { acceptBeforeUnload: true });
    } finally { await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: setup.result.identifier }); }
    await wait('!!document.querySelector("[data-board-snapshot]")');
    if (mobile) await click('#mobile-tab-library');
    await wait('document.querySelector("[data-library-storage-badge]")?.textContent==="IndexedDB"');
    await evaluate(cdp, `(async()=>{
      const url=${loadedModuleUrl.toString()};
      window.lessonPracticeLibrary=await import(url('/src/utils/library.ts'));
      window.lessonPracticeStore=(await import(url('/src/store/gameStore.ts'))).useGameStore;
      const imports=await import(url('/src/utils/libraryImports.ts'));
      await lessonPracticeLibrary.saveLibrary([]);
      await imports.persistLibraryImports([{...lessonPracticeLibrary.createLibraryItem('Lesson study','(;GM[1]SZ[19]GN[Lesson study];B[dd])'),id:'lesson-study'}]);
    })()`);
    const readStudy = () => evaluate(cdp, 'lessonPracticeLibrary.loadLibrary().then(items=>items.find(item=>item.id==="lesson-study"))');
    const openStudy = async () => {
      if (mobile) await click('#mobile-tab-library');
      else if (!await evaluate(cdp, `(()=>{const e=document.querySelector('[data-library-row-id=lesson-study]');if(!e)return false;const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))})()`)) {
        await command('Show library', 'toggle-library');
      }
      await click('[data-library-row-id=lesson-study]');
      await wait('document.title.includes("Lesson study")');
    };
    const openLessons = async () => {
      await command('Interactive lessons', 'lessons');
      await wait(`!!document.querySelector('${practice}')`);
    };
    const expectPractice = async () => {
      await wait('document.querySelector("[data-board-snapshot]")?.dataset.boardSize==="9"&&!document.querySelector("[role=dialog]")');
      await wait('document.activeElement===document.querySelector("[data-board-snapshot]")');
      assert.deepEqual(await evaluate(cdp, `(()=>{const s=lessonPracticeStore.getState();return {moves:s.moveHistory.length,black:s.board.flat().filter(p=>p==='black').length,white:s.board.flat().filter(p=>p==='white').length,player:s.currentPlayer,ai:s.isAiPlaying}})()`),
        { moves: 0, black: 0, white: 0, player: 'black', ai: false });
    };
    const playPoint = async (coordinate, moveCount) => {
      const point = await wait(`(()=>{const b=document.querySelector('[data-board-snapshot]'),r=b.getBoundingClientRect(),x=r.x+Number(b.dataset.boardOriginX)+${coordinate}*Number(b.dataset.boardCellSize),y=r.y+Number(b.dataset.boardOriginY)+${coordinate}*Number(b.dataset.boardCellSize);return b.contains(document.elementFromPoint(x,y))?{x,y}:false})()`);
      await activate(point);
      if (mobile) { await wait('!!document.querySelector("[data-tap-confirm=true]")'); await activate(point); }
      await wait(`document.querySelector('[data-board-snapshot]').dataset.boardMoveCount===${JSON.stringify(String(moveCount))}`);
    };

    await openStudy();
    const original = await readStudy();
    await openLessons();
    const bounds = await evaluate(cdp, `(()=>{const r=document.querySelector('${practice}').getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,height:r.height}})()`);
    assert.ok(bounds.left >= 0 && bounds.right <= viewport.width && bounds.top >= 0 && bounds.bottom <= viewport.height && bounds.height >= 44, 'Practice action must fit and remain tappable');
    const progress = await evaluate(cdp, 'localStorage.getItem("web-katrain:lesson_progress:v1")');
    await screenshot(`lesson-practice-action-${viewport.width}x${viewport.height}.png`);
    await click(practice);
    await expectPractice();
    assert.deepEqual(await readStudy(), original);

    await openStudy();
    await evaluate(cdp, 'lessonPracticeStore.getState().navigateEnd();void 0');
    await wait('document.querySelector("[data-board-snapshot]").dataset.boardMoveCount==="1"');
    await playPoint(6, 2);
    const edited = await evaluate(cdp, '({root:lessonPracticeStore.getState().rootNode.id,stones:document.querySelector("[data-board-snapshot]").dataset.boardStones})');
    await openLessons(); await click(practice);
    await wait(`!!document.querySelector('${unsaved}')`);
    await click(`${unsaved} button`, 'Cancel');
    await wait(`!!document.querySelector('${practice}')`);
    await wait(`document.querySelector('${lessons}').contains(document.activeElement)`);
    assert.deepEqual(await evaluate(cdp, '({root:lessonPracticeStore.getState().rootNode.id,stones:document.querySelector("[data-board-snapshot]").dataset.boardStones})'), edited);
    await click(practice); await wait(`!!document.querySelector('${unsaved}')`);
    await click(`${unsaved} button`, 'Discard');
    await expectPractice();
    assert.deepEqual(await readStudy(), original);

    await openStudy();
    await evaluate(cdp, 'lessonPracticeStore.getState().navigateEnd();void 0');
    await wait('document.querySelector("[data-board-snapshot]").dataset.boardMoveCount==="1"');
    await playPoint(6, 2);
    await openLessons(); await click(practice); await wait(`!!document.querySelector('${unsaved}')`);
    await click(`${unsaved} button`, 'Save to Library');
    await expectPractice();
    const saved = await readStudy();
    assert.equal(saved.moveCount, 2);
    assert.ok(saved.sgf.includes('W[gg]'));
    assert.equal(await evaluate(cdp, 'localStorage.getItem("web-katrain:lesson_progress:v1")'), progress);
    await playPoint(2, 1); await playPoint(6, 2);
    assert.equal(await evaluate(cdp, 'lessonPracticeStore.getState().currentPlayer'), 'black');
    await screenshot(`lesson-practice-board-${viewport.width}x${viewport.height}.png`);
    reports.push({ ...viewport, cleanOpen: true, cancelPreservesEdits: true, discardPreservesStoredGame: true, saveBeforeReplacement: true, bothColorsPlayable: true, lessonProgressPreserved: true });
    console.log('Lesson practice', JSON.stringify(reports.at(-1)));
  }
  fs.writeFileSync(path.join(screenshotDir, 'lesson-practice.json'), JSON.stringify(reports, null, 2));
}
