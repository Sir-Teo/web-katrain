import type { GameNode, GameState, BoardState, Player } from "../types";
import { BOARD_SIZE } from "../types";
import { encodeKaTrainKtFromAnalysis, KATRAIN_ANALYSIS_FORMAT_VERSION } from './katrainSgfAnalysis';

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
  sgf += `SZ[${BOARD_SIZE}]KM[${gameState.komi.toFixed(1)}]\n`;
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

function escapeSgfValue(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/]/g, '\\]').replace(/\r?\n/g, '\\\n');
}

function cloneProps(props: Record<string, string[]> | undefined): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    if (!props) return out;
    for (const [k, v] of Object.entries(props)) out[k] = [...v];
    return out;
}

function serializeProps(props: Record<string, string[]>): string {
    const preferred = [
        'GM',
        'FF',
        'CA',
        'AP',
        'ST',
        'RU',
        'SZ',
        'KM',
        'DT',
        'PB',
        'PW',
        'BR',
        'WR',
        'RE',
        'EV',
        'GN',
        'SO',
        'US',
        'GC',
        'PC',
        'TM',
        'OT',
        'HA',
        'AB',
        'AW',
        'AE',
        'PL',
        'C',
        'N',
    ] as const;
    const preferredSet = new Set<string>(preferred);

    const keys = Object.keys(props);
    const ordered = [
        ...preferred.filter((k) => keys.includes(k)),
        ...keys.filter((k) => !preferredSet.has(k)).sort(),
    ];

    let out = '';
    for (const key of ordered) {
        const values = props[key] ?? [];
        if (values.length === 0) {
            out += `${key}[]`;
            continue;
        }
        for (const value of values) out += `${key}[${escapeSgfValue(value)}]`;
    }
    return out;
}

function rootPlacementsFromBoard(board: BoardState): { AB?: string[]; AW?: string[] } {
    const ab: string[] = [];
    const aw: string[] = [];
    for (let y = 0; y < BOARD_SIZE; y++) {
        for (let x = 0; x < BOARD_SIZE; x++) {
            const v = board[y]?.[x] ?? null;
            if (v === 'black') ab.push(coordinateToSgf(x, y));
            else if (v === 'white') aw.push(coordinateToSgf(x, y));
        }
    }
    const out: { AB?: string[]; AW?: string[] } = {};
    if (ab.length > 0) out.AB = ab;
    if (aw.length > 0) out.AW = aw;
    return out;
}

function serializeMoveNode(node: GameNode): string {
    const move = node.move;
    if (!move) return '';

    const props = cloneProps(node.properties);
    delete props.B;
    delete props.W;
    if (node.analysis) props.KT = encodeKaTrainKtFromAnalysis({ analysis: node.analysis });

    const key = move.player === 'black' ? 'B' : 'W';
    const coord = move.x < 0 || move.y < 0 ? '' : coordinateToSgf(move.x, move.y);
    props[key] = [coord];

    return `;${serializeProps(props)}`;
}

function serializeSequence(node: GameNode): string {
    let out = serializeMoveNode(node);
    if (!out) return '';

    const children = node.children;
    if (children.length === 0) return out;
    if (children.length === 1) return out + serializeSequence(children[0]!);

    for (const child of children) out += `(${serializeSequence(child)})`;
    return out;
}

export const generateSgfFromTree = (rootNode: GameNode): string => {
    const date = new Date().toISOString().split('T')[0];

    const props = cloneProps(rootNode.properties);
    delete props.B;
    delete props.W;
    delete props.AB;
    delete props.AW;
    delete props.AE;

    props.GM = ['1'];
    props.FF = ['4'];
    props.CA = ['UTF-8'];
    props.AP = props.AP?.length ? props.AP : ['WebKatrain:0.1'];
    props.ST = props.ST?.length ? props.ST : ['2'];
    props.KTV = props.KTV?.length ? props.KTV : [KATRAIN_ANALYSIS_FORMAT_VERSION];
    props.SZ = [String(BOARD_SIZE)];
    props.KM = [rootNode.gameState.komi.toFixed(1)];
    if (!props.DT?.length) props.DT = [date];

    const placements = rootPlacementsFromBoard(rootNode.gameState.board);
    if (placements.AB) props.AB = placements.AB;
    if (placements.AW) props.AW = placements.AW;

    if (rootNode.analysis) props.KT = encodeKaTrainKtFromAnalysis({ analysis: rootNode.analysis });

    let sgf = `(;${serializeProps(props)}`;

    const children = rootNode.children;
    if (children.length === 1) sgf += serializeSequence(children[0]!);
    else if (children.length > 1) {
        for (const child of children) sgf += `(${serializeSequence(child)})`;
    }

    sgf += ')';
    return sgf;
};

export const downloadSgfFromTree = (rootNode: GameNode) => {
    const sgfContent = generateSgfFromTree(rootNode);
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

export interface ParsedSgfNode {
    props: Record<string, string[]>;
    children: ParsedSgfNode[];
}

export interface ParsedSgf {
    moves: { x: number, y: number, player: Player }[];
    initialBoard: BoardState;
    komi: number;
    tree?: ParsedSgfNode;
}

export const parseSgf = (sgfContent: string): ParsedSgf => {
    const moves: { x: number, y: number, player: Player }[] = [];
    const initialBoard: BoardState = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
    let komi = 6.5;

    type SgfNode = ParsedSgfNode;

    // Find the first game tree.
    let i = sgfContent.indexOf('(');
    if (i < 0) return { moves, initialBoard, komi };
    const len = sgfContent.length;

    const skipWhitespace = () => {
        while (i < len && /\s/.test(sgfContent[i]!)) i++;
    };

    const parseValue = (): string => {
        if (sgfContent[i] !== '[') return '';
        i++; // skip [
        let value = '';
        while (i < len) {
            const char = sgfContent[i]!;
            if (char === '\\') {
                // Escape next char (including ] or \). SGF also allows escaping newlines.
                i++;
                if (i < len) value += sgfContent[i]!;
                i++;
                continue;
            }
            if (char === ']') break;
            value += char;
            i++;
        }
        if (sgfContent[i] === ']') i++; // skip ]
        return value;
    };

    const parsePropIdent = (): string => {
        let key = '';
        while (i < len && /[A-Za-z]/.test(sgfContent[i]!)) {
            key += sgfContent[i]!;
            i++;
        }
        // Normalize legacy properties like SiZe -> SZ.
        return key.replace(/[a-z]/g, '');
    };

    const parseNode = (): SgfNode => {
        const props: Record<string, string[]> = {};
        skipWhitespace();
        while (i < len && /[A-Za-z]/.test(sgfContent[i]!)) {
            const key = parsePropIdent();
            if (!key) break;
            skipWhitespace();
            const values: string[] = [];
            while (i < len && sgfContent[i] === '[') {
                values.push(parseValue());
                skipWhitespace();
            }
            if (values.length > 0) {
                props[key] = props[key] ? props[key]!.concat(values) : values;
            } else if (!props[key]) {
                props[key] = [];
            }
            skipWhitespace();
        }
        return { props, children: [] };
    };

    const parseSequence = (): { root: SgfNode; last: SgfNode } => {
        skipWhitespace();
        let root: SgfNode | null = null;
        let last: SgfNode | null = null;
        while (i < len && sgfContent[i] === ';') {
            i++; // skip ;
            const node = parseNode();
            if (!root) root = node;
            if (last) last.children.push(node); // continuation of the main line
            last = node;
            skipWhitespace();
        }
        if (!root || !last) throw new Error('Invalid SGF: missing node sequence');
        return { root, last };
    };

    const parseGameTree = (): SgfNode => {
        skipWhitespace();
        if (sgfContent[i] !== '(') throw new Error('Invalid SGF: expected "("');
        i++; // skip (
        const { root, last } = parseSequence();
        skipWhitespace();
        while (i < len && sgfContent[i] === '(') {
            const childTree = parseGameTree();
            last.children.push(childTree);
            skipWhitespace();
        }
        if (sgfContent[i] !== ')') throw new Error('Invalid SGF: expected ")"');
        i++; // skip )
        return root;
    };

    let root: SgfNode;
    try {
        root = parseGameTree();
    } catch {
        return { moves, initialBoard, komi };
    }

    const rootKomi = root.props['KM']?.[0];
    if (rootKomi) {
        const k = parseFloat(rootKomi);
        if (!Number.isNaN(k)) komi = k;
    }

    const applyPlacement = (player: Player, coords: string[]) => {
        for (const coord of coords) {
            const { x, y } = sgfCoordToXy(coord);
            if (x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE) {
                initialBoard[y][x] = player;
            }
        }
    };
    if (root.props['AB']) applyPlacement('black', root.props['AB']);
    if (root.props['AW']) applyPlacement('white', root.props['AW']);
    if (root.props['AE']) {
        for (const coord of root.props['AE']) {
            const { x, y } = sgfCoordToXy(coord);
            if (x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE) {
                initialBoard[y][x] = null;
            }
        }
    }

    // Follow the main branch (first-child chain). Variations are ignored for this basic loader.
    let node: SgfNode | null = root;
    while (node) {
        const b = node.props['B']?.[0];
        const w = node.props['W']?.[0];
        if (typeof b === 'string') {
            const { x, y } = sgfCoordToXy(b);
            moves.push({ x, y, player: 'black' });
        } else if (typeof w === 'string') {
            const { x, y } = sgfCoordToXy(w);
            moves.push({ x, y, player: 'white' });
        }
        node = node.children[0] ?? null;
    }

    return { moves, initialBoard, komi, tree: root };
};
