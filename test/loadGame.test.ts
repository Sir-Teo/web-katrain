import { describe, it, expect, vi } from 'vitest';
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

    it('promotes, deletes, and prunes branches from the game tree', () => {
        const store = useGameStore.getState();
        store.resetGame();

        store.loadGame(parseSgf('(;GM[1]SZ[9];B[dd](;W[ee];B[ff])(;W[cc];B[bb])(;W[gg];B[hh]))'));
        store.navigateEnd();
        store.switchBranch(1);

        expect(useGameStore.getState().currentNode.move).toEqual({ x: 1, y: 1, player: 'black' });

        store.makeCurrentNodeMainBranch();
        store.navigateStart();
        store.navigateEnd();
        expect(useGameStore.getState().currentNode.move).toEqual({ x: 1, y: 1, player: 'black' });

        store.deleteCurrentNode();
        expect(useGameStore.getState().currentNode.move).toEqual({ x: 2, y: 2, player: 'white' });

        store.loadGame(parseSgf('(;GM[1]SZ[9];B[dd](;W[ee];B[ff])(;W[cc];B[bb])(;W[gg];B[hh]))'));
        store.navigateEnd();
        store.switchBranch(1);
        store.pruneCurrentBranch();

        const branchPoint = useGameStore.getState().rootNode.children[0];
        expect(branchPoint?.children).toHaveLength(1);
        expect(branchPoint?.children[0]?.move).toEqual({ x: 2, y: 2, player: 'white' });
    });

    it('copies and pastes branches at the current node', () => {
        const store = useGameStore.getState();
        store.resetGame();

        store.loadGame(parseSgf('(;GM[1]SZ[9];B[dd](;W[ee];B[ff];W[gg])(;W[cc]))'));
        store.navigateEnd();

        expect(useGameStore.getState().currentNode.move).toEqual({ x: 6, y: 6, player: 'white' });
        store.navigateBack();
        const copiedRootMove = useGameStore.getState().currentNode.move;
        expect(copiedRootMove).toEqual({ x: 5, y: 5, player: 'black' });
        store.copyCurrentBranch();

        store.navigateBack();
        store.switchBranch(1);
        expect(useGameStore.getState().currentNode.move).toEqual({ x: 2, y: 2, player: 'white' });

        store.pasteCopiedBranch();
        const pasted = useGameStore.getState().currentNode;
        expect(pasted.move).toEqual(copiedRootMove);
        expect(pasted.children[0]?.move).toEqual({ x: 6, y: 6, player: 'white' });
        expect(pasted.parent?.move).toEqual({ x: 2, y: 2, player: 'white' });
    });

    it('opens problem collections at the first problem without leaving joseki roots', () => {
        const store = useGameStore.getState();
        store.resetGame();

        store.loadGame(parseSgf('(;GM[1]SZ[9](;B[aa])(;B[bb])(;B[cc])(;B[dd]))'));

        const problemState = useGameStore.getState();
        expect(problemState.currentNode.move).toEqual({ x: 0, y: 0, player: 'black' });
        expect(problemState.moveHistory).toHaveLength(1);

        store.loadGame(parseSgf('(;GM[1]SZ[9]LB[aa:A](;B[aa])(;B[bb])(;B[cc])(;B[dd]))'));

        const josekiState = useGameStore.getState();
        expect(josekiState.currentNode.move).toBe(null);
        expect(josekiState.moveHistory).toHaveLength(0);
        expect(josekiState.rootNode.properties?.LB).toEqual(['aa:A']);
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

    it('edits and removes root SGF metadata safely', () => {
        const store = useGameStore.getState();
        store.resetGame();

        store.setRootProperty('PB', ' Black ] Player\\ ');
        store.setRootProperty('PW', 'White Player');
        store.setRootProperty('BR', '9p');
        store.setRootProperty('GN', 'Review game');

        const edited = useGameStore.getState();
        expect(edited.rootNode.properties?.PB).toEqual(['Black ] Player\\']);
        expect(edited.rootNode.properties?.PW).toEqual(['White Player']);
        expect(edited.rootNode.properties?.BR).toEqual(['9p']);

        const sgf = generateSgfFromTree(edited.rootNode);
        expect(sgf).toContain('PB[Black \\] Player\\\\]');
        expect(sgf).toContain('PW[White Player]');
        expect(sgf).toContain('BR[9p]');
        expect(sgf).toContain('GN[Review game]');

        store.setRootProperty('PB', '   ');
        expect(useGameStore.getState().rootNode.properties?.PB).toBeUndefined();
    });

    it('only auto-starts load-time analysis when the fast-analysis setting is enabled', () => {
        const original = useGameStore.getState();
        const originalQuick = original.startQuickGameAnalysis;
        const originalFast = original.startFastGameAnalysis;
        const originalSettings = original.settings;
        const quick = vi.fn();
        const fast = vi.fn();

        vi.useFakeTimers();
        vi.stubGlobal('window', {});
        vi.stubGlobal('Worker', vi.fn());

        try {
            useGameStore.setState((state) => ({
                settings: { ...state.settings, soundEnabled: false, loadSgfFastAnalysis: false },
                startQuickGameAnalysis: quick,
                startFastGameAnalysis: fast,
            }));

            useGameStore.getState().loadGame(parseSgf('(;GM[1]SZ[19];B[pd];W[dd])'));
            vi.runOnlyPendingTimers();

            expect(quick).not.toHaveBeenCalled();
            expect(fast).not.toHaveBeenCalled();

            useGameStore.setState((state) => ({
                settings: { ...state.settings, loadSgfFastAnalysis: true },
            }));

            useGameStore.getState().loadGame(parseSgf('(;GM[1]SZ[19];B[pd];W[dd])'));
            vi.runOnlyPendingTimers();

            expect(quick).not.toHaveBeenCalled();
            expect(fast).toHaveBeenCalledTimes(1);
        } finally {
            useGameStore.setState({
                settings: originalSettings,
                startQuickGameAnalysis: originalQuick,
                startFastGameAnalysis: originalFast,
            });
            vi.unstubAllGlobals();
            vi.useRealTimers();
            useGameStore.getState().resetGame();
        }
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

        useGameStore.getState().clearCurrentNodeSetupStones();
        const cleared = useGameStore.getState();
        expect(cleared.rootNode.gameState.board[2]?.[2]).toBeNull();
        expect(cleared.rootNode.properties?.AW).toBeUndefined();
        expect(cleared.notification?.message).toContain('Cleared 1 setup stone');
    });

    it('applies photo board setup stones in one batch edit', () => {
        const store = useGameStore.getState();
        store.resetGame();
        store.playMove(2, 2);
        useGameStore.getState().navigateStart();

        const changed = useGameStore.getState().applySetupStones([
            { x: 2, y: 2, player: 'white' },
            { x: 3, y: 3, player: 'black' },
        ]);

        const state = useGameStore.getState();
        expect(changed).toBe(2);
        expect(state.rootNode.gameState.board[2]?.[2]).toBe('white');
        expect(state.rootNode.gameState.board[3]?.[3]).toBe('black');
        expect(state.rootNode.properties?.AW).toEqual(['cc']);
        expect(state.rootNode.properties?.AB).toEqual(['dd']);
        expect(state.rootNode.children).toHaveLength(0);
    });
});
