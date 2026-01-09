import { type BoardState, type Player, type AnalysisResult, BOARD_SIZE } from '../types';

export const generateMockAnalysis = (
    board: BoardState,
    currentPlayer: Player,
    parentAnalysis?: AnalysisResult | null
): AnalysisResult => {
    // Find all legal moves (simplified: just empty spots)
    const emptySpots: {x: number, y: number}[] = [];
    for(let y=0; y<BOARD_SIZE; y++) {
        for(let x=0; x<BOARD_SIZE; x++) {
            if (board[y][x] === null) {
                emptySpots.push({x, y});
            }
        }
    }

    if (emptySpots.length === 0) {
        // Game over?
        return {
            rootWinRate: 0.5,
            rootScoreLead: 0,
            moves: []
        };
    }

    // Shuffle and pick top 5-8 candidates
    const shuffled = emptySpots.sort(() => 0.5 - Math.random());
    const topMovesCount = Math.min(Math.floor(Math.random() * 4) + 4, emptySpots.length);
    const candidateSpots = shuffled.slice(0, topMovesCount);

    // Determine baseline score lead
    // If we have parent analysis, use it as a base to create continuity.
    // If parent analysis says score was +5, and we just played a move,
    // the new score should be around +5 (minus any mistake).
    // Since we don't know the move quality exactly without an engine, we'll assume
    // the move was "okay" with some variance.
    // Also flip perspective? No, score lead is usually absolute (e.g. Black lead).

    let baseScore = 0;
    if (parentAnalysis) {
        // Add some random variance (-2 to +2 points swing per move)
        // This simulates the back-and-forth of a game.
        const swing = (Math.random() * 4) - 2;
        baseScore = parentAnalysis.rootScoreLead + swing;

        // Clamp score to avoid runaway values
        baseScore = Math.max(-50, Math.min(50, baseScore));
    } else {
        // New game or no history, random start
        baseScore = (Math.random() * 10) - 5; // -5 to +5
    }

    const rootScoreLead = baseScore;

    // Generate candidate stats relative to root (best)
    const candidates = candidateSpots.map((pos, index) => {
        let pointsLost = 0;
        if (index > 0) {
            // Best move has 0 loss.
            // Others have 0.1 to 10 points loss.
            pointsLost = Math.random() * (index * 1.5);
        }

        // Round pointsLost
        pointsLost = Math.round(pointsLost * 10) / 10;

        // Calculate scoreLead for this move
        // If current player is Black:
        //   A move with pointsLost 2 means the score drops by 2 for Black.
        // If current player is White:
        //   A move with pointsLost 2 means the score *increases* by 2 for Black.

        // However, this logic is tricky without knowing if the rootScoreLead
        // accounts for the *best* move or the *current state*.
        // Usually, Analysis of Node X gives the best moves *from* Node X.
        // The "rootScoreLead" is the score if the best move is played.

        let moveScoreLead = rootScoreLead;
        if (currentPlayer === 'black') {
             // If Black plays suboptimally, Black's lead decreases.
             moveScoreLead = rootScoreLead - pointsLost;
        } else {
             // If White plays suboptimally, Black's lead increases (White's lead decreases).
             moveScoreLead = rootScoreLead + pointsLost;
        }

        // Winrate correlation with score (Sigmoid)
        const sigmoid = (x: number) => 1 / (1 + Math.exp(-x / 15)); // Flatter sigmoid
        let winRate = sigmoid(moveScoreLead);

        // If the move leads to a score, that score is usually from Black's perspective.
        // Win rate is usually Black's win rate.
        // So `sigmoid(moveScoreLead)` gives Black's win rate.

        // Add some noise
        winRate = Math.max(0, Math.min(1, winRate + (Math.random() * 0.02 - 0.01)));

        return {
            x: pos.x,
            y: pos.y,
            winRate: parseFloat(winRate.toFixed(3)),
            scoreLead: parseFloat(moveScoreLead.toFixed(1)),
            visits: Math.floor(Math.random() * 5000 / (index + 1)) + 50,
            pointsLost: pointsLost,
            order: 0 // placeholder
        };
    });

    candidates.sort((a, b) => a.pointsLost - b.pointsLost);
    candidates.forEach((c, i) => c.order = i);

    return {
        rootWinRate: candidates[0].winRate,
        rootScoreLead: candidates[0].scoreLead,
        moves: candidates
    };
};
