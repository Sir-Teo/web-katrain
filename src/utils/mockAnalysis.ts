import { type BoardState, type Player, type AnalysisResult, type CandidateMove, BOARD_SIZE } from '../types';
import { getLiberties } from './gameLogic';

export const generateMockAnalysis = (board: BoardState, currentPlayer: Player): AnalysisResult => {
    // Generate random mock analysis data
    const moves: CandidateMove[] = [];
    const possibleMoves: {x: number, y: number}[] = [];

    // Find all legal moves (simplified: just empty spots with liberties)
    for(let y=0; y<BOARD_SIZE; y++) {
        for(let x=0; x<BOARD_SIZE; x++) {
            if (board[y][x] === null) {
                // Quick liberty check - actually we should reuse gameLogic but for mock we can be lenient
                // or just pick random empty spots.
                // Let's verify it has at least one liberty or adjacent same color
                // Actually, let's just pick random empty spots for now to be fast
                possibleMoves.push({x, y});
            }
        }
    }

    // Shuffle and pick top 5
    const shuffled = possibleMoves.sort(() => 0.5 - Math.random());
    const topMoves = shuffled.slice(0, 5);

    // Generate random stats
    // Assume current state is roughly even
    let baseWinRate = 0.5;
    let baseScore = 0.0;

    // Sort logic: first one is best
    topMoves.forEach((pos, index) => {
        // Decrease quality as index increases
        const winRate = Math.max(0, Math.min(1, baseWinRate + (Math.random() * 0.1 - (index * 0.05))));
        const scoreLead = baseScore + (Math.random() * 2 - (index * 1));

        moves.push({
            x: pos.x,
            y: pos.y,
            winRate: parseFloat(winRate.toFixed(3)),
            scoreLead: parseFloat(scoreLead.toFixed(1)),
            visits: Math.floor(Math.random() * 1000) + 100,
            order: index
        });
    });

    return {
        rootWinRate: baseWinRate,
        rootScoreLead: baseScore,
        moves: moves.sort((a, b) => b.winRate - a.winRate)
    };
};
