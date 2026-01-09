import type { GameState, Move, BoardState, Player } from "../types";
import { BOARD_SIZE } from "../types";

// Helper to convert SGF coord (e.g. "pd") to {x,y}
const sgfCoordToXy = (coord: string): { x: number, y: number } => {
    if (!coord || coord.length < 2) return { x: -1, y: -1 }; // Pass or empty
    if (coord === 'tt') return { x: -1, y: -1 }; // Pass in some SGF versions

    const aCode = 'a'.charCodeAt(0);
    const x = coord.charCodeAt(0) - aCode;
    const y = coord.charCodeAt(1) - aCode;
    // SGF coordinates start from top-left.
    return { x, y };
};

const coordinateToSgf = (x: number, y: number): string => {
  // SGF uses 'aa' for top left 0,0. 'sa' for 18,0. 'ss' for 18,18.
  // x corresponds to letter index 'a' + x.
  const aCode = 'a'.charCodeAt(0);
  const xChar = String.fromCharCode(aCode + x);
  const yChar = String.fromCharCode(aCode + y);
  return xChar + yChar;
};

export const generateSgf = (gameState: GameState): string => {
  const { moveHistory } = gameState;
  const date = new Date().toISOString().split('T')[0];

  let sgf = `(;GM[1]FF[4]CA[UTF-8]AP[WebKatrain:0.1]ST[2]\n`;
  sgf += `SZ[${BOARD_SIZE}]KM[6.5]\n`; // Komi hardcoded for now
  sgf += `DT[${date}]\n`;
  // Add other metadata?

  // Moves
  moveHistory.forEach(move => {
      const color = move.player === 'black' ? 'B' : 'W';
      let coords = '';
      if (move.x === -1) {
          coords = ''; // Pass is B[] or W[]
      } else {
          coords = coordinateToSgf(move.x, move.y);
      }
      sgf += `;${color}[${coords}]`;
  });

  sgf += `\n)`;

  return sgf;
};

export const downloadSgf = (gameState: GameState) => {
    const sgfContent = generateSgf(gameState);
    const blob = new Blob([sgfContent], { type: 'application/x-go-sgf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `game_${new Date().getTime()}.sgf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

export interface ParsedSgf {
    moves: { x: number, y: number, player: Player }[];
    initialBoard: BoardState;
    komi: number;
}

export const parseSgf = (sgfContent: string): ParsedSgf => {
    const moves: { x: number, y: number, player: Player }[] = [];
    const initialBoard: BoardState = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
    let komi = 6.5;

    // Very basic tokenizer/parser
    // Remove newlines and whitespace outside of []
    // Actually, SGF is robust to whitespace.

    // 1. Extract the main branch content. Assume (...) wraps the whole game.
    // Inside, we have ;NODE ;NODE ...

    // We will just regex for properties for now, as full parsing is complex.
    // But we need to handle sequences.

    // Split by ';' to get nodes.
    // Note: This fails if ';' is inside a comment, but typical SGFs don't do that often for simple move lists.
    // A better approach is to iterate char by char.

    let i = 0;
    const len = sgfContent.length;

    let currentNodeProps: Record<string, string[]> = {};

    // Helpers
    const skipWhitespace = () => {
        while (i < len && /\s/.test(sgfContent[i])) i++;
    };

    // Parse Property Value: [Value]
    const parseValue = (): string => {
        if (sgfContent[i] !== '[') return '';
        i++; // skip [
        let value = '';
        let escaped = false;
        while (i < len) {
            const char = sgfContent[i];
            if (escaped) {
                value += char;
                escaped = false;
            } else if (char === '\\') {
                escaped = true;
            } else if (char === ']') {
                break;
            } else {
                value += char;
            }
            i++;
        }
        i++; // skip ]
        return value;
    };

    // Main loop
    while (i < len) {
        const char = sgfContent[i];

        if (char === ';') {
            // New Node
            // Process previous node properties if any (specifically AB, AW, B, W)
             // But actually we process as we find them.
             i++;
        } else if (char === '(' || char === ')') {
            // Variation start/end. For now, we just continue linearly.
            // If we hit '(', we go in. If ')', we might stop if we only want main line?
            // If we just want the first variation (main line), we can ignore '(' but treat ')' as potentially end of branch?
            // But usually the file ends with ')' too.
            i++;
        } else if (/[A-Z]/.test(char)) {
            // Property Key
            let key = '';
            while (i < len && /[A-Z]/.test(sgfContent[i])) {
                key += sgfContent[i];
                i++;
            }

            // Property Values
            skipWhitespace();
            while (i < len && sgfContent[i] === '[') {
                const val = parseValue();

                // Handle known properties immediately
                if (key === 'B') {
                    const { x, y } = sgfCoordToXy(val);
                    moves.push({ x, y, player: 'black' });
                } else if (key === 'W') {
                     const { x, y } = sgfCoordToXy(val);
                     moves.push({ x, y, player: 'white' });
                } else if (key === 'AB') {
                    const { x, y } = sgfCoordToXy(val);
                    if (x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE) {
                        initialBoard[y][x] = 'black';
                    }
                } else if (key === 'AW') {
                    const { x, y } = sgfCoordToXy(val);
                     if (x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE) {
                        initialBoard[y][x] = 'white';
                    }
                } else if (key === 'KM') {
                    komi = parseFloat(val);
                }

                skipWhitespace();
            }
        } else {
            i++;
        }
    }

    return { moves, initialBoard, komi };
};
