import { type BoardState, type Player, type AnalysisResult, BOARD_SIZE } from '../types';

export const generateMockAnalysis = (board: BoardState, currentPlayer: Player): AnalysisResult => {
    // Find all legal moves (simplified: just empty spots)
    // We'll limit scanning to 20 random empty spots to keep it varied but somewhat constrained
    // Actually, let's scan all, but only keep a subset for "top moves"
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

    // Generate a "best" score and winrate based on random noise
    // But try to keep it somewhat stable between calls if we were real AI.
    // Here we just randomize.
    const rootScoreLead = (Math.random() * 40) - 20; // -20 to +20

    // Generate candidate stats relative to root (best)
    // The first one will be "best"
    const candidates = candidateSpots.map((pos, index) => {
        // Points lost increases with index (just as a heuristic for mock)
        // Best move has 0 loss.
        // Others have 0.1 to 10 points loss.

        let pointsLost = 0;
        if (index > 0) {
            pointsLost = Math.random() * (index * 2); // random loss increasing with index
        }

        // Round pointsLost
        pointsLost = Math.round(pointsLost * 10) / 10;

        // Calculate scoreLead for this move
        // If current player is winning (positive score), a bad move reduces the score.
        // Wait, scoreLead is usually from perspective of current player?
        // Or Black? KataGo uses score lead from perspective of current player usually (or always black? Check docs).
        // Standard is often Black's lead.
        // Let's assume rootScoreLead is Black's lead.

        // If currentPlayer is Black:
        //   A move with pointsLost 2 means the score drops by 2 for Black.
        // If currentPlayer is White:
        //   A move with pointsLost 2 means the score *increases* by 2 for Black (White does worse).
        // Let's stick to "Current Player's Score Lead" being reduced by pointsLost.
        // But `rootScoreLead` in UI is usually Black's score.

        // Let's define: rootScoreLead is Black's lead.
        // pointsLost is always positive (badness of move).

        let moveScoreLead = rootScoreLead;
        if (currentPlayer === 'black') {
             moveScoreLead = rootScoreLead - pointsLost;
        } else {
             moveScoreLead = rootScoreLead + pointsLost; // Black gains if White loses points
        }

        // Winrate correlation with score
        // Simple heuristic sigmoid
        const sigmoid = (x: number) => 1 / (1 + Math.exp(-x / 10));
        let winRate = sigmoid(moveScoreLead);
        if (currentPlayer === 'white') winRate = 1 - winRate;

        // Add some noise to winrate so it's not perfect correlation
        winRate = Math.max(0, Math.min(1, winRate + (Math.random() * 0.05 - 0.025)));

        return {
            x: pos.x,
            y: pos.y,
            winRate: parseFloat(winRate.toFixed(3)), // 0-1
            scoreLead: parseFloat(moveScoreLead.toFixed(1)),
            visits: Math.floor(Math.random() * 5000 / (index + 1)) + 50, // visits drop off
            pointsLost: pointsLost,
            order: 0 // placeholder, will sort
        };
    });

    // Sort by pointsLost (ascending) -> Best moves first
    candidates.sort((a, b) => a.pointsLost - b.pointsLost);

    // Fix order index
    candidates.forEach((c, i) => c.order = i);

    return {
        rootWinRate: candidates[0].winRate,
        rootScoreLead: candidates[0].scoreLead,
        moves: candidates
    };
};
