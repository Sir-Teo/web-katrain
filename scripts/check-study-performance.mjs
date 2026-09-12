import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromePath, chromeTarget, connectDevtools, evaluate, freePort, navigate, setViewport, sleep, waitForHttp } from './lib/browser.mjs';

// Measures synchronous study operations in a real browser, using the dev store
// to construct repeatable fixtures. These are not production INP measurements;
// check-responsiveness.mjs covers the rendered production UI separately.
async function main() {
  const appPort = await freePort();
  const devtoolsPort = await freePort();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'web-katrain-study-'));
  const server = spawn(path.join('node_modules', '.bin', 'vite'), [
    '--host', '127.0.0.1', '--port', String(appPort), '--strictPort',
  ], { stdio: 'ignore' });
  let chrome;
  let cdp;
  try {
    await waitForHttp(`http://127.0.0.1:${appPort}/`);
    chrome = spawn(chromePath, [
      '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      ...(process.env.CI ? ['--no-sandbox', '--disable-dev-shm-usage'] : []),
      `--user-data-dir=${profile}`, `--remote-debugging-port=${devtoolsPort}`, 'about:blank',
    ], { stdio: 'ignore' });
    cdp = connectDevtools(await chromeTarget(devtoolsPort));
    await cdp.ready;
    await setViewport(cdp, { width: 1280, height: 800, mobile: false });
    await navigate(cdp, `http://127.0.0.1:${appPort}/`);
    for (let i = 0; i < 100; i++) {
      if (await evaluate(cdp, `!!document.querySelector('[data-board-snapshot="true"]')`)) break;
      await sleep(100);
    }
    const result = await evaluate(cdp, `(async () => {
      const { useGameStore } = await import('/src/store/gameStore.ts');
      const { parseSgf, generateSgfFromTree } = await import('/src/utils/sgf.ts');
      const { findSolutionPath } = await import('/src/utils/problemMode.ts');
      const state = () => useGameStore.getState();
      state().updateSettings({ soundEnabled: false, loadSgfFastAnalysis: false });
      const sgf = '(;GM[1]SZ[9]' + Array.from({ length: 2000 }, (_, i) => ';' + (i % 2 ? 'W' : 'B') + '[]').join('') + ')';
      state().loadGame(parseSgf(sgf));
      state().setEditTool('marker-triangle');
      const times = [];
      for (let i = 0; i < 5; i++) {
        const start = performance.now();
        state().applyEditTool(i, 0);
        times.push(performance.now() - start);
      }
      const markerMedianMs = [...times].sort((a, b) => a - b)[2];
      state().resetGame();
      // Keep the large fixture out of the UI so its rendering does not enter
      // the export measurement. It contains comments, not fake game moves.
      const root = { ...state().rootNode, children: [] };
      let current = root;
      for (let i = 0; i < 12000; i++) {
        const child = { id: 'study-' + i, parent: current, children: [], move: null, gameState: root.gameState, note: 'Study ' + i };
        current.children.push(child);
        current = child;
      }
      const start = performance.now();
      const exported = generateSgfFromTree(root);
      const exportMs = performance.now() - start;
      let parsed = parseSgf(exported).tree;
      let comments = 0;
      while (parsed.children.length) {
        if (parsed.children.length !== 1) throw Error('Export changed the study sequence');
        parsed = parsed.children[0];
        if (parsed.props.C?.[0] !== 'Study ' + comments) throw Error('Export lost or reordered a comment');
        comments++;
      }
      const nestedSgf = '(;GM[1]SZ[9]' + Array.from({length:12000}, (_, i) => '(;C[Study ' + i + ']').join('') + ')'.repeat(12001);
      let traversalStart = performance.now();
      let nested = parseSgf(nestedSgf).tree;
      const nestedImportMs = performance.now() - traversalStart;
      for (let i = 0; i < 12000; i++) {
        if (nested.children.length !== 1) throw Error('Nested import changed the study sequence');
        nested = nested.children[0];
        if (nested.props.C?.[0] !== 'Study ' + i) throw Error('Nested import lost a comment');
      }
      if (nested.children.length) throw Error('Nested import added nodes');
      current.note = 'Correct';
      traversalStart = performance.now();
      const solution = findSolutionPath(root);
      const solutionSearchMs = performance.now() - traversalStart;
      if (solution.length !== 12001 || solution[0] !== root || solution.at(-1) !== current) {
        throw Error('Solution lookup lost part of the study');
      }
      const study = '(;GM[1]SZ[9];B[dd]' + Array.from({length:12000}, (_, i) => ';C[Study ' + i + ']').join('') + ')';
      state().loadGame(parseSgf(study));
      state().navigateStart();
      state().navigateForward();
      let operationStart = performance.now();
      state().copyCurrentBranch();
      const branchCopyMs = performance.now() - operationStart;
      state().navigateStart();
      operationStart = performance.now();
      state().pasteCopiedBranch();
      const branchPasteMs = performance.now() - operationStart;
      state().navigateStart();
      state().setEditTool('setup-black');
      operationStart = performance.now();
      state().applyEditTool(0, 0);
      const setupReplayMs = performance.now() - operationStart;
      if (state().rootNode.children.length !== 2) throw Error('Pasting the branch lost a variation');
      for (const first of state().rootNode.children) {
        let leaf = first;
        let count = 0;
        while (leaf.children.length) { leaf = leaf.children[0]; count++; }
        if (count !== 12000 || leaf.note !== 'Study 11999' || leaf.gameState.board[0][0] !== 'black') {
          throw Error('Copy/paste or setup replay lost part of the study');
        }
      }
      if (state().board !== state().rootNode.gameState.board) throw Error('Displayed and stored boards disagree');
      state().resetGame();
      return { markerMedianMs, markerSamplesMs: times, exportMs, comments, exportedBytes: new TextEncoder().encode(exported).length, nestedImportMs, solutionSearchMs, branchCopyMs, branchPasteMs, setupReplayMs };
    })()`);
    console.log(JSON.stringify(result, null, 2));
    // The old snapshot path measured 38ms median. Generous headroom over the
    // new sub-millisecond path accommodates slower machines without hiding it.
    assert.ok(result.markerMedianMs < 25, `Marker edit took ${result.markerMedianMs}ms; budget is 25ms`);
    assert.equal(result.comments, 12000);
    assert.ok(result.exportMs < 500, `Study export took ${result.exportMs}ms; budget is 500ms`);
    for (const operation of ['nestedImportMs', 'solutionSearchMs', 'branchCopyMs', 'branchPasteMs', 'setupReplayMs']) {
      assert.ok(result[operation] < 500, `${operation} took ${result[operation]}ms; budget is 500ms`);
    }
    console.log('Study performance checks passed.');
  } finally {
    cdp?.close();
    if (chrome && chrome.exitCode === null && chrome.signalCode === null) {
      const closed = new Promise((resolve) => chrome.once('exit', resolve));
      chrome.kill('SIGTERM');
      await closed;
    }
    server.kill('SIGTERM');
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
