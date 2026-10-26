import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeBrowser, chromePath, chromeTarget, connectDevtools, evaluate, freePort, navigate, setViewport, sleep, waitForHttp } from './lib/browser.mjs';

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
      const { useGameStore, lineViolatesSuperko } = await import('/src/store/gameStore.ts');
      const { parseSgf, generateSgfFromTree } = await import('/src/utils/sgf.ts');
      const { findSolutionPath } = await import('/src/utils/problemMode.ts');
      const { createLibraryItem, prependLibraryImports, getLibraryFolderOptions, formatLibraryFolderOptionLabel,
        duplicateLibraryItem, duplicateLibraryItems, deleteLibraryItems, getLibrarySelectionIds, libraryItemMatchesSearchTerms,
        compareLibraryNames, compareLibraryRecency } = await import('/src/utils/library.ts');
      const { toSearchTerms } = await import('/src/utils/searchTerms.ts');
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
      const template = createLibraryItem('Game.sgf', '(;GM[1]SZ[9])');
      const existing = Array.from({length:10000}, (_, i) => ({...template, id:'existing-'+i, name:'Existing '+i}));
      const incoming = Array.from({length:10000}, (_, i) => ({...template, id:'import-'+i}));
      operationStart = performance.now();
      const merged = prependLibraryImports(existing, incoming);
      const libraryImportNamingMs = performance.now() - operationStart;
      if (merged.length !== 20000 || new Set(merged.map(item => item.name.toLowerCase())).size !== 20000) {
        throw Error('Library import lost games or produced duplicate names');
      }
      const accentedGames=existing.slice(0,5000).map((item,i)=>({...item,name:'Jōseki '+i,
        metadata:{...item.metadata,black:'Éloïse',white:'Ō Rissei'}}));
      const searchTerms=toSearchTerms('eloise joseki');
      operationStart=performance.now();
      const searchMatches=accentedGames.filter(item=>libraryItemMatchesSearchTerms(item,searchTerms));
      const librarySearchMs=performance.now()-operationStart;
      if(searchMatches.length!==5000) throw Error('Library search lost accented names or titles');
      const shuffledNames=Array.from({length:10000},(_,i)=>'Game '+(((i*7919)%10000)+1));
      operationStart=performance.now();
      const sortedNames=[...shuffledNames].sort(compareLibraryNames);
      const libraryNameSortMs=performance.now()-operationStart;
      if(sortedNames.some((name,i)=>name!=='Game '+(i+1))) throw Error('Library numeric sorting reordered games');
      const sameTimeGames=shuffledNames.map((name,i)=>({...template,id:'recent-'+i,name,updatedAt:1}));
      operationStart=performance.now();
      const sortedRecent=[...sameTimeGames].sort(compareLibraryRecency);
      const libraryRecentSortMs=performance.now()-operationStart;
      if(sortedRecent.some((file,i)=>file.name!=='Game '+(i+1))) throw Error('Recent sorting reordered timestamp ties');
      const wideFolders=shuffledNames.map((name,i)=>({id:'wide-'+i,name,type:'folder',parentId:null,createdAt:i,updatedAt:i}));
      operationStart=performance.now();
      const wideDestinations=getLibraryFolderOptions(wideFolders);
      const libraryWideFolderOptionsMs=performance.now()-operationStart;
      if(wideDestinations.length!==10000||wideDestinations.some((folder,i)=>folder.name!=='Game '+(i+1))) {
        throw Error('Folder picker lost or reordered wide destinations');
      }
      const sameNamedGames = existing.map(item => ({...item, name:'Study.sgf'}));
      operationStart = performance.now();
      const copiedBatch = duplicateLibraryItems(sameNamedGames, sameNamedGames.map(item => item.id));
      const libraryBulkCopyMs = performance.now() - operationStart;
      if (copiedBatch.items.length !== 20000 || copiedBatch.duplicatedIds.length !== 10000 ||
          new Set(copiedBatch.items.map(item => item.id)).size !== 20000 ||
          new Set(copiedBatch.items.slice(0, 10000).map(item => item.name.toLowerCase())).size !== 10000 ||
          copiedBatch.items.slice(10000).some((item, index) => item !== sameNamedGames[index])) {
        throw Error('Bulk duplicate lost original games, independent IDs, or unique copy names');
      }
      const folders = Array.from({length:12000}, (_, i) => ({
        id:'folder-'+i, name:'Folder '+i, type:'folder', parentId:i ? 'folder-'+(i-1) : null, createdAt:i, updatedAt:i,
      })).reverse();
      operationStart = performance.now();
      const destinations = getLibraryFolderOptions(folders);
      const libraryFolderOptionsMs = performance.now() - operationStart;
      if (destinations.length !== 12000 || destinations.some((folder, i) => folder.id !== 'folder-'+i || folder.depth !== i)) {
        throw Error('Folder picker lost or reordered a deep destination');
      }
      const folderLabels = destinations.map(formatLibraryFolderOptionLabel);
      const libraryFolderLabelCharacters = folderLabels.reduce((total, label) => total + label.length, 0);
      if (folderLabels.some(label => label.length > 100) || libraryFolderLabelCharacters > 1000000) {
        throw Error('Folder picker allocated excessive indentation');
      }
      const hierarchyFolders = Array.from({length:3000}, (_, i) => ({
        id:'hierarchy-'+i, name:'Hierarchy '+i, type:'folder', parentId:i ? 'hierarchy-'+(i-1) : null, createdAt:i, updatedAt:i,
      }));
      const keeper = {...template, id:'hierarchy-keeper'};
      const hierarchy = [
        ...hierarchyFolders.map((folder, i) => ({...template, id:'hierarchy-game-'+i, parentId:folder.id})),
        ...hierarchyFolders.reverse(), keeper,
      ];
      operationStart = performance.now();
      const copiedHierarchy = duplicateLibraryItem(hierarchy, 'hierarchy-0');
      const libraryFolderCopyMs = performance.now() - operationStart;
      if (copiedHierarchy.duplicatedIds.length !== 6000 || copiedHierarchy.items.length !== 12001) {
        throw Error('Folder duplication lost a descendant');
      }
      operationStart = performance.now();
      const selectedHierarchy = getLibrarySelectionIds(hierarchy, ['hierarchy-0', 'hierarchy-1500', 'hierarchy-game-2999']);
      const librarySelectionCountMs = performance.now() - operationStart;
      if (selectedHierarchy.size !== 6000 || selectedHierarchy.has(keeper.id)) {
        throw Error('Overlapping folder selection miscounted descendants');
      }
      operationStart = performance.now();
      const afterHierarchyDelete = deleteLibraryItems(hierarchy, ['hierarchy-0', 'hierarchy-1500']);
      const libraryFolderDeleteMs = performance.now() - operationStart;
      if (afterHierarchyDelete.length !== 1 || afterHierarchyDelete[0] !== keeper) {
        throw Error('Folder deletion changed an unrelated game');
      }
      const bulkItems = [...existing, keeper], bulkIds = existing.map(item => item.id);
      operationStart = performance.now();
      const afterBulkDelete = deleteLibraryItems(bulkItems, bulkIds);
      const libraryBulkDeleteMs = performance.now() - operationStart;
      if (afterBulkDelete.length !== 1 || afterBulkDelete[0] !== keeper) {
        throw Error('Bulk deletion changed an unselected game');
      }
      const libraryHierarchy = {libraryFolderCopyMs, librarySelectionCountMs, libraryFolderDeleteMs, libraryBulkDeleteMs};
      // Isolate repetition checks from captures, rendering and neural inference.
      // These synthetic histories cover shared annotation boards and distinct
      // stored positions. Candidate-by-candidate checks are also used by the
      // fallback opponent, where repeatedly encoding all ancestors stalled UI.
      const superkoChecks = [];
      for (const distinct of [false, true]) {
        const template = state().rootNode;
        const shared = Array.from({length:19}, () => Array(19).fill(null));
        let last = null;
        for (let i = 0; i < 400; i++) {
          const board = distinct ? shared.map(row => [...row]) : shared;
          if (distinct) {
            for (let j = 0; j <= i % 361; j++) board[Math.floor(j / 19)][j % 19] = j % 2 ? 'white' : 'black';
          }
          last = {...template, id:'repetition-'+i, parent:last, children:[], gameState:{...template.gameState, board, currentPlayer:i % 2 ? 'white' : 'black'}};
        }
        const fresh = shared.map(row => [...row]);
        fresh[18][18] = 'white';
        operationStart = performance.now();
        if (lineViolatesSuperko(last, fresh, 'black', 'situational')) throw Error('Unexpected repetition');
        const coldMs = performance.now() - operationStart;
        operationStart = performance.now();
        for (let i = 0; i < 361; i++) {
          const candidate = shared.map(row => [...row]);
          candidate[Math.floor(i / 19)][i % 19] = 'white';
          if (lineViolatesSuperko(last, candidate, 'black', 'situational')) throw Error('Unexpected repetition');
        }
        superkoChecks.push({distinct, positions:400, candidates:361, coldMs, candidatesMs:performance.now() - operationStart});
      }
      return { markerMedianMs, markerSamplesMs: times, exportMs, comments, exportedBytes: new TextEncoder().encode(exported).length, nestedImportMs, solutionSearchMs, branchCopyMs, branchPasteMs, setupReplayMs, libraryImportNamingMs, librarySearchMs, libraryNameSortMs, libraryRecentSortMs, libraryWideFolderOptionsMs, libraryBulkCopyMs, libraryFolderOptionsMs, libraryFolderLabelCharacters, libraryHierarchy, superkoChecks };
    })()`);
    console.log(JSON.stringify(result, null, 2));
    // The old snapshot path measured 38ms median. Generous headroom over the
    // new sub-millisecond path accommodates slower machines without hiding it.
    assert.ok(result.markerMedianMs < 25, `Marker edit took ${result.markerMedianMs}ms; budget is 25ms`);
    assert.equal(result.comments, 12000);
    assert.ok(result.exportMs < 500, `Study export took ${result.exportMs}ms; budget is 500ms`);
    assert.ok(result.librarySearchMs < 100, `5,000-game search took ${result.librarySearchMs}ms; budget is 100ms`);
    for(const operation of ['libraryNameSortMs','libraryRecentSortMs','libraryWideFolderOptionsMs']) {
      assert.ok(result[operation]<250, `${operation} took ${result[operation]}ms; budget is 250ms`);
    }
    for (const operation of ['nestedImportMs', 'solutionSearchMs', 'branchCopyMs', 'branchPasteMs', 'setupReplayMs', 'libraryImportNamingMs', 'libraryBulkCopyMs', 'libraryFolderOptionsMs']) {
      assert.ok(result[operation] < 500, `${operation} took ${result[operation]}ms; budget is 500ms`);
    }
    for (const [operation, ms] of Object.entries(result.libraryHierarchy)) {
      assert.ok(ms < 50, `${operation} took ${ms}ms; budget is 50ms`);
    }
    for (const check of result.superkoChecks) {
      assert.ok(check.candidatesMs < 50, `Superko checks took ${check.candidatesMs}ms (distinct=${check.distinct}); budget is 50ms`);
    }
    console.log('Study performance checks passed.');
  } finally {
    await closeBrowser(cdp, chrome);
    server.kill('SIGTERM');
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
