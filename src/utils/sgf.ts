import type { CandidateMove, GameNode, GameState, BoardState, Player } from "../types";
import { BOARD_SIZE } from "../types";
import { encodeKaTrainKtFromAnalysis, KATRAIN_ANALYSIS_FORMAT_VERSION } from './katrainSgfAnalysis';

// KaTrain convention: auto-generated SGF comments are marked so user notes remain editable.
export const KATRAIN_SGF_INTERNAL_COMMENTS_MARKER = "\u3164\u200b";
export const KATRAIN_SGF_SEPARATOR_MARKER = "\u3164\u3164";

const stripNewlines = (value: string): string => value.replace(/^\n+/, '').replace(/\n+$/, '');

export function extractKaTrainUserNoteFromSgfComment(values: string[] | undefined): string {
    const comments: string[] = [];
    for (const v of values ?? []) {
        for (const c of v.split(KATRAIN_SGF_SEPARATOR_MARKER)) {
            if (!c.trim()) continue;
            if (c.includes(KATRAIN_SGF_INTERNAL_COMMENTS_MARKER)) continue;
            comments.push(c);
        }
    }
    return comments.join('').trim();
}

export function buildKaTrainSgfComment(opts: { note?: string; internalSegments?: string[] }): string | null {
    const note = (opts.note ?? '').trim();
    const segments: string[] = [];
    if (note) segments.push(`${note}\n`); // user note at top
    for (const seg of opts.internalSegments ?? []) {
        if (seg.trim()) segments.push(seg);
    }
    if (segments.length === 0) return null;
    return stripNewlines(segments.join(KATRAIN_SGF_SEPARATOR_MARKER));
}

export type KaTrainSgfExportTrainerConfig = {
    evalThresholds: number[];
    saveFeedback: boolean[];
    saveCommentsPlayer: Record<Player, boolean>;
    saveAnalysis: boolean;
    saveMarks: boolean;
};

export type KaTrainSgfExportOptions = {
    trainer?: Partial<KaTrainSgfExportTrainerConfig>;
};

const DEFAULT_TRAINER_CONFIG: KaTrainSgfExportTrainerConfig = {
    evalThresholds: [12, 6, 3, 1.5, 0.5, 0],
    saveFeedback: [true, true, true, true, false, false],
    saveCommentsPlayer: { black: true, white: true },
    saveAnalysis: false,
    saveMarks: false,
};

function normalizeTrainerConfig(opts: KaTrainSgfExportOptions | undefined): KaTrainSgfExportTrainerConfig {
    const t = opts?.trainer;
    return {
        evalThresholds: t?.evalThresholds?.length ? t.evalThresholds : DEFAULT_TRAINER_CONFIG.evalThresholds,
        saveFeedback: t?.saveFeedback?.length ? t.saveFeedback : DEFAULT_TRAINER_CONFIG.saveFeedback,
        saveCommentsPlayer: t?.saveCommentsPlayer ?? DEFAULT_TRAINER_CONFIG.saveCommentsPlayer,
        saveAnalysis: typeof t?.saveAnalysis === 'boolean' ? t.saveAnalysis : DEFAULT_TRAINER_CONFIG.saveAnalysis,
        saveMarks: typeof t?.saveMarks === 'boolean' ? t.saveMarks : DEFAULT_TRAINER_CONFIG.saveMarks,
    };
}

function playerToSgfShort(player: Player): 'B' | 'W' {
    return player === 'black' ? 'B' : 'W';
}

function xyToGtp(x: number, y: number): string {
    if (x < 0 || y < 0) return 'pass';
    const col = x >= 8 ? x + 1 : x; // Skip 'I'
    const letter = String.fromCharCode(65 + col);
    return `${letter}${BOARD_SIZE - y}`;
}

function formatScoreLead(scoreLead: number): string {
    const lead = scoreLead >= 0 ? 'B' : 'W';
    return `${lead}+${Math.abs(scoreLead).toFixed(1)}`;
}

function formatWinrate(winrateBlack: number): string {
    const lead = winrateBlack > 0.5 ? 'B' : 'W';
    const pct = Math.max(winrateBlack, 1 - winrateBlack) * 100;
    return `${lead} ${pct.toFixed(1)}%`;
}

function bestMoveFromCandidates(moves: CandidateMove[] | undefined): CandidateMove | null {
    if (!moves || moves.length === 0) return null;
    return moves.find((m) => m.order === 0) ?? moves[0] ?? null;
}

function evaluationClass(pointsLost: number, thresholds: number[]): number {
    let i = 0;
    while (i < thresholds.length - 1 && pointsLost < thresholds[i]!) i++;
    return Math.max(0, Math.min(i, thresholds.length - 1));
}

function computePointsLost(node: GameNode): number | null {
    const move = node.move;
    const parent = node.parent;
    if (!move || !parent) return null;

    const parentScore = parent.analysis?.rootScoreLead;
    const childScore = node.analysis?.rootScoreLead;
    if (typeof parentScore === 'number' && typeof childScore === 'number') {
        const sign = move.player === 'black' ? 1 : -1;
        return sign * (parentScore - childScore);
    }

    const candidate = parent.analysis?.moves.find((m) => m.x === move.x && m.y === move.y);
    return typeof candidate?.pointsLost === 'number' ? candidate.pointsLost : null;
}

function policyStats(args: { policy: number[]; move: { x: number; y: number } }): { rank: number; prob: number; bestMove: string; bestProb: number } | null {
    const policy = args.policy;
    const move = args.move;
    const idx = move.x < 0 || move.y < 0 ? BOARD_SIZE * BOARD_SIZE : move.y * BOARD_SIZE + move.x;
    const prob = policy[idx] ?? -1;
    if (!(prob > 0)) return null;

    let bestProb = -1;
    let bestIndex = -1;
    let betterCount = 0;
    for (let i = 0; i < BOARD_SIZE * BOARD_SIZE + 1; i++) {
        const p = policy[i] ?? -1;
        if (!(p > 0)) continue;
        if (p > bestProb) {
            bestProb = p;
            bestIndex = i;
        }
        if (p > prob) betterCount++;
    }
    if (!(bestProb > 0) || bestIndex < 0) return null;
    const bestMove = bestIndex === BOARD_SIZE * BOARD_SIZE ? 'pass' : xyToGtp(bestIndex % BOARD_SIZE, Math.floor(bestIndex / BOARD_SIZE));
    return { rank: betterCount + 1, prob, bestMove, bestProb };
}

function buildKaTrainAutoCommentSegment(args: { node: GameNode; trainer: KaTrainSgfExportTrainerConfig }): string | null {
    const node = args.node;
    const parent = node.parent;
    const move = node.move;
    if (!parent || !move) return null;

    const depth = node.gameState.moveHistory.length;
    const player = playerToSgfShort(move.player);
    const moveGtp = xyToGtp(move.x, move.y);

    if (!node.analysis) return 'Analyzing move...';

    let text = `Move ${depth}: ${player} ${moveGtp}\n`;
    text += `Score: ${formatScoreLead(node.analysis.rootScoreLead)}\n`;
    text += `Win rate: ${formatWinrate(node.analysis.rootWinRate)}\n`;

    const topMove = bestMoveFromCandidates(parent.analysis?.moves);
    if (topMove) {
        const topMoveGtp = xyToGtp(topMove.x, topMove.y);
        if (topMoveGtp !== moveGtp) {
            const pointsLost = computePointsLost(node);
            if (typeof pointsLost === 'number' && pointsLost > 0.5) text += `Estimated point loss: ${pointsLost.toFixed(1)}\n`;
            text += `Predicted top move was ${topMoveGtp} (${formatScoreLead(topMove.scoreLead)}).\n`;
        } else {
            text += 'Move was predicted best move\n';
        }
        if (topMove.pv && topMove.pv.length > 0) {
            text += `PV: ${player}${topMove.pv.join(' ')}\n`;
        }
    }

    const parentPolicy = parent.analysis?.policy;
    if (parentPolicy && parentPolicy.length >= BOARD_SIZE * BOARD_SIZE + 1) {
        const stats = policyStats({ policy: parentPolicy, move });
        if (stats) {
            text += `Move was #${stats.rank} according to policy  (${(stats.prob * 100).toFixed(2)}%).\n`;
            if (stats.rank !== 1) text += `Top policy move was ${stats.bestMove} (${(stats.bestProb * 100).toFixed(1)}%).\n`;
        }
    }

    if (node.aiThoughts) text += `\n\nAI thought process: ${node.aiThoughts}`;
    return text.trimEnd();
}

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

function serializeMoveNode(node: GameNode, trainer: KaTrainSgfExportTrainerConfig): string {
    const move = node.move;
    if (!move) return '';

    const props = cloneProps(node.properties);
    delete props.B;
    delete props.W;
    delete props.C;
    // KT analysis caching (KaTrain trainer/save_analysis)
    // When disabled, we still export user notes and move tree without embedding full analysis blobs.
    if (trainer.saveAnalysis && node.analysis) props.KT = encodeKaTrainKtFromAnalysis({ analysis: node.analysis });

    const key = move.player === 'black' ? 'B' : 'W';
    const coord = move.x < 0 || move.y < 0 ? '' : coordinateToSgf(move.x, move.y);
    props[key] = [coord];

    const noteTrim = (node.note ?? '').trim();

    let internalSegments: string[] | undefined;
    const parent = node.parent;
    if (parent?.analysis && node.analysis) {
        const pointsLost = computePointsLost(node);
        const cls = typeof pointsLost === 'number' ? evaluationClass(pointsLost, trainer.evalThresholds) : null;
        const showClass = cls === null ? false : !!trainer.saveFeedback?.[cls];
        const showPlayer = !!trainer.saveCommentsPlayer?.[move.player];
        const shouldSaveAutoComment = noteTrim.length > 0 || (showPlayer && showClass);
        if (shouldSaveAutoComment) {
            const autoComment = buildKaTrainAutoCommentSegment({ node, trainer });
            if (autoComment) {
                internalSegments = [`\n${autoComment}${KATRAIN_SGF_INTERNAL_COMMENTS_MARKER}`];
            }

            if (trainer.saveMarks && parent.analysis) {
                const top = bestMoveFromCandidates(parent.analysis.moves);
                if (top && top.x >= 0 && top.y >= 0 && !props.MA) props.MA = [coordinateToSgf(top.x, top.y)];
                if (!props.SQ) {
                    const bestSq = parent.analysis.moves
                        .filter((m) => m.order !== 0 && m.pointsLost <= 0.5 && m.x >= 0 && m.y >= 0)
                        .map((m) => coordinateToSgf(m.x, m.y));
                    if (bestSq.length > 0) props.SQ = bestSq;
                }
            }
        }
    }

    const c = buildKaTrainSgfComment({ note: node.note, internalSegments });
    if (c) props.C = [c];

    return `;${serializeProps(props)}`;
}

function serializeSequence(node: GameNode, trainer: KaTrainSgfExportTrainerConfig): string {
    let out = serializeMoveNode(node, trainer);
    if (!out) return '';

    const children = node.children;
    if (children.length === 0) return out;
    if (children.length === 1) return out + serializeSequence(children[0]!, trainer);

    for (const child of children) out += `(${serializeSequence(child, trainer)})`;
    return out;
}

export const generateSgfFromTree = (rootNode: GameNode, opts?: KaTrainSgfExportOptions): string => {
    const date = new Date().toISOString().split('T')[0];
    const trainer = normalizeTrainerConfig(opts);

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

    if (trainer.saveAnalysis && rootNode.analysis) props.KT = encodeKaTrainKtFromAnalysis({ analysis: rootNode.analysis });

    delete props.C;
    const rootSegments: string[] = [];
    if (trainer.saveMarks) {
        rootSegments.push(
            `Moves marked 'X' indicate the top move according to KataGo, those with a square are moves that lose less than 0.5 points${KATRAIN_SGF_INTERNAL_COMMENTS_MARKER}\n`
        );
    }
    rootSegments.push(`\nSGF generated by WebKatrain${KATRAIN_SGF_INTERNAL_COMMENTS_MARKER}\n`);
    const rootComment = buildKaTrainSgfComment({ note: rootNode.note, internalSegments: rootSegments });
    if (rootComment) props.C = [rootComment];

    let sgf = `(;${serializeProps(props)}`;

    const children = rootNode.children;
    if (children.length === 1) sgf += serializeSequence(children[0]!, trainer);
    else if (children.length > 1) {
        for (const child of children) sgf += `(${serializeSequence(child, trainer)})`;
    }

    sgf += ')';
    return sgf;
};

export const downloadSgfFromTree = (rootNode: GameNode, opts?: KaTrainSgfExportOptions) => {
    const sgfContent = generateSgfFromTree(rootNode, opts);
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
