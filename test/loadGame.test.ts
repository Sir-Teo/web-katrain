import { describe, it, expect } from 'vitest';
import { useGameStore } from '../src/store/gameStore';
import { DEFAULT_BOARD_SIZE, type AnalysisResult } from '../src/types';
import { generateSgfFromTree, parseSgf } from '../src/utils/sgf';

describe('GameStore loadGame', () => {
    it('loads a game from SGF data', () => {
        const store = useGameStore.getState();
        // Reset
        store.resetGame();

        const sgfData = {
            moves: [
                { x: 3, y: 3, player: 'black' as const },
                { x: 15, y: 15, player: 'white' as const }
            ],
            initialBoard: Array(DEFAULT_BOARD_SIZE).fill(null).map(() => Array(DEFAULT_BOARD_SIZE).fill(null)),
            komi: 7.5
        };
        // Add a handicap stone manually to initialBoard
        sgfData.initialBoard[9][9] = 'black';

        store.loadGame(sgfData);

        const state = useGameStore.getState();

        // KaTrain behavior: load rewinds to root by default, so only setup stones are on the board.
        expect(state.board[9][9]).toBe('black');

        // No moves applied at root
        expect(state.board[3][3]).toBe(null);
        expect(state.board[15][15]).toBe(null);

        // Tree has the main line
        expect(state.rootNode.children[0]?.move).toEqual({ x: 3, y: 3, player: 'black' });
        expect(state.rootNode.children[0]?.children[0]?.move).toEqual({ x: 15, y: 15, player: 'white' });

        // Root state
        expect(state.moveHistory).toHaveLength(0);
        expect(state.currentPlayer).toBe('black');

        // Check Komi
        expect(state.komi).toBe(7.5);

        // Navigating to end reaches the last move
        store.navigateEnd();
        const endState = useGameStore.getState();
        expect(endState.board[3][3]).toBe('black');
        expect(endState.board[15][15]).toBe('white');
        expect(endState.moveHistory).toHaveLength(2);
        expect(endState.currentPlayer).toBe('black'); // Next player after B, W is B
    });

    it('loads SGF variations into the move tree', () => {
        const store = useGameStore.getState();
        store.resetGame();

        const parsed = parseSgf('(;GM[1]SZ[19];B[pd](;W[dd])(;W[dp]))');
        store.loadGame(parsed);

        const state = useGameStore.getState();
        const root = state.rootNode;
        expect(root.children).toHaveLength(1);

        const bNode = root.children[0]!;
        expect(bNode.move).toEqual({ x: 15, y: 3, player: 'black' });
        expect(bNode.children).toHaveLength(2);

        // KaTrain behavior: load rewinds to root by default
        expect(state.currentNode.move).toBe(null);

        // Navigating to end follows the main branch (first child): W[dd]
        store.navigateEnd();
        const endState = useGameStore.getState();
        expect(endState.currentNode.move).toEqual({ x: 3, y: 3, player: 'white' });
    });

    it('preserves explicit zero komi from SGF data', () => {
        const store = useGameStore.getState();
        store.resetGame();

        const parsed = parseSgf('(;GM[1]SZ[19]KM[0];B[pd])');
        store.loadGame(parsed);

        const state = useGameStore.getState();
        expect(state.komi).toBe(0);
        expect(state.rootNode.gameState.komi).toBe(0);
    });

    it('loads non-root setup properties into descendant board states', () => {
        const store = useGameStore.getState();
        store.resetGame();

        const parsed = parseSgf('(;GM[1]SZ[9];B[cc];W[dd]AB[ee:fe]AW[ff]AE[cc];B[cc])');
        store.loadGame(parsed);

        store.navigateEnd();
        const state = useGameStore.getState();
        const setupNode = state.rootNode.children[0]?.children[0];
        expect(setupNode?.gameState.board[4]?.[4]).toBe('black');
        expect(setupNode?.gameState.board[4]?.[5]).toBe('black');
        expect(setupNode?.gameState.board[5]?.[5]).toBe('white');
        expect(setupNode?.gameState.board[2]?.[2]).toBe(null);
        expect(setupNode?.children[0]?.move).toEqual({ x: 2, y: 2, player: 'black' });
        expect(state.currentNode.move).toEqual({ x: 2, y: 2, player: 'black' });
    });

    it('round trips edit markers and labels through the game tree writer', () => {
        const store = useGameStore.getState();
        store.resetGame();

        const parsed = parseSgf('(;GM[1]SZ[19];B[pd]TR[dd]LB[cc:A];W[dp]SQ[qq])');
        store.loadGame(parsed);

        const output = generateSgfFromTree(useGameStore.getState().rootNode);
        expect(output).toContain('TR[dd]');
        expect(output).toContain('LB[cc:A]');
        expect(output).toContain('SQ[qq]');
    });

    it('loads Kaya KA analysis blobs from SGF nodes', () => {
        const store = useGameStore.getState();
        store.resetGame();

        const parsed = parseSgf(
            '(;GM[1]SZ[19];B[pd]KA[{"w":0.55,"s":1.5,"v":1000,"m":[{"m":"D4","p":0.54,"w":0.57,"s":2,"v":80}\\]}])'
        );
        store.loadGame(parsed);

        const node = useGameStore.getState().rootNode.children[0];
        expect(node?.analysis?.rootWinRate).toBeCloseTo(0.55);
        expect(node?.analysis?.rootScoreLead).toBeCloseTo(1.5);
        expect(node?.analysis?.rootVisits).toBe(1000);
        expect(node?.analysis?.moves[0]).toMatchObject({ x: 3, y: 15, visits: 80, prior: 0.54 });
        expect(node?.analysisVisitsRequested).toBe(1000);
    });

    it('exports Kaya KA alongside Web-KaTrain KT when analysis saving is enabled', () => {
        const store = useGameStore.getState();
        store.resetGame();
        store.playMove(3, 3);

        const node = useGameStore.getState().currentNode;
        const policy = new Array<number>(DEFAULT_BOARD_SIZE * DEFAULT_BOARD_SIZE + 1).fill(-1);
        policy[15 * DEFAULT_BOARD_SIZE + 15] = 0.42;
        const analysis: AnalysisResult = {
            rootWinRate: 0.61,
            rootScoreLead: 3.5,
            rootVisits: 500,
            moves: [
                {
                    x: 15,
                    y: 15,
                    order: 0,
                    visits: 500,
                    winRate: 0.61,
                    winRateLost: 0,
                    scoreLead: 3.5,
                    scoreSelfplay: 3.5,
                    scoreStdev: 0,
                    pointsLost: 0,
                    relativePointsLost: 0,
                    prior: 0.42,
                },
            ],
            territory: Array.from({ length: DEFAULT_BOARD_SIZE }, () => Array(DEFAULT_BOARD_SIZE).fill(0)),
            policy,
            ownershipMode: 'root',
        };
        node.analysis = analysis;

        const output = generateSgfFromTree(useGameStore.getState().rootNode, { trainer: { saveAnalysis: true } });

        expect(output).toContain('KA[');
        expect(output).toContain('"w":0.61');
        expect(output).toContain('"m":"Q4"');
        expect(output).toContain('KT[');
    });

    it('adds edit-mode annotations and prunes invalid descendants after setup changes', () => {
        const store = useGameStore.getState();
        store.resetGame();
        store.playMove(2, 2);
        useGameStore.getState().navigateStart();

        useGameStore.getState().setEditTool('marker-triangle');
        useGameStore.getState().applyEditTool(3, 3);
        expect(useGameStore.getState().rootNode.properties?.TR).toEqual(['dd']);

        useGameStore.getState().setEditTool('label-alpha');
        useGameStore.getState().applyEditTool(4, 4);
        expect(useGameStore.getState().rootNode.properties?.LB).toEqual(['ee:A']);

        useGameStore.getState().setEditTool('setup-white');
        useGameStore.getState().applyEditTool(2, 2);
        const state = useGameStore.getState();
        expect(state.rootNode.gameState.board[2]?.[2]).toBe('white');
        expect(state.rootNode.properties?.AW).toEqual(['cc']);
        expect(state.rootNode.children).toHaveLength(0);
        expect(state.notification?.message).toContain('1 descendant node was pruned');
    });
});
