import type { BoardState, Player } from '../types';

export const getOpponent = (player: Player): Player => player === 'black' ? 'white' : 'black';

export const boardsEqual = (a: BoardState, b: BoardState): boolean => {
  if (a.length !== b.length) return false;
  const size = a.length;
  for (let y = 0; y < size; y++) {
    const rowA = a[y];
    const rowB = b[y];
    if (!rowA || !rowB || rowA.length !== rowB.length) return false;
    for (let x = 0; x < size; x++) {
      if (rowA[x] !== rowB[x]) return false;
    }
  }
  return true;
};

export const getLiberties = (board: BoardState, x: number, y: number): { liberties: number, group: {x: number, y: number}[] } => {
  const player = board[y][x];
  if (!player) return { liberties: 0, group: [] };

  const size = board.length;
  const group: {x: number, y: number}[] = [];
  const visited = new Set<string>();
  const liberties = new Set<string>();
  const stack = [{x, y}];

  visited.add(`${x},${y}`);
  group.push({x, y});

  while (stack.length > 0) {
    const current = stack.pop()!;
    const neighbors = [
      {x: current.x + 1, y: current.y},
      {x: current.x - 1, y: current.y},
      {x: current.x, y: current.y + 1},
      {x: current.x, y: current.y - 1},
    ];

    for (const n of neighbors) {
      if (n.x < 0 || n.x >= size || n.y < 0 || n.y >= size) continue;

      const key = `${n.x},${n.y}`;
      const content = board[n.y][n.x];

      if (content === null) {
        liberties.add(key);
      } else if (content === player && !visited.has(key)) {
        visited.add(key);
        group.push(n);
        stack.push(n);
      }
    }
  }

  return { liberties: liberties.size, group };
};

export const applyCapturesInPlace = (board: BoardState, x: number, y: number, player: Player): { x: number; y: number }[] => {
  const opponent = getOpponent(player);
  const size = board.length;
  const neighbors = [
    {x: x + 1, y},
    {x: x - 1, y},
    {x, y: y + 1},
    {x, y: y - 1},
  ];

  const captured: {x: number, y: number}[] = [];

  for (const n of neighbors) {
    if (n.x < 0 || n.x >= size || n.y < 0 || n.y >= size) continue;

    if (board[n.y][n.x] === opponent) {
      const { liberties, group } = getLiberties(board, n.x, n.y);
      if (liberties === 0) {
        captured.push(...group);
        for (const stone of group) {
          board[stone.y][stone.x] = null;
        }
      }
    }
  }

  return captured;
};

export const checkCaptures = (board: BoardState, x: number, y: number, player: Player): { captured: {x: number, y: number}[], newBoard: BoardState } => {
  const newBoard = board.map(row => [...row]);
  const captured = applyCapturesInPlace(newBoard, x, y, player);
  return { captured, newBoard };
};

export const isValidMove = (board: BoardState, x: number, y: number, player: Player, previousBoard?: BoardState): boolean => {
    const size = board.length;
    // 1. Bounds
    if (x < 0 || x >= size || y < 0 || y >= size) return false;

    // 2. Occupied
    if (board[y][x] !== null) return false;

    // Simulate move
    const tentativeBoard = board.map(row => [...row]);
    tentativeBoard[y][x] = player;

    // 3. Check Captures
    const captured = applyCapturesInPlace(tentativeBoard, x, y, player);

    // 4. Suicide Check
    if (captured.length === 0) {
        const { liberties } = getLiberties(tentativeBoard, x, y);
        if (liberties === 0) return false;
    }

    // 5. Ko Check (Simple Ko)
    if (previousBoard) {
        if (boardsEqual(tentativeBoard, previousBoard)) return false;
    }

    return true;
};

// Heuristic Helper: Check if a spot is a simple eye for the player
// A spot is an eye if:
// 1. It is empty
// 2. All 4 neighbors are own stones
// 3. Diagonals (should be mostly own stones to be a real eye, but simplified: just neighbors)
export const isEye = (board: BoardState, x: number, y: number, player: Player): boolean => {
    if (board[y][x] !== null) return false;

    const size = board.length;
    const neighbors = [
        {x: x + 1, y},
        {x: x - 1, y},
        {x, y: y + 1},
        {x, y: y - 1},
    ];

    for (const n of neighbors) {
        if (n.x < 0 || n.x >= size || n.y < 0 || n.y >= size) continue; // Edge is fine
        if (board[n.y][n.x] !== player) return false;
    }

    // Check diagonals to distinguish real eye from false eye?
    // For a simple heuristic, preventing filling any surrounded spot is good enough for now.
    // Except if we need to poke out an eye? But this function checks if it IS an eye for `player`.
    // So if I am Black, isEye(..., 'black') returns true if I surround it.
    // I should not fill my own eye.

    // Refinement: False eye check
    // If diagonals are occupied by opponent, it might be a false eye.
    // Rule of thumb: If >= 2 diagonals are opponent (or >=1 on edge), it's false.

    let opponentDiagonals = 0;
    const diagonals = [
        {x: x+1, y: y+1}, {x: x-1, y: y-1},
        {x: x+1, y: y-1}, {x: x-1, y: y+1}
    ];
    let diagonalCount = 0;

    for (const d of diagonals) {
        if (d.x < 0 || d.x >= size || d.y < 0 || d.y >= size) continue;
        diagonalCount++;
        if (board[d.y][d.x] === getOpponent(player)) {
            opponentDiagonals++;
        }
    }

    if (opponentDiagonals >= 2) return false; // Likely false eye, okay to fill if needed
    // On edge?
    if (diagonalCount < 4 && opponentDiagonals >= 1) return false;

    return true;
};

export const getLegalMoves = (board: BoardState, player: Player, previousBoard?: BoardState): {x: number, y: number}[] => {
    const moves: {x: number, y: number}[] = [];
    const size = board.length;
    for(let y=0; y<size; y++) {
        for(let x=0; x<size; x++) {
            if (isValidMove(board, x, y, player, previousBoard)) {
                moves.push({x, y});
            }
        }
    }
    return moves;
};
