import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { connectDevtools, evaluate, loadedModuleUrl, navigate, setViewport, waitForExpression } from './browser.mjs';

// Native key events exercise focus, scrolling, and React's blur ordering. IME
// events are synthetic: this checks ownership of the keys, not an OS keyboard.
export async function assertKeyboardWorkflows(devtoolsPort, appUrl, screenshotDir) {
  const version = await (await fetch(`http://127.0.0.1:${devtoolsPort}/json/version`)).json();
  const browser = connectDevtools(version.webSocketDebuggerUrl);
  await browser.ready;
  const reports = [];
  try {
    for (const [width, height] of [[1280, 800], [390, 844], [320, 568]]) {
      const context = (await browser.send('Target.createBrowserContext')).result.browserContextId;
      const target = (await browser.send('Target.createTarget', { url: 'about:blank', browserContextId: context })).result.targetId;
      const cdp = connectDevtools(`ws://127.0.0.1:${devtoolsPort}/devtools/page/${target}`);
      await cdp.ready;
      const mobile = width < 1000;
      const wait = expression => waitForExpression(cdp, expression, { label: 'Keyboard workflow', timeoutMs: 15_000 });
      const key = async (key, code, modifiers = 0) => {
        for (const type of ['keyDown', 'keyUp']) {
          const reply = await cdp.send('Input.dispatchKeyEvent', { type, key, windowsVirtualKeyCode: code, modifiers });
          assert.ok(!reply.error, JSON.stringify(reply.error));
        }
      };
      const click = async expression => {
        const point = await wait(`(async()=>{
          const e=${expression};if(!e)return false;e.scrollIntoView({block:'nearest'});
          await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
          if(!e.isConnected)return false;
          const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
          return r.width&&r.height&&e.contains(document.elementFromPoint(x,y))?{x,y}:false;
        })()`);
        for (const type of ['mousePressed', 'mouseReleased']) {
          await cdp.send('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 });
        }
      };
      const field = label => `[...document.querySelectorAll('[data-game-info-edit-form] label')].find(e=>e.textContent.trim()===${JSON.stringify(label)})?.querySelector('input')`;
      const replaceField = async (label, text) => {
        await click(field(label));
        await key('a', 65, 2);
        if (text) await cdp.send('Input.insertText', { text });
        else await key('Backspace', 8);
        await wait(`${field(label)}.value===${JSON.stringify(text)}`);
      };
      const state = () => evaluate(cdp, `(()=>{const s=window.keyboardAuditStore.getState();return {komi:s.komi,handicap:s.rootNode.properties.HA?.[0]??'0',treeVersion:s.treeVersion,undo:s.editUndoCount}})()`);
      try {
        await cdp.send('Page.enable');
        await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
        await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
          performance.setResourceTimingBufferSize(5000);
          localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');
          localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
          localStorage.setItem('web-katrain:settings:v3',JSON.stringify({soundEnabled:false,loadSgfFastAnalysis:false}));
        ` });
        await setViewport(cdp, { width, height, mobile });
        await navigate(cdp, appUrl);
        await wait('!!document.querySelector("[data-board-snapshot=true]")');
        await evaluate(cdp, `(async()=>{const url=${loadedModuleUrl.toString()};window.keyboardAuditStore=(await import(url('/src/store/gameStore.ts'))).useGameStore;return true})()`);

        await key('k', 75, 2);
        const search = 'document.querySelector("[data-command-palette-search]")';
        await wait(`${search}===document.activeElement`);
        for (let i = 0; i < 24; i++) await key('ArrowDown', 40);
        const navigation = await wait(`(()=>{
          const list=document.querySelector('[role=listbox][aria-label=Commands]');
          const selected=list?.querySelector('[aria-selected=true]');if(!selected)return false;
          const r=selected.getBoundingClientRect(),v=list.getBoundingClientRect();
          return list.scrollTop>0&&r.top>=v.top-1&&r.bottom<=v.bottom+1&&!selected.disabled
            ?{scrollTop:list.scrollTop,command:selected.dataset.commandPaletteItem}:false;
        })()`);
        await evaluate(cdp, '(async()=>{keyboardAuditStore.setState(state=>({treeVersion:state.treeVersion+1}));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return true})()');
        assert.equal(await evaluate(cdp, `document.querySelector('[data-command-palette-item][aria-selected=true]')?.dataset.commandPaletteItem`), navigation.command, 'Background analysis reset the palette selection');
        await key('Tab', 9);
        assert.notEqual(await evaluate(cdp, 'document.activeElement.getAttribute("role")'), 'option', 'Tab entered the combobox options instead of the dialog controls');
        await click(search);
        // Selecting candidates in an IME must not move the palette selection,
        // execute it, or dismiss the surrounding dialog.
        for (const composition of [{ isComposing: true }, { keyCode: 229 }]) {
          const before = await evaluate(cdp, `${search}.getAttribute('aria-activedescendant')`);
          for (const key of ['ArrowDown', 'ArrowUp', 'Enter', 'Escape']) {
            await evaluate(cdp, `${search}.dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(key)},bubbles:true,cancelable:true,...${JSON.stringify(composition)}}))`);
          }
          assert.equal(await evaluate(cdp, `${search}?.getAttribute('aria-activedescendant')`), before);
        }
        // Clearing by pointer must put subsequent typing back in the search.
        await cdp.send('Input.insertText', { text: 'about' });
        await click(`document.querySelector('[aria-label="Clear command search"]')`);
        await wait(`${search}===document.activeElement&&${search}.value===''`);
        await key('Escape', 27);
        await wait('!document.querySelector("[data-command-palette]")');

        await key('S', 83, 10);
        const saveName = 'document.querySelector("#save-to-library-name")';
        await wait(`${saveName}===document.activeElement&&${saveName}.selectionStart===0&&${saveName}.selectionEnd===${saveName}.value.length`);
        for (const composition of [{ isComposing: true }, { keyCode: 229 }]) {
          for (const key of ['Enter', 'Escape']) {
            await evaluate(cdp, `${saveName}.dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(key)},bubbles:true,cancelable:true,...${JSON.stringify(composition)}}))`);
          }
          assert.equal(await evaluate(cdp, `!!${saveName}&&!${saveName}.disabled`), true, 'IME key submitted or dismissed Save Copy');
        }
        await key('Escape', 27);
        await wait(`!${saveName}`);

        await key('?', 191);
        const helpSearch = `document.querySelector('[aria-label="Search shortcuts"]')`;
        await wait(`!!${helpSearch}`);
        const beforeHelp = await state();
        for (const fontSize of ['100%', '200%']) {
          await evaluate(cdp, `document.documentElement.style.fontSize=${JSON.stringify(fontSize)};new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);
          const layout = await evaluate(cdp, `(()=>{
            const d=document.querySelector('#keyboard-help-title').closest('[role=dialog]'),body=d.children[1];
            const rows=[...d.querySelectorAll('[data-keyboard-help-row]')];
            return {width:body.clientWidth,scroll:body.scrollWidth,count:rows.length,
              broken:rows.filter(e=>{
                const k=e.querySelector('kbd'),label=e.querySelector('span'),a=k.getBoundingClientRect(),b=label.getBoundingClientRect();
                const overlap=a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1;
                return e.scrollWidth>e.clientWidth+1||k.scrollWidth>k.clientWidth+1||overlap;
              }).map(e=>e.textContent)};
          })()`);
          assert.ok(layout.count > 0, 'The shortcut reference has no rows');
          assert.ok(layout.scroll <= layout.width + 1, `Shortcut reference scrolls horizontally at ${fontSize}`);
          assert.deepEqual(layout.broken, [], `Shortcut labels overlap or escape their rows at ${fontSize}`);
          const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
          fs.writeFileSync(path.join(screenshotDir, `${width}x${height}-keyboard-help-${fontSize.replace('%', '')}.png`), Buffer.from(screenshot.result.data, 'base64'));
        }
        await evaluate(cdp, 'document.documentElement.style.fontSize=""');
        assert.deepEqual(await state(), beforeHelp, 'Reading shortcuts changed the game');
        await click(helpSearch);
        await cdp.send('Input.insertText', { text: 'undo' });
        await click(`document.querySelector('[aria-label="Clear shortcut search"]')`);
        await wait(`${helpSearch}===document.activeElement&&${helpSearch}.value===''`);
        await key('Escape', 27);
        await wait('!document.querySelector("#keyboard-help-title")');

        if (mobile) {
          await click('document.querySelector("#mobile-tab-info")');
          assert.equal(await evaluate(cdp, `!!document.querySelector('#mobile-panel-side').closest('section[aria-label="Game review"]')`), true);
        }
        const info = "[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Game info')";
        if (!await evaluate(cdp, 'document.querySelector("[data-game-info-panel]")?.getBoundingClientRect().height>0')) await click(info);
        await click('document.querySelector("[data-game-info-edit-toggle]")');
        await wait('!!document.querySelector("[data-game-info-edit-form]")');
        const original = await state();
        for (const [label, text] of [['Komi', '12.5'], ['Handicap', '4']]) {
          await replaceField(label, text);
          await key('Escape', 27);
          assert.deepEqual(await state(), original, `${label} Escape changed the game`);
        }
        for (const [label, text] of [['Komi', ''], ['Komi', '-'], ['Komi', '0x10'], ['Handicap', '2abc'], ['Handicap', '1.5']]) {
          await replaceField(label, text);
          await key('Tab', 9);
          assert.deepEqual(await state(), original, `${label} invalid draft ${JSON.stringify(text)} changed the game`);
        }
        await replaceField('Komi', '-0.5');
        await key('Enter', 13);
        assert.equal((await state()).komi, -0.5);
        await replaceField('Handicap', '2');
        await key('Enter', 13);
        assert.equal((await state()).handicap, '2');
        const committed = await state();
        const fixture = '(;GM[1]SZ[9]C[Study overview];B[dd]C[Keep the corner];W[ff]C[First line\\n' + 'An opening thought. '.repeat(20) + 'Hidden tesuji wins here.]' + '(;B[ab]C[Main continuation])(;B[aa]N[Alternative ladder]C[Branch ladder]))';
        await evaluate(cdp, `(async()=>{
          const url=${loadedModuleUrl.toString()};const {parseSgf}=await import(url('/src/utils/sgf.ts'));
          keyboardAuditStore.getState().loadGame(parseSgf(${JSON.stringify(fixture)}));
          keyboardAuditStore.getState().navigateStart();return true;
        })()`);
        const noteSearch = `document.querySelector('[aria-label="Search game notes"]')`;
        const openFindNotes = async () => {
          await key('k', 75, 2);
          await wait('!!document.querySelector("[data-command-palette-search]")');
          await click(`document.querySelector('[data-command-palette-item="find-notes"]')`);
          await wait(`${noteSearch}===document.activeElement`);
        };
        await openFindNotes();
        const mainLineFilter = 'document.querySelector("[data-game-notes-main-line]")';
        const searchPosition = await evaluate(cdp, 'keyboardAuditStore.getState().currentNode.id');
        await wait('document.querySelectorAll("[data-game-note-result]").length===5');
        await click(mainLineFilter);
        await wait('document.querySelectorAll("[data-game-note-result]").length===4');
        assert.equal(await evaluate(cdp, '[...document.querySelectorAll("[data-game-note-result]")].some(e=>e.textContent.includes("Variation"))'), false);
        await key(' ', 32);
        await wait('document.querySelectorAll("[data-game-note-result]").length===5');
        assert.equal(await evaluate(cdp, 'keyboardAuditStore.getState().currentNode.id'), searchPosition, 'Changing search scope navigated the game');
        await click(mainLineFilter);
        await click(noteSearch);
        await cdp.send('Input.insertText', { text: 'alternative ladder' });
        await wait('document.querySelectorAll("[data-game-note-result]").length===0');
        assert.equal(await evaluate(cdp, 'document.querySelector("[aria-labelledby=game-notes-search-title]").textContent.includes("No notes on the main line match")'), true);
        await click(mainLineFilter);
        await wait('document.querySelectorAll("[data-game-note-result]").length===1');
        assert.equal(await evaluate(cdp, `${noteSearch}.value`), 'alternative ladder', 'Changing scope cleared the search');
        assert.equal(await evaluate(cdp, 'document.querySelector("[data-game-note-result]").textContent.includes("Variation")'), true);
        await click(noteSearch);
        await key('Enter', 13);
        await wait('!document.querySelector("#game-notes-search-title")');
        assert.equal(await evaluate(cdp, 'keyboardAuditStore.getState().currentNode.note'), 'Branch ladder');
        assert.equal(await evaluate(cdp, 'keyboardAuditStore.getState().board[0][0]'), 'black');
        await openFindNotes();
        assert.equal(await evaluate(cdp, `${mainLineFilter}.checked`), false, 'Find notes reopened with hidden variations');
        await cdp.send('Input.insertText', { text: 'hidden tesuji' });
        await wait('document.querySelectorAll("[data-game-note-result]").length===1');
        assert.equal(await evaluate(cdp, 'document.querySelector("[data-game-note-result]").textContent.includes("Hidden tesuji")'), true, 'A match deep inside the note had no visible excerpt');
        const searchScreenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(screenshotDir, `${width}x${height}-find-notes.png`), Buffer.from(searchScreenshot.result.data, 'base64'));
        await click(`document.querySelector('[aria-label="Clear note search"]')`);
        await wait(`${noteSearch}===document.activeElement&&${noteSearch}.value===''`);
        await key('Escape', 27);
        await wait('!document.querySelector("#game-notes-search-title")');
        if (mobile) await click('document.querySelector("#mobile-tab-info")');
        await click(`document.querySelector('[aria-label="Find notes"]')`);
        await wait(`${noteSearch}===document.activeElement`);
        await key('Escape', 27);
        await wait(`document.querySelector('[aria-label="Find notes"]')===document.activeElement`);
        const longStudy = '(;GM[1]SZ[9]' + Array.from({ length: 130 }, (_, index) => `;C[Study note ${index}]`).join('') + ')';
        await evaluate(cdp, `(async()=>{
          const url=${loadedModuleUrl.toString()};const {parseSgf}=await import(url('/src/utils/sgf.ts'));
          keyboardAuditStore.getState().loadGame(parseSgf(${JSON.stringify(longStudy)}));return true;
        })()`);
        await openFindNotes();
        await wait('document.querySelectorAll("[data-game-note-result]").length===50');
        await key('Tab', 9);
        assert.notEqual(await evaluate(cdp, 'document.activeElement.getAttribute("role")'), 'option');
        await click(noteSearch);
        await key('ArrowUp', 38);
        await wait('document.querySelectorAll("[data-game-note-result]")[49].getAttribute("aria-selected")==="true"');
        assert.equal(await evaluate(cdp, 'document.querySelectorAll("[data-game-note-result]").length'), 50, 'Wrapping navigation rendered the whole study');
        await click(`[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Show more positions')`);
        await wait(`document.querySelectorAll('[data-game-note-result]').length===100&&${noteSearch}===document.activeElement`);
        await click(mainLineFilter);
        await wait('document.querySelectorAll("[data-game-note-result]").length===50');
        assert.equal(await evaluate(cdp, 'document.querySelector("[data-game-note-result]").getAttribute("aria-selected")'), 'true');
        await click(noteSearch);
        await cdp.send('Input.insertText', { text: 'note 129' });
        await wait('document.querySelectorAll("[data-game-note-result]").length===1');
        await key('Enter', 13);
        await wait('!document.querySelector("#game-notes-search-title")');
        assert.equal(await evaluate(cdp, 'keyboardAuditStore.getState().currentNode.note'), 'Study note 129');
        const variationOnlyStudy = '(;GM[1]SZ[9];B[dd](;W[ff])(;W[aa]C[Only a variation has a note]))';
        await evaluate(cdp, `(async()=>{const url=${loadedModuleUrl.toString()};const {parseSgf}=await import(url('/src/utils/sgf.ts'));keyboardAuditStore.getState().loadGame(parseSgf(${JSON.stringify(variationOnlyStudy)}));keyboardAuditStore.getState().navigateStart();return true})()`);
        await openFindNotes();
        await wait('document.querySelectorAll("[data-game-note-result]").length===1');
        await evaluate(cdp, 'document.documentElement.style.fontSize="200%";new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
        await click(mainLineFilter);
        await wait('document.querySelectorAll("[data-game-note-result]").length===0');
        assert.equal(await evaluate(cdp, 'document.querySelector("[aria-labelledby=game-notes-search-title]").textContent.includes("Turn off “Main line only” to include variations")'), true);
        const visibleEmptyMessage = await evaluate(cdp, `(async()=>{const e=document.querySelector('[data-game-notes-empty]');e.scrollIntoView({block:'end'});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const a=e.getBoundingClientRect(),b=e.parentElement.getBoundingClientRect();return Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)})()`);
        assert.ok(visibleEmptyMessage >= 80, `Large text left only ${visibleEmptyMessage}px for reading results`);
        const scopeScreenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(screenshotDir, `${width}x${height}-find-notes-scope-large-text.png`), Buffer.from(scopeScreenshot.result.data, 'base64'));
        await key(' ', 32);
        await wait('document.querySelectorAll("[data-game-note-result]").length===1');
        await key('Escape', 27);
        await wait('!document.querySelector("#game-notes-search-title")');
        await evaluate(cdp, 'document.documentElement.style.fontSize=""');
        reports.push({ width, height, navigation, original, committed, noteSearch: 'Main-line scope, keyboard toggling, pagination reset, variation navigation, full-text excerpts, search focus and Comment trigger passed' });
        const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(screenshotDir, `${width}x${height}-keyboard-workflows.png`), Buffer.from(screenshot.result.data, 'base64'));
      } catch (error) {
        const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(screenshotDir, `${width}x${height}-keyboard-workflows-failed.png`), Buffer.from(screenshot.result.data, 'base64'));
        throw error;
      } finally {
        cdp.close();
        await browser.send('Target.disposeBrowserContext', { browserContextId: context });
      }
    }
    fs.writeFileSync(path.join(screenshotDir, 'keyboard-workflows.json'), JSON.stringify(reports, null, 2));
    console.log('Keyboard workflows: palette, IME ownership, game-info edits and Find notes pass on desktop and both phones, including main-line filtering, pagination and all shortcut-reference rows at 100% and 200% text.');
  } finally {
    browser.close();
  }
}
