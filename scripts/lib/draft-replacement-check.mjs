import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { connectDevtools, evaluate, loadedModuleUrl, navigate, setViewport, waitForExpression } from './browser.mjs';

export async function assertDraftReplacement(devtoolsPort, appUrl, runDir, screenshotDir) {
  const version = await (await fetch(`http://127.0.0.1:${devtoolsPort}/json/version`)).json();
  const browser = connectDevtools(version.webSocketDebuggerUrl);
  await browser.ready;
  const filesDir = fs.mkdtempSync(path.join(runDir, 'draft-replacement-'));
  const original = path.join(filesDir, 'Original.sgf'), incoming = path.join(filesDir, 'Incoming.sgf');
  fs.writeFileSync(original, '(;GM[1]SZ[9]KM[6.5]PB[Original Black]C[Original note])');
  fs.writeFileSync(incoming, '(;GM[1]SZ[13]KM[0.5]PB[Incoming Black]PW[Incoming White]C[Incoming note];B[dd];W[ff])');
  const reports = [];
  try {
    for (const [width, height] of [[1280, 800], [390, 844], [320, 568]]) {
      const mobile = width < 1000;
      const context = (await browser.send('Target.createBrowserContext')).result.browserContextId;
      const target = (await browser.send('Target.createTarget', { url: 'about:blank', browserContextId: context })).result.targetId;
      const cdp = connectDevtools(`ws://127.0.0.1:${devtoolsPort}/devtools/page/${target}`);
      await cdp.ready;
      const downloads = path.join(filesDir, String(width));
      fs.mkdirSync(downloads);
      const wait = expression => waitForExpression(cdp, expression, { label: 'Draft replacement', timeoutMs: 15_000 });
      const key = async (key, code, modifiers = 0) => {
        for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', { type, key, windowsVirtualKeyCode: code, modifiers });
      };
      const click = async expression => {
        const point = await wait(`(async()=>{const e=${expression};if(!e)return false;e.scrollIntoView({block:'nearest'});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));if(!e.isConnected)return false;const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return !e.disabled&&r.width&&r.height&&e.contains(document.elementFromPoint(x,y))?{x,y}:false})()`);
        if (mobile) {
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        } else for (const type of ['mousePressed', 'mouseReleased']) await cdp.send('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 });
      };
      const choose = label => click(`[...document.querySelectorAll('[aria-labelledby="unsaved-changes-title"] button')].find(e=>e.textContent.trim()===${JSON.stringify(label)})`);
      const state = () => evaluate(cdp, `(()=>{const s=replacementStore.getState(),r=s.rootNode;return {id:r.id,black:r.properties.PB?.[0],white:r.properties.PW?.[0],note:r.note??'',komi:s.komi,size:r.gameState.board.length,undo:s.editUndoCount,moves:[r.children[0]?.move,r.children[0]?.children[0]?.move]}})()`);
      const selectFile = async filename => {
        await wait(`document.querySelector('input[type=file][accept^=".sgf"]:not([multiple])')?.value===''`);
        const doc = (await cdp.send('DOM.getDocument')).result.root;
        const nodeId = (await cdp.send('DOM.querySelector', { nodeId: doc.nodeId, selector: 'input[type=file][accept^=".sgf"]:not([multiple])' })).result.nodeId;
        await cdp.send('DOM.setFileInputFiles', { nodeId, files: [filename] });
      };
      const review = async () => {
        const notice = `document.querySelector('[aria-label="Dismiss notification"]')`;
        if (await evaluate(cdp, `!!${notice}`)) await click(notice);
        if (mobile) await click('document.querySelector("#mobile-tab-info")');
      };
      const field = label => `[...document.querySelectorAll('[data-game-info-edit-form] label')].find(e=>e.textContent.trim()===${JSON.stringify(label)})?.querySelector('input')`;
      const edit = async (kind, text) => {
        await review();
        let editor;
        if (kind === 'note') {
          const comment = `[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Comment')`;
          if (await evaluate(cdp, `${comment}?.getAttribute('aria-expanded')!=='true'`)) await click(comment);
          await click('document.querySelector("[data-note-preview]")');
          editor = 'document.querySelector("[data-note-editor]")';
        } else {
          if (!await evaluate(cdp, 'document.querySelector("[data-game-info-panel]")?.getBoundingClientRect().height>0')) await click(`[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Game info')`);
          if (!await evaluate(cdp, '!!document.querySelector("[data-game-info-edit-form]")')) await click('document.querySelector("[data-game-info-edit-toggle]")');
          editor = field(kind);
          await click(editor);
        }
        await wait(`${editor}===document.activeElement`);
        if (text !== undefined) {
          await key('a', 65, 2);
          if (text) await cdp.send('Input.insertText', { text });
          else await key('Backspace', 8);
          await wait(`${editor}.value===${JSON.stringify(text)}`);
        }
      };
      const checkIncoming = async () => {
        await wait('replacementStore.getState().rootNode.gameState.board.length===13&&!document.querySelector("#unsaved-changes-title")');
        const actual = await state();
        delete actual.id;
        assert.deepEqual(actual, { black: 'Incoming Black', white: 'Incoming White', note: 'Incoming note', komi: 0.5, size: 13, undo: 0, moves: [{ x: 3, y: 3, player: 'black' }, { x: 5, y: 5, player: 'white' }] });
      };
      const recovery = 'JSON.parse(localStorage.getItem("web-katrain:auto_saved_game:v1")??"null")?.sgf';
      try {
        await cdp.send('Page.enable');
        await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
        await browser.send('Browser.setDownloadBehavior', { behavior: 'allowAndName', downloadPath: downloads, browserContextId: context });
        await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
          performance.setResourceTimingBufferSize(5000);
          localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');
          localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
          localStorage.setItem('web-katrain:settings:v3',JSON.stringify({soundEnabled:false,loadSgfFastAnalysis:false}));
        ` });
        await setViewport(cdp, { width, height, mobile });
        await navigate(cdp, appUrl);
        await wait('!!document.querySelector("[data-board-snapshot=true]")');
        await evaluate(cdp, `(async()=>{const url=${loadedModuleUrl.toString()};window.replacementStore=(await import(url('/src/store/gameStore.ts'))).useGameStore;const sgf=await import(url('/src/utils/sgf.ts'));window.replacementParse=sgf.parseSgf;window.replacementExtract=sgf.extractKaTrainUserNoteFromSgfComment;return true})()`);
        for (const kind of ['note', 'Black']) {
          for (const choice of ['Save SGF', 'Discard', 'Cancel']) {
            await selectFile(original);
            await wait('replacementStore.getState().rootNode.gameState.board.length===9');
            const before = await state(), latest = `Latest ${kind} before ${choice} — 厚み`;
            await edit(kind, latest);
            assert.equal((await state())[kind === 'note' ? 'note' : 'black'], kind === 'note' ? 'Original note' : 'Original Black');
            await selectFile(incoming);
            const result = await wait(`(()=>{const dialog=!!document.querySelector('#unsaved-changes-title'),changed=replacementStore.getState().rootNode.id!==${JSON.stringify(before.id)};return dialog||changed?{dialog,changed}:false})()`);
            assert.deepEqual(result, { dialog: true, changed: false }, 'Game replacement discarded an editor without asking');
            const preserved = await state();
            assert.equal(preserved[kind === 'note' ? 'note' : 'black'], latest);
            assert.equal(preserved.undo, 1);
            const previousDownloads = fs.readdirSync(downloads).filter(name => !name.endsWith('.crdownload'));
            await choose(choice);
            if (choice === 'Cancel') {
              await wait('!document.querySelector("#unsaved-changes-title")');
              assert.deepEqual(await state(), preserved, 'Cancel changed the original game');
              await wait(`(${recovery})?.includes(${JSON.stringify(latest)})`);
              // A later explicit Discard may replace it, without transferring
              // the outgoing note or player name into the incoming game.
              await selectFile(incoming);
              await wait('!!document.querySelector("#unsaved-changes-title")');
              await choose('Discard');
            }
            await checkIncoming();
            await wait(`!(${recovery})`);
            if (choice === 'Save SGF') {
              let names = [];
              const deadline = Date.now() + 15_000;
              while (Date.now() < deadline) {
                names = fs.readdirSync(downloads).filter(name => !name.endsWith('.crdownload') && !previousDownloads.includes(name));
                if (names.length) break;
                await new Promise(resolve => setTimeout(resolve, 50));
              }
              assert.equal(names.length, 1, 'Save did not retain the outgoing game');
              const sgf = fs.readFileSync(path.join(downloads, names[0]), 'utf8');
              const saved = await evaluate(cdp, `(()=>{const p=replacementParse(${JSON.stringify(sgf)}).tree.props;return {note:replacementExtract(p.C),black:p.PB?.[0],size:p.SZ?.[0]}})()`);
              assert.deepEqual(saved, { note: kind === 'note' ? latest : 'Original note', black: kind === 'Black' ? latest : 'Original Black', size: '9' });
            } else assert.deepEqual(fs.readdirSync(downloads).filter(name => !name.endsWith('.crdownload')), previousDownloads, 'Cancel or Discard downloaded a game');
            reports.push({ width, height, kind, choice, originalDraftProtected: true, incomingGameUnchanged: true });
          }
        }
        for (const [kind, text] of [['note', undefined], ['Komi', '-'], ['Handicap', '2abc']]) {
          await selectFile(original);
          await wait('replacementStore.getState().rootNode.gameState.board.length===9');
          await edit(kind, text);
          await selectFile(incoming);
          await wait('replacementStore.getState().rootNode.gameState.board.length===13||!!document.querySelector("#unsaved-changes-title")');
          assert.equal(await evaluate(cdp, '!!document.querySelector("#unsaved-changes-title")'), false, 'Untouched or invalid input triggered a false unsaved warning');
          await checkIncoming();
          reports.push({ width, height, kind, cleanInput: true, noFalseWarning: true });
        }
        const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(screenshotDir, `${width}x${height}-draft-replacement.png`), Buffer.from(screenshot.result.data, 'base64'));
      } catch (error) {
        const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(screenshotDir, `${width}x${height}-draft-replacement-failed.png`), Buffer.from(screenshot.result.data, 'base64'));
        throw error;
      } finally {
        cdp.close();
        await browser.send('Target.disposeBrowserContext', { browserContextId: context });
      }
    }
    fs.writeFileSync(path.join(screenshotDir, 'draft-replacement.json'), JSON.stringify(reports, null, 2));
    console.log('Game replacement: Save retains outgoing drafts, Discard loads only the new game, Cancel preserves the original, and untouched or invalid editors do not prompt on desktop and phones.');
  } finally {
    browser.close();
    fs.rmSync(filesDir, { recursive: true, force: true });
  }
}
