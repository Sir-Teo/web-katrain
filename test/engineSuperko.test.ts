import { describe, expect, it, vi } from 'vitest';
import { MctsSearch } from '../src/engine/katago/analyzeMcts';
import { setBoardSize } from '../src/engine/katago/fastBoard';
import { applyCapturesInPlace, isValidMove } from '../src/utils/gameLogic';
import { situationalKey, violatesSuperko } from '../src/utils/superko';
import { hasModel, loadHarnessModel } from './helpers/engineHarness';
import { tripleKoFixture } from './helpers/superkoFixture';

describe.skipIf(!hasModel())('full-history superko in search', () => {
  for (const swap of [false, true]) {
    it.each(['aga', 'new-zealand', 'tromp-taylor', 'chinese'] as const)(
      `respects a three-ko cycle under %s, swapped=${swap}`, async rules => {
        setBoardSize(9);
        const { history, moves, repeatMove } = tripleKoFixture(swap);
        const current = history[history.length - 1]!;
        const next = current.board.map(row => [...row]);
        next[repeatMove.y]![repeatMove.x] = current.playerToMove;
        applyCapturesInPlace(next, repeatMove.x, repeatMove.y, current.playerToMove);
        expect(next).toEqual(history[0]!.board);
        expect(isValidMove(current.board, repeatMove.x, repeatMove.y, current.playerToMove, history[4]!.board)).toBe(true);
        expect(violatesSuperko({ ko: 'situational', next: { board: next, playerToMove: history[0]!.playerToMove }, history })).toBe(true);
        const search = await MctsSearch.create({
          model: await loadHarnessModel(), board: current.board, currentPlayer: current.playerToMove,
          previousBoard: history[4]!.board, previousPreviousBoard: history[3]!.board,
          repetitionHistory: history.map(p => situationalKey(p.board, p.playerToMove)),
          wideRootNoise: 0,
          moveHistory: moves, rules, komi: 7, nnRandomize: false, conservativePass: false,
          maxChildren: 82, ownershipMode: 'none', rootPolicyTemperature: 100,
          regionOfInterest: { xMin: 1, xMax: 1, yMin: 6, yMax: 6 },
        });
        await search.run({ visits: 32, maxTimeMs: 30000, batchSize: 4 });
        const analysis = search.getAnalysis({ topK: 82, analysisPvLen: 5 });
        const repeated = analysis.moves.find(move => move.x === 1 && move.y === 6);
        if (rules === 'chinese') {
          expect(analysis.policy[55]).toBeGreaterThan(0);
          expect(repeated?.visits).toBeGreaterThan(0);
        } else {
          expect(analysis.policy[55]).toBe(-1);
          expect(repeated).toBeUndefined();
        }
      }, 60000,
    );
  }

  it.each(['aga', 'new-zealand', 'tromp-taylor', 'chinese'] as const)('enforces %s inside the tree and validates re-root history', async rules => {
    setBoardSize(9);
    const {history, moves} = tripleKoFixture();
    const current = history[4]!;
    const model = await loadHarnessModel();
    const recorded: Float32Array[] = [];
    const forward = model.forwardPolicyValue.bind(model);
    const spy = vi.spyOn(model, 'forwardPolicyValue').mockImplementation((spatial, global, meta) => {
      recorded.push(new Float32Array(spatial.dataSync()));
      return forward(spatial, global, meta);
    });
    try {
      const avoidMoveUntilBlack = new Int32Array(82); avoidMoveUntilBlack[81] = 1;
      const avoidMoveUntilWhite = new Int32Array(82).fill(2);
      avoidMoveUntilWhite[55] = 0;
      if (rules !== 'chinese') avoidMoveUntilWhite[81] = 0;
      const search = await MctsSearch.create({
        model, board:current.board, currentPlayer:current.playerToMove,
        previousBoard:history[3]!.board, previousPreviousBoard:history[2]!.board,
        moveHistory:moves.slice(0, 4), repetitionHistory:history.slice(0, 5).map(p => situationalKey(p.board, p.playerToMove)),
        rules, komi:7, nnRandomize:false, conservativePass:false, wideRootNoise:0,
        ownershipMode:'none', maxChildren:82, regionOfInterest:{xMin:6,xMax:7,yMin:1,yMax:1},
        avoidMoveUntilBlack, avoidMoveUntilWhite,
      });
      await search.run({visits:8, maxTimeMs:30000, batchSize:1});
      expect(recorded.length).toBeGreaterThan(1);
      expect(recorded[1]![55 * 22 + 6]).toBe(rules === 'chinese' ? 0 : 1);
      expect(search.getAnalysis({topK:82, analysisPvLen:3}).moves.find(m => m.x === 6 && m.y === 1)?.pv.slice(0, 2))
        .toEqual(['G8', rules === 'chinese' ? 'B3' : 'pass']);
      const after = history[5]!;
      const request = {move:15, board:after.board, currentPlayer:after.playerToMove,
        previousBoard:current.board, previousPreviousBoard:history[3]!.board, moveHistory:moves, komi:7, rules,
        repetitionHistory:history.map(p => situationalKey(p.board, p.playerToMove))};
      if (rules !== 'chinese') {
        expect(await search.reRootToChild({...request, repetitionHistory:request.repetitionHistory.slice(1)})).toBe(false);
      }
      expect(await search.reRootToChild(request)).toBe(true);
      expect(search.getAnalysis({topK:82, analysisPvLen:3}).policy[55] >= 0).toBe(rules === 'chinese');
    } finally {
      spy.mockRestore();
    }
  }, 60000);
});
