import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { connectDevtools, evaluate, loadedModuleUrl, navigate, setViewport, waitForExpression } from './browser.mjs';

// Fixed model output isolates answer editing and submission. Inputs, keys and
// buttons are native; these checks do not measure engine quality or strength.
export async function assertScoreQuizGuesses(devtoolsPort, appUrl, screenshotDir) {
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
      const wait = expression => waitForExpression(cdp, expression, { label: 'Score quiz guess', timeoutMs: 15_000 });
      const command = async (method, params = {}) => {
        const reply = await cdp.send(method, params);
        assert.ok(!reply.error, JSON.stringify(reply.error));
        return reply.result;
      };
      const key = async (key, code, modifiers = 0) => {
        for (const type of ['keyDown', 'keyUp']) await command('Input.dispatchKeyEvent', { type, key, windowsVirtualKeyCode: code, modifiers, ...(type === 'keyDown' && key === 'Enter' ? { text: '\r' } : {}) });
      };
      const click = async expression => {
        const point = await wait(`(async()=>{const e=${expression};if(!e)return false;e.scrollIntoView({block:'nearest'});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));if(!e.isConnected)return false;const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return !e.disabled&&e.contains(document.elementFromPoint(x,y))?{x,y}:false})()`);
        if (width < 1000) {
          await command('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
          await command('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        } else for (const type of ['mousePressed', 'mouseReleased']) await command('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 });
      };
      const input = `document.querySelector('[aria-labelledby="score-quiz-title"] input[type=number]')`;
      const reveal = `document.querySelector('[aria-label="Reveal score"]')`;
      const replace = async text => {
        await click(input);
        await key('a', 65, 2);
        await key('Backspace', 8);
        if (text) await command('Input.insertText', { text });
      };
      const snapshot = () => evaluate(cdp, `(()=>{const s=scoreGuessStore.getState();return {root:s.rootNode.id,current:s.currentNode.id,version:s.treeVersion,size:s.board.length,moves:s.moveHistory.length}})()`);
      try {
        await command('Page.enable');
        await command('Emulation.setFocusEmulationEnabled', { enabled: true });
        await command('Page.addScriptToEvaluateOnNewDocument', { source: `
          localStorage.setItem('web-katrain:mobile_home_dismissed:v1','true');
          localStorage.setItem('web-katrain:pwa-install-dismissed:v1','true');
          localStorage.setItem('web-katrain:settings:v3',JSON.stringify({soundEnabled:false,loadSgfFastAnalysis:false}));
        ` });
        await setViewport(cdp, { width, height, mobile: width < 1000 });
        await navigate(cdp, appUrl);
        await wait('!!document.querySelector("[data-board-snapshot=true]")');
        await evaluate(cdp, `(async()=>{
          const url=${loadedModuleUrl.toString()};window.scoreGuessStore=(await import(url('/src/store/gameStore.ts'))).useGameStore;
          const {parseSgf}=await import(url('/src/utils/sgf.ts'));scoreGuessStore.getState().loadGame(parseSgf('(;GM[1]SZ[9];B[dd];W[ee])'));
          const {getKataGoEngineClient}=await import(url('/src/engine/katago/client.ts'));window.scoreGuessRequests=0;
          getKataGoEngineClient().evaluate=async()=>{scoreGuessRequests++;return {rootScoreLead:5,rootWinRate:.65}};return true;
        })()`);
        const before = await snapshot();
        await key('k', 75, 2);
        await click(`document.querySelector('[data-command-palette-item="score-quiz"]')`);
        await wait(`!!${input}`);
        for (const text of ['', '-2', '1e', '0.25']) {
          await replace(text);
          await wait(`${reveal}?.disabled&&${input}.getAttribute('aria-invalid')==='true'`);
          assert.equal(await evaluate(cdp, `${input}.getAttribute('aria-describedby')&&!!document.getElementById(${input}.getAttribute('aria-describedby'))`), true, 'Invalid margin has no accessible explanation');
          await key('Enter', 13);
          await evaluate(cdp, 'new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
          assert.equal(await evaluate(cdp, 'scoreGuessRequests'), 0, `Invalid margin ${JSON.stringify(text)} started evaluation`);
          assert.equal(await evaluate(cdp, 'document.querySelector("[aria-labelledby=score-quiz-title]").textContent.includes("Rounds:")'), false);
          reports.push({ width, height, margin: text, evaluated: false, counted: false });
        }
        await replace('0');
        await wait(`!${reveal}.disabled&&${input}.getAttribute('aria-invalid')!=='true'`);
        for (const composition of [{ isComposing: true }, { keyCode: 229 }]) await evaluate(cdp, `${input}.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true,...${JSON.stringify(composition)}}))`);
        assert.equal(await evaluate(cdp, 'scoreGuessRequests'), 0, 'IME confirmation revealed the score');
        await key('Enter', 13);
        await wait(`scoreGuessRequests===1&&!${input}&&!!document.querySelector('.score-quiz-stats')`);
        assert.equal(await evaluate(cdp, `[...document.querySelectorAll('.score-quiz-response span')].find(e=>e.textContent==='Your guess').nextElementSibling.textContent`), 'Even');
        await click(`[...document.querySelectorAll('[aria-labelledby=score-quiz-title] button')].find(e=>e.textContent.trim()==='Guess again')`);
        await replace('4.5');
        await click(`[...document.querySelectorAll('[aria-label="Predicted leader"] button')].find(e=>e.textContent.trim()==='white')`);
        await click(reveal);
        await wait(`scoreGuessRequests===2&&!${input}&&!!document.querySelector('.score-quiz-stats')`);
        assert.equal(await evaluate(cdp, `[...document.querySelectorAll('.score-quiz-response span')].find(e=>e.textContent==='Your guess').nextElementSibling.textContent`), 'White +4.5');
        assert.ok(await evaluate(cdp, 'document.querySelector(".score-quiz-stats").textContent.includes("Rounds: 1")'), 'Practice guesses inflated round statistics');
        assert.deepEqual(await snapshot(), before, 'The score quiz edited or navigated the game');
        reports.push({ width, height, margin: '0 and White +4.5', evaluations: 2, rounds: 1, currentGamePreserved: true });
        const screenshot = await command('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(screenshotDir, `${width}x${height}-score-quiz-guesses.png`), Buffer.from(screenshot.data, 'base64'));
      } finally {
        cdp.close();
        await browser.send('Target.disposeBrowserContext', { browserContextId: context });
      }
    }
    fs.writeFileSync(path.join(screenshotDir, 'score-quiz-guesses.json'), JSON.stringify(reports, null, 2));
    console.log('Score quiz guesses: blank, negative, incomplete and off-step margins do not evaluate or count; explicit zero means Even; half-point guesses, IME ownership and practice-round counts pass on desktop and phones.');
  } finally {
    browser.close();
  }
}

// Mount the real dialog and defer engine responses to exercise ordering without
// depending on model speed. These checks run as part of test:viewport.
export async function assertScoreQuizRequests(cdp) {
  for (const viewport of [
    { width: 1280, height: 800, mobile: false },
    { width: 320, height: 568, mobile: true },
  ]) {
    await setViewport(cdp, viewport);
    const failures = await evaluate(cdp, `(${checkScoreQuiz.toString()})(${loadedModuleUrl.toString()})`);
    if (failures.length) throw new Error(`Score quiz ${viewport.width}x${viewport.height}: ${failures.join('; ')}`);
  }
}

async function checkScoreQuiz(moduleUrl) {
  const { default: React } = await import(moduleUrl('/deps/react.js'));
  const { default: ReactDOM } = await import(moduleUrl('/deps/react-dom_client.js'));
  const { ScoreQuizModal } = await import(moduleUrl('/src/components/ScoreQuizModal.tsx', true));
  const { useGameStore } = await import(moduleUrl('/src/store/gameStore.ts'));
  const { getKataGoEngineClient } = await import(moduleUrl('/src/engine/katago/client.ts'));
  const { parseSgf } = await import(moduleUrl('/src/utils/sgf.ts'));
  const host = document.createElement('div');
  document.body.append(host);
  const root = ReactDOM.createRoot(host);
  const client = getKataGoEngineClient();
  const originalEvaluate = client.evaluate;
  const originalState = useGameStore.getState();
  const requests = [];
  const failures = [];
  const check = (condition, message) => { if (!condition) failures.push(message); };
  const settle = () => new Promise(resolve => setTimeout(resolve, 50));
  const dialog = () => host.querySelector('[role="dialog"]');
  const button = name => host.querySelector(`[aria-label="${name}"]`);
  const open = async () => {
    root.render(React.createElement(ScoreQuizModal, { onClose: () => root.render(null) }));
    for (let i = 0; i < 100 && !dialog(); i++) await settle();
    if (!dialog()) throw new Error('Score quiz did not mount');
    await settle();
  };
  client.evaluate = () => new Promise((resolve, reject) => requests.push({ resolve, reject }));
  try {
    originalState.loadGame(parseSgf('(;GM[1]FF[4]SZ[19];B[dd];W[pp])'));
    const game = useGameStore.getState().rootNode;
    useGameStore.setState({ currentNode: game.children[0].children[0] });
    await open();
    button('Reveal score').click();
    await settle();
    const input = host.querySelector('input');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle();
    check(requests.length === 1, 'Enter submitted a duplicate evaluation');
    check(input.disabled, 'The submitted margin remains editable');
    check([...host.querySelectorAll('[aria-label="Predicted leader"] button')].every(b => b.disabled),
      'The submitted leader remains editable');

    button('Random position').click();
    await settle();
    requests[0].resolve({ rootScoreLead: 12, rootWinRate: 0.7 });
    await settle();
    check(!!button('Reveal score') && !dialog().textContent.includes('Rounds:'),
      'A score from the previous position was counted');

    button('Reveal score').click();
    await settle();
    const rejected = requests.at(-1);
    button('Random position').click();
    await settle();
    rejected.reject(new Error('obsolete evaluation error'));
    await settle();
    check(!dialog().textContent.includes('obsolete evaluation error'), 'An obsolete error reached the new round');

    button('Reveal score').click();
    await settle();
    requests.at(-1).resolve({ rootScoreLead: 5, rootWinRate: 0.6 });
    await settle();
    check(dialog().textContent.includes('Rounds: 1'), 'A completed round was not counted exactly once');
    check(dialog().textContent.includes('Perfect read'), 'The completed round was graded incorrectly');

    [...host.querySelectorAll('button')].find(b => b.textContent === 'Guess again').click();
    await settle();
    button('Reveal score').click();
    await settle();
    const abandoned = requests.at(-1);
    button('Close quiz').click();
    await settle();
    await open();
    abandoned.resolve({ rootScoreLead: -20, rootWinRate: 0.1 });
    await settle();
    check(!dialog().textContent.includes('Rounds:'), 'Closing the dialog did not discard its pending round');
  } catch (error) {
    throw new Error(`${error.message}; requests=${requests.length}; dialog=${dialog()?.textContent}; stack=${error.stack}`);
  } finally {
    root.unmount();
    host.remove();
    client.evaluate = originalEvaluate;
    useGameStore.setState(originalState);
  }
  return failures;
}
