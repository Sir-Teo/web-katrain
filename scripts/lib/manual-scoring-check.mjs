import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evaluate, loadedModuleUrl, navigate, setViewport, sleep } from './browser.mjs';

// A rules-aware utility is insufficient: Layout used to omit its rules and
// handicap arguments. Exercise native import, the visible panel, Done, and the
// actual SGF download. Phones use trusted touch events and hit-tested controls.
export async function assertManualScoring(cdp, appUrl, runDir, screenshotDir) {
  const rows = [
    'XXXXOOOOO', 'X.XXO.O.O', 'XXXXOOOOO',
    'XXXXXXXXX', 'XXXXXXXXX', 'XXXXXXXXX',
    'XXXXOOOOO', 'X.XXO.O.O', 'XXXXOOOOO',
  ];
  const setup = { X: [], O: [] };
  rows.forEach((row, y) => [...row].forEach((stone, x) => {
    if (stone !== '.') setup[stone].push(`[${String.fromCharCode(97 + x)}${String.fromCharCode(97 + y)}]`);
  }));
  const position = `AB${setup.X.join('')}AW${setup.O.join('')};W[];B[]`;
  const cases = [
    { id: 'chinese', ru: 'Chinese', result: 'B+14.0', totals: ['51', '37'] },
    { id: 'aga', ru: 'AGA', result: 'B+14.0', totals: ['51', '37'] },
    { id: 'new-zealand', ru: 'New Zealand', result: 'B+14.0', totals: ['51', '37'] },
    { id: 'tromp-taylor', ru: 'Tromp-Taylor', result: 'B+14.0', totals: ['51', '37'] },
    { id: 'stone-scoring', ru: 'Stone Scoring', result: 'B+16.0', totals: ['49', '33'] },
    { id: 'japanese', ru: 'Japanese', result: 'W+9.0', totals: ['2', '11'] },
    { id: 'korean', ru: 'Korean', result: 'W+9.0', totals: ['2', '11'] },
    ...[
      ['chinese', 'Chinese', 'W+1.5', '5.5', '4'],
      ['aga', 'AGA', 'W+0.5', '4.5', '3'],
    ].map(([rules, ru, result, whiteTotal, bonus]) => ({
      id: `${rules}-handicap`, rules, ru, result, totals: ['4', whiteTotal], bonus,
      // A real four-stone handicap setup, followed by a White move and passes.
      position: 'HA[4]AB[cg][gg][cc][gc];W[ee];B[];W[]', komi: 0.5,
    })),
    { id: 'official-result', rules: 'chinese', ru: 'Chinese', result: 'B+14.0', totals: ['51', '37'], officialResult: 'W+R' },
  ];
  const preload = await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    performance.setResourceTimingBufferSize(5000);
    localStorage.removeItem('web-katrain:auto_saved_game:v1');
    localStorage.setItem('web-katrain:mobile_home_dismissed:v1', 'true');
    localStorage.setItem('web-katrain:library_open:v1', 'false');
    localStorage.setItem('web-katrain:pwa-install-dismissed:v1', 'true');
    localStorage.setItem('web-katrain:settings:v3', JSON.stringify({soundEnabled:false, loadSgfFastAnalysis:false}));
  ` });
  const errors = [];
  const downloads = [];
  const unsubscribe = cdp.on(message => {
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
    if (message.method === 'Page.downloadProgress') downloads.push(message.params);
  });
  const wait = async expression => {
    for (let i = 0; i < 100; i++) {
      const value = await evaluate(cdp, expression);
      if (value) return value;
      await sleep(100);
    }
    throw new Error(`Manual scoring check timed out: ${expression}`);
  };
  const visible = selector => `[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.getBoundingClientRect().width>0&&!e.closest('[inert]'))`;
  let mobile = false;
  const press = async point => {
    if (mobile) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      for (const type of ['mousePressed', 'mouseReleased']) {
        await cdp.send('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 });
      }
    }
  };
  const clickElement = async expression => {
    await wait(`!!(${expression})`);
    await evaluate(cdp, `(${expression}).scrollIntoView({block:'nearest'})`);
    const point = await wait(`(()=>{
      const e=${expression};if(!e)return false;
      const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
      return !e.disabled&&r.height&&e.contains(document.elementFromPoint(x,y))?{x,y}:false;
    })()`);
    await press(point);
  };
  const click = selector => clickElement(visible(selector));
  const key = async (key, windowsVirtualKeyCode) => {
    for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', { type, key, windowsVirtualKeyCode });
  };
  const reports = [];
  try {
    for (const [width, height] of [[1280, 800], [390, 844], [320, 568]]) {
      mobile = width < 1000;
      await setViewport(cdp, { width, height, mobile });
      await navigate(cdp, appUrl);
      await wait('!!document.querySelector("[data-board-snapshot=true]")');
      await evaluate(cdp, `(async()=>{
        const url=${loadedModuleUrl.toString()};
        window.manualScoreCheckStore=(await import(url('/src/store/gameStore.ts'))).useGameStore;
      })()`);
      for (const fixture of cases) {
        const stem = `${width}x${height}-score-${fixture.id}`;
        try {
          const importPath = path.join(runDir, `${stem}.sgf`);
          const sgf = `(;GM[1]SZ[9]GN[${stem}]KM[${fixture.komi ?? 7}]RU[${fixture.ru}]${fixture.officialResult ? `RE[${fixture.officialResult}]` : ''}${fixture.position ?? position})`;
          fs.writeFileSync(importPath, sgf);
          const root = (await cdp.send('DOM.getDocument')).result.root;
          const nodeId = (await cdp.send('DOM.querySelector', {
            nodeId: root.nodeId, selector: 'input[type=file][accept^=".sgf"]:not([multiple])',
          })).result.nodeId;
          assert.ok(nodeId, 'Native SGF file input missing');
          const imported = await cdp.send('DOM.setFileInputFiles', { nodeId, files: [importPath] });
          assert.ok(!imported.error, JSON.stringify(imported.error));
          await wait(`manualScoreCheckStore.getState().rootNode.properties.GN?.[0]===${JSON.stringify(stem)}`);
          await key('End', 35);
          await wait(`manualScoreCheckStore.getState().moveHistory.length===${fixture.position ? 3 : 2}`);
          if (await evaluate(cdp, `!!(${visible('button[aria-label^="Score position"]')})`)) {
            await click('button[aria-label^="Score position"]');
          } else {
            await click('button[aria-label="More controls"]');
            await clickElement(`[...document.querySelectorAll('[data-bottom-more-sheet] button')].find(e=>e.textContent.trim()==='Score position')`);
          }
          await wait('!!document.querySelector(".manual-score-result")');
          const snapshot = await evaluate(cdp, `({
            result:document.querySelector('.manual-score-result>span').textContent,
            totals:[...document.querySelectorAll('.manual-score-totals strong')].map(e=>e.textContent),
            rules:manualScoreCheckStore.getState().settings.gameRules,
          })`);
          assert.equal(snapshot.rules, fixture.rules ?? fixture.id);
          assert.equal(snapshot.result, fixture.result, stem);
          assert.deepEqual(snapshot.totals, fixture.totals, stem);
          await click('.manual-score-details-toggle');
          await wait('!!document.querySelector(".manual-score-breakdown:not([hidden])")');
          const details = await evaluate(cdp, `(()=>{
            const d=document.querySelector('.manual-score-breakdown');
            return {rules:d.querySelector('.manual-score-rules')?.textContent,rows:[...d.querySelectorAll(':scope>div')].map(e=>e.textContent)};
          })()`);
          assert.ok(details.rules?.includes(fixture.ru === 'Stone Scoring' ? 'Ancient Chinese' : fixture.ru), JSON.stringify(details));
          const area = !['japanese', 'korean'].includes(fixture.id);
          assert.equal(details.rows.some(row => row.startsWith('Living stones')), area);
          assert.equal(details.rows.some(row => row.startsWith('Prisoners')), !area);
          if (fixture.bonus) assert.ok(details.rows.includes(`Handicap bonus-White ${fixture.bonus}`), JSON.stringify(details));
          if (fixture.id === 'stone-scoring') assert.ok(details.rows.includes('Group taxBlack -2White -4'), JSON.stringify(details));
          // Each row must be recoverable in the compact panel's scroller.
          for (const row of ['.manual-score-rules', '.manual-score-breakdown>div:last-child']) {
            await evaluate(cdp, `document.querySelector(${JSON.stringify(row)}).scrollIntoView({block:'nearest'})`);
            await wait(`(()=>{const e=document.querySelector(${JSON.stringify(row)}),r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})()`);
          }
          const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
          fs.writeFileSync(path.join(screenshotDir, `${stem}.png`), Buffer.from(screenshot.result.data, 'base64'));
          await click('.manual-score-details-toggle');
          if (fixture.id === 'chinese-handicap') {
            // These are the same store actions used by Game Info and Settings.
            // Keep the panel open to catch stale memo inputs after in-place
            // root metadata changes and a rules change with an unchanged board.
            await evaluate(cdp, 'manualScoreCheckStore.getState().setHandicap(3)');
            await wait(`JSON.stringify([...document.querySelectorAll('.manual-score-totals strong')].map(e=>e.textContent))==='["3","4.5"]'`);
            await evaluate(cdp, 'manualScoreCheckStore.getState().setHandicap(4)');
            await wait(`JSON.stringify([...document.querySelectorAll('.manual-score-totals strong')].map(e=>e.textContent))==='["4","5.5"]'`);
            await evaluate(cdp, `manualScoreCheckStore.getState().updateSettings({gameRules:'aga'})`);
            await wait(`document.querySelector('.manual-score-result>span')?.textContent==='W+0.5'`);
            await evaluate(cdp, `manualScoreCheckStore.getState().updateSettings({gameRules:'chinese'})`);
            await wait(`document.querySelector('.manual-score-result>span')?.textContent==='W+1.5'`);
          }
          if (fixture.id === 'stone-scoring') {
            const point = await wait(`(()=>{
              const b=document.querySelector('[data-board-snapshot=true]'),r=b.getBoundingClientRect();
              const c=Number(b.dataset.boardCellSize),x=r.x+Number(b.dataset.boardOriginX)+4*c,y=r.y+Number(b.dataset.boardOriginY)+4*c;
              return b.contains(document.elementFromPoint(x,y))?{x,y}:false;
            })()`);
            await press(point);
            await wait(`document.querySelector('.manual-score-result>span')?.textContent==='W+84.0'`);
            await click('.manual-score-actions button[title="Clear dead stones"]');
            await wait(`document.querySelector('.manual-score-result>span')?.textContent==='B+16.0'`);
          }
          await click('.manual-score-actions button.primary');
          await wait('!document.querySelector(".manual-score-result")');
          const recorded = await evaluate(cdp, 'manualScoreCheckStore.getState().rootNode.properties.RE?.[0]');
          const expectedResult = fixture.officialResult ?? fixture.result;
          assert.equal(recorded, expectedResult, `${stem} recorded result`);
          const downloadDir = path.join(runDir, `${stem}-download`);
          fs.mkdirSync(downloadDir);
          const enabled = await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir });
          assert.ok(!enabled.error, JSON.stringify(enabled.error));
          const priorDownloadEvents = downloads.length;
          if (mobile) await click('button[aria-label="Menu"]');
          await click('button[aria-label^="Save SGF"]');
          let completed = false;
          for (let i = 0; i < 100 && !completed; i++) {
            completed = downloads.slice(priorDownloadEvents).some(event => event.state === 'completed');
            if (!completed) await sleep(100);
          }
          assert.ok(completed, `${stem}: native SGF download did not complete: ${JSON.stringify(downloads.slice(priorDownloadEvents))}`);
          const downloaded = fs.readdirSync(downloadDir).find(file => file.endsWith('.sgf'));
          assert.ok(downloaded, `${stem}: native SGF download did not finish`);
          const saved = fs.readFileSync(path.join(downloadDir, downloaded), 'utf8');
          fs.writeFileSync(path.join(screenshotDir, `${stem}.sgf`), saved);
          assert.ok(saved.includes(`RE[${expectedResult}]`), `${stem}: exported SGF result`);
          // Parse the actual download with the application's importer as well.
          const roundTrip = await evaluate(cdp, `(async()=>{
            const url=${loadedModuleUrl.toString()}, {parseSgf}=await import(url('/src/utils/sgf.ts'));
            return parseSgf(${JSON.stringify(saved)}).tree.props.RE?.[0];
          })()`);
          assert.equal(roundTrip, expectedResult, `${stem}: exported result round trip`);
          reports.push({ width, height, id: fixture.id, ...snapshot, details, recorded, roundTrip });
        } catch (error) {
          const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
          fs.writeFileSync(path.join(screenshotDir, `${stem}-failure.png`), Buffer.from(screenshot.result.data, 'base64'));
          throw error;
        }
      }
      console.log(`Manual scoring at ${width}x${height}: seven rules, handicap, dead marks, and SGF results passed.`);
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(screenshotDir, 'manual-scoring-results.json'), JSON.stringify(reports, null, 2));
  } finally {
    unsubscribe();
    await cdp.send('Page.setDownloadBehavior', { behavior: 'default' });
    await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: preload.result.identifier });
  }
}
