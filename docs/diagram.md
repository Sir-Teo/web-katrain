# Architecture Diagrams

This document provides detailed ASCII flow diagrams explaining how web-katrain works.

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Browser (Main Thread)                        │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                     React UI Layer                             │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │ │
│  │  │  GoBoard │  │ MoveTree │  │  Graphs  │  │   Settings   │  │ │
│  │  │ (Canvas) │  │  (SVG)   │  │ (Charts) │  │   (Modal)    │  │ │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬───────┘  │ │
│  │       │             │             │               │           │ │
│  │       └─────────────┴─────────────┴───────────────┘           │ │
│  │                            │                                   │ │
│  └────────────────────────────┼───────────────────────────────────┘ │
│                               │                                     │
│  ┌────────────────────────────▼───────────────────────────────────┐ │
│  │              Zustand Store (gameStore.ts)                      │ │
│  │  ┌────────────┐  ┌──────────────┐  ┌─────────────────────┐   │ │
│  │  │ Game State │  │ Move History │  │   Analysis State    │   │ │
│  │  │  • board   │  │  • tree      │  │   • results         │   │ │
│  │  │  • turn    │  │  • current   │  │   • isAnalyzing     │   │ │
│  │  │  • captures│  │  • variations│  │   • mode (cont/batch)│  │ │
│  │  └────────────┘  └──────────────┘  └─────────────────────┘   │ │
│  └────────────────────────────┬───────────────────────────────────┘ │
│                               │                                     │
│  ┌────────────────────────────▼───────────────────────────────────┐ │
│  │           KataGoEngineClient (Singleton)                       │ │
│  │  • postMessage(analyze request) ──────────────────────┐       │ │
│  │  • Promise<AnalysisResult> ◄──────────────────────────┼─┐     │ │
│  └───────────────────────────────────────────────────────┼─┼─────┘ │
│                                                           │ │       │
└───────────────────────────────────────────────────────────┼─┼───────┘
                                                            │ │
                    ════════════════════════════════════════╪═╪═══════
                                  Worker Boundary           │ │
                    ════════════════════════════════════════╪═╪═══════
                                                            │ │
┌───────────────────────────────────────────────────────────▼─▼───────┐
│                      Web Worker (Dedicated Thread)                  │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                  Worker Message Handler                        │ │
│  │  • Receives: { type: 'analyze', position, settings }          │ │
│  │  • Sends: { type: 'result', analysis: {...} }                 │ │
│  └────────────────────────┬───────────────────────────────────────┘ │
│                           │                                          │
│  ┌────────────────────────▼───────────────────────────────────────┐ │
│  │              MCTS Engine (analyzeMcts.ts)                      │ │
│  │  ┌──────────────┐    ┌──────────────┐    ┌─────────────────┐ │ │
│  │  │ Search Tree  │◄──►│  fastBoard   │◄──►│  NN Evaluator   │ │ │
│  │  │  (UCB1)      │    │ (Simulation) │    │  (modelV8.ts)   │ │ │
│  │  └──────────────┘    └──────────────┘    └────────┬────────┘ │ │
│  └───────────────────────────────────────────────────┼──────────┘ │
│                                                       │             │
│  ┌────────────────────────────────────────────────────▼──────────┐ │
│  │                  TensorFlow.js Runtime                         │ │
│  │  ┌──────────────────────────────────────────────────────────┐ │ │
│  │  │  Backend Selection (auto-detected):                      │ │ │
│  │  │                                                           │ │ │
│  │  │  1. WebGPU ────► GPU acceleration (fastest)              │ │ │
│  │  │        ↓ (if unavailable)                                │ │ │
│  │  │  2. WASM ──────► XNNPACK + threads (fast, needs COOP)    │ │ │
│  │  │        ↓ (if SharedArrayBuffer unavailable)              │ │ │
│  │  │  3. CPU ───────► JavaScript fallback (slowest)           │ │ │
│  │  │                                                           │ │ │
│  │  └──────────────────────────────────────────────────────────┘ │ │
│  │                                                                │ │
│  │  Model: 22-channel features ──► NN ──► policy + value + more  │ │
│  └────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

## User Play & Analysis Flow

```
User Action                Game Store               Engine Worker
────────────────────────────────────────────────────────────────────

  User clicks              playMove(x, y)
  board at (x,y) ────────► │
                           ├─► Validate move
                           │   (gameLogic.ts)
                           │
                           ├─► Check captures,
                           │   ko, suicide
                           │
                           ├─► Update board state
                           │   [board, turn, captures]
                           │
                           ├─► Add to game tree
                           │   (new GameNode)
                           │
                           ├─► Trigger re-render
                           │   (React updates)
                           │
                           │   If analysis enabled:
                           │
                           ├─► engineClient        ────► analyze(position)
                           │   .analyze({...})            │
                           │                              ├─► Extract features
                           │                              │   (22 channels)
                           │                              │
                           │   (Main thread                ├─► Run NN forward
                           │    continues,                │   pass (TF.js)
                           │    board shows                │
                           │    move)                      ├─► Get policy/value
                           │                              │
                           │                              ├─► Run MCTS search
                           │                              │   (N visits)
                           │                              │
                           │   Promise resolves    ◄────  └─► Return analysis
  Board updates   ◄────────┤   with AnalysisResult            {policy, winrate,
  with analysis            │   {                               ownership, ...}
  results:                 │     moveInfos: [...],
  • Best moves             │     rootInfo: {...},
  • Win rate               │     ownership: [...],
  • Territory              │   }
  • Policy hints           │
                           └─► Store analysis in
                               current node

                               Trigger re-render
                               with analysis data

  User sees:
  • Move hints (circles)
  • Winrate (%)
  • Score estimate
  • Territory map
  • PV (variation)
```

## Game Tree Navigation

```
                      Game Tree Structure

        ┌─────────────────────────────────────────┐
        │          Root (empty board)             │
        │   node.moves = []                       │
        │   node.children = [move1, move2, ...]   │
        └──────┬────────────────────┬──────────────┘
               │                    │
       ┌───────▼────────┐   ┌───────▼────────┐
       │  Black B4      │   │  Black D4      │  ◄── Variations
       │  node.move =   │   │  (alt opening)  │      (different
       │    {x:1, y:3}  │   └─────────────────┘      first moves)
       │  node.analysis │
       │  node.children │
       └───────┬────────┘
               │
       ┌───────▼────────┐
       │  White D16     │
       │  node.parent ──┼──► points back up
       └───────┬────────┘
               │
       ┌───────▼────────┐
       │  Black Q16     │ ◄── currentNode (where user is)
       │  node.children │
       └────────────────┘

Navigation Flow:

  User Action         Store Updates              UI Renders
  ────────────────────────────────────────────────────────────

  Press ► (next)      goToNextNode()              Board shows
  ────────────────►   │                           next position
                      ├─► currentNode =           │
                      │   currentNode.children[0] │
                      │                           │
                      └─► Rebuild board state     │
                          from root to current ───┘
                          (replay all moves)

  Press ◄ (prev)      goToPreviousNode()          Board shows
  ────────────────►   │                           previous
                      ├─► currentNode =           position
                      │   currentNode.parent      │
                      │                           │
                      └─► Rebuild board state ────┘

  Click tree node     goToNode(node)              Board shows
  ────────────────►   │                           that position
                      ├─► currentNode = node      │
                      │                           │
                      └─► Rebuild board state ────┘

  Navigate to var.    Follow different child      Shows alternate
  ────────────────►   in children[] array         line of play
```

## Model Loading & Backend Selection

```
App Initialization
       │
       ├─► Create Web Worker
       │   (katago.worker.ts)
       │
       ├─► Worker: Load TF.js
       │   import '@tensorflow/tfjs'
       │
       └─► Worker: Initialize

┌──────────────────────────────────────────────────────────────┐
│              Backend Detection & Selection                   │
└──────────────────────────────────────────────────────────────┘

    Try WebGPU Backend
    ─────────────────────────────────────────────────
    │
    ├─► tf.setBackend('webgpu')
    │
    ├─► Check: GPU available?
    │          WebGPU API supported?
    │
    ├─► Success? ──────────────────────► Use WebGPU ✓
    │                                     (Fastest: ~10ms/eval)
    │
    └─► Failed?
        │
        Try WASM Backend
        ─────────────────────────────────────────────
        │
        ├─► tf.setBackend('wasm')
        │
        ├─► Check: SharedArrayBuffer available?
        │          (requires COOP/COEP headers)
        │
        ├─► Success? ──────────────────► Use WASM + XNNPACK ✓
        │                                 Threaded if SAB available
        │                                 (Fast: ~50-100ms/eval)
        │
        └─► Failed or SAB unavailable?
            │
            CPU Backend (Fallback)
            ─────────────────────────────────────────
            │
            ├─► tf.setBackend('cpu')
            │
            └─► Use JavaScript ────────► CPU-only mode ✓
                                         (Slow: ~500ms+/eval)

┌──────────────────────────────────────────────────────────────┐
│                    Model Loading Flow                        │
└──────────────────────────────────────────────────────────────┘

    Settings Determine Model Source
    ────────────────────────────────
    │
    ├─► Default: public/models/kata1-b6c96-s1273261824-d576593463.bin.gz
    ├─► Custom URL: User-provided HTTP(S) URL
    └─► Upload: File from user's computer (stored in memory)

    Load Model
    ──────────
    │
    ├─► Fetch gzipped binary
    │   (40-300MB depending on size)
    │
    ├─► Decompress (pako.ungzip)
    │
    ├─► Parse binary format
    │   (loadModelV8.ts)
    │   │
    │   ├─► Read header
    │   ├─► Extract layer weights
    │   └─► Build tf.LayersModel
    │
    ├─► Warmup inference
    │   (run dummy position)
    │
    └─► Ready for analysis ✓

    Model inputs:  22 channels × 19×19
                   [black stones, white stones, turns since,
                    ladder features, liberties, ko, ...]

    Model outputs: • Policy (362 moves: 19×19 + pass)
                   • Value (winrate)
                   • ScoreMean (expected score)
                   • Ownership (19×19 territory prediction)
                   • Lead (score distribution parameters)
```

## AI Move Selection Flow

```
User Enables "AI Plays Black"
       │
       ├─► Store: aiBlack = true
       │
       └─► After each White move...

┌──────────────────────────────────────────────────────────────┐
│                   AI Move Selection Process                  │
└──────────────────────────────────────────────────────────────┘

    gameStore.aiAutoPlay()
    ──────────────────────
       │
       ├─► Request analysis
       │   engineClient.analyze(currentPosition)
       │
       ├─► Get AnalysisResult
       │   {
       │     moveInfos: [
       │       {move: 'Q16', winrate: 0.52, ...},
       │       {move: 'D4',  winrate: 0.51, ...},
       │       ...
       │     ],
       │     ...
       │   }
       │
       └─► Select move by strategy:

           ┌────────────────────────────────────────┐
           │      AI Strategy Algorithms            │
           ├────────────────────────────────────────┤
           │                                        │
           │ • default                              │
           │   ──► Play top move                    │
           │                                        │
           │ • calibrated                           │
           │   ──► Weighted by visit counts         │
           │       (temperature sampling)           │
           │                                        │
           │ • rank                                 │
           │   ──► Target specific rank strength    │
           │       (add score handicap)             │
           │                                        │
           │ • simple                               │
           │   ──► Pick from top-N randomly         │
           │                                        │
           │ • policy                               │
           │   ──► Sample from policy distribution  │
           │                                        │
           │ • local                                │
           │   ──► Prefer moves near last move      │
           │                                        │
           │ • tenuki                               │
           │   ──► Prefer moves far from last move  │
           │                                        │
           │ • weighted                             │
           │   ──► Weighted by score intervals      │
           │                                        │
           └────────────────────────────────────────┘
                          │
                          ▼
           Selected Move (e.g., 'Q4')
                          │
                          ▼
           playMove(x, y)
                          │
                          └─► Update game state
                              Add to tree
                              Trigger render

                              If teaching mode enabled:
                              ├─► Check if move quality < threshold
                              └─► Auto-undo if too weak

    User sees AI's move on board
```
