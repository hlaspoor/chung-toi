import "./styles.css";

const boardEl = document.getElementById("board");
const cellLayerEl = document.getElementById("cellLayer");
const headlineEl = document.getElementById("headline");
const sublineEl = document.getElementById("subline");
const rotateBtn = document.getElementById("rotateBtn");
const doneBtn = document.getElementById("doneBtn");
const playFirstBtn = document.getElementById("playFirstBtn");
const playSecondBtn = document.getElementById("playSecondBtn");
const solutionHeadlineEl = document.getElementById("solutionHeadline");
const solutionBestEl = document.getElementById("solutionBest");
const solutionDetailEl = document.getElementById("solutionDetail");
const solutionChoicesTitleEl = document.getElementById("solutionChoicesTitle");
const solutionTableEl = document.getElementById("solutionTable");

const PLAYERS = [
  { id: 0, name: "White", className: "white" },
  { id: 1, name: "Sage", className: "red" }
];
const WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6]
];
const ORTHOGONAL = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAGONAL = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const CELL_NAMES = ["top-left", "top", "top-right", "left", "center", "right", "bottom-left", "bottom", "bottom-right"];
const CELL_COORDS = ["a3", "b3", "c3", "a2", "b2", "c2", "a1", "b1", "c1"];
const SAFE_AI_OPENING_DIRECTIONS = [
  ["O", "D"], ["D"], ["O", "D"],
  ["D"], ["O", "D"], ["D"],
  ["O", "D"], ["D"], ["O", "D"]
];
const UI_TUNING_MODE = false;

let state = freshState();
let aiThinking = false;
let tablebaseReady = UI_TUNING_MODE || Boolean(window.CHUNG_TOI_TABLEBASE);
let inputReadyAt = 0;
let statusMessage = "";
const rotationAnimations = new Map();
const placementAnimations = new Set();
const movementAnimations = new Map();
let humanPlayer = 0;
let aiPlayer = 1;
let gameToken = 0;
let tablebase = null;

function rulePiece(player = "white", direction = "O") {
  const directionClass = direction === "D" ? "diagonal" : "";
  const playerClass = player === "red" ? "red" : "";
  return `
    <i class="rule-piece ${playerClass} ${directionClass}">
      <svg viewBox="0 0 100 100" focusable="false">
        <g class="rule-piece-face">
          <path d="M34 5 H66 Q70 5 73 8 L92 27 Q95 30 95 34 V66 Q95 70 92 73 L73 92 Q70 95 66 95 H34 Q30 95 27 92 L8 73 Q5 70 5 66 V34 Q5 30 8 27 L27 8 Q30 5 34 5 Z"
            fill="var(--piece-fill)"
            stroke="var(--piece-stroke, #222)"
            stroke-width="5.8"
            stroke-linejoin="round"/>
          <g class="piece-mark" opacity=".84">
            <g stroke="var(--piece-mark)" stroke-width="4" stroke-linecap="round">
              <line x1="34" y1="50" x2="66" y2="50"/>
              <line x1="50" y1="34" x2="50" y2="66"/>
            </g>
            <g fill="var(--piece-mark)">
              <path d="M15 50 Q15 48.8 16.4 48.2 L32.6 43.9 Q35 43.2 35 45.5 V54.5 Q35 56.8 32.6 56.1 L16.4 51.8 Q15 51.2 15 50 Z"/>
              <path d="M85 50 Q85 48.8 83.6 48.2 L67.4 43.9 Q65 43.2 65 45.5 V54.5 Q65 56.8 67.4 56.1 L83.6 51.8 Q85 51.2 85 50 Z"/>
              <path d="M50 15 Q48.8 15 48.2 16.4 L43.9 32.6 Q43.2 35 45.5 35 H54.5 Q56.8 35 56.1 32.6 L51.8 16.4 Q51.2 15 50 15 Z"/>
              <path d="M50 85 Q48.8 85 48.2 83.6 L43.9 67.4 Q43.2 65 45.5 65 H54.5 Q56.8 65 56.1 67.4 L51.8 83.6 Q51.2 85 50 85 Z"/>
            </g>
          </g>
        </g>
      </svg>
    </i>`;
}

function renderRuleBoard(name, pieces, options = {}) {
  const board = document.querySelector(`[data-rule-board="${name}"]`);
  if (!board) return;
  const cells = [...board.querySelectorAll("span")];
  cells.forEach((cell, index) => {
    const classes = [];
    if (options.targets?.includes(index)) classes.push("rule-target");
    if (options.winning?.includes(index)) classes.push("rule-win");
    cell.className = classes.join(" ");
    cell.innerHTML = pieces[index] || "";
  });
  for (const [motionIndex, motion] of (options.motions || []).entries()) {
    if (motion.edge === "top" || motion.edge === "top-long") {
      const edgeClass = motion.edge === "top-long" ? " long" : "";
      board.insertAdjacentHTML("beforeend", `<i class="rule-edge-arrow${edgeClass}" aria-hidden="true"></i>`);
      continue;
    }
    if (motion.edge === "center-to-bottom-left") {
      const markerId = `rule-board-arrowhead-${name}-${motionIndex}`;
      board.insertAdjacentHTML("beforeend", `
        <svg class="rule-board-arrow" viewBox="0 0 148 148" preserveAspectRatio="none" focusable="false" aria-hidden="true">
          <defs>
            <marker id="${markerId}" markerWidth="20" markerHeight="16" refX="4" refY="8" orient="auto" markerUnits="userSpaceOnUse">
              <path d="M4 3 L16 8 L4 13 Z"></path>
            </marker>
          </defs>
          <path d="M66.6 81.4 L49.333 98.667" marker-end="url(#${markerId})"></path>
        </svg>`);
      continue;
    }
    if (motion.edge === "left-curve" || motion.edge === "left-curve-tail" || motion.edge === "same-cell-curve") {
      const isTailCurve = motion.edge === "left-curve-tail";
      const isSameCellCurve = motion.edge === "same-cell-curve";
      const curveClass = isTailCurve ? " tail" : isSameCellCurve ? " same-cell" : "";
      const viewBox = isTailCurve ? "0 0 36 120" : isSameCellCurve ? "0 0 44 44" : "0 0 24 118";
      const markerId = `rule-curve-arrowhead-${name}-${motionIndex}`;
      const arrowheadTilt = isTailCurve ? "rotate(-8 4 8)" : isSameCellCurve ? "rotate(-4 4 8)" : "rotate(-6 4 8)";
      const curvePath = isTailCurve
        ? "M31 5 C9 20 5 45 19 57 C31 67 32 48 19 52 C4 57 5 82 25 104"
        : isSameCellCurve
          ? "M8 26 C8 36 17 41 27 39 C39 36 43 22 36 13 C31 7 24 5 18 8"
          : "M20 5 C4 36 4 72 15 102";
      board.insertAdjacentHTML("beforeend", `
        <svg class="rule-side-curve${curveClass}" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet" focusable="false" aria-hidden="true">
          <defs>
            <marker id="${markerId}" markerWidth="20" markerHeight="16" refX="4" refY="8" orient="auto" markerUnits="userSpaceOnUse">
              <path d="M4 3 L16 8 L4 13 Z" transform="${arrowheadTilt}"></path>
            </marker>
          </defs>
          <path d="${curvePath}" marker-end="url(#${markerId})"></path>
        </svg>`);
      continue;
    }
    board.insertAdjacentHTML("beforeend", `<i class="rule-motion ${motion.className}">${motion.label}</i>`);
  }
  if (options.line) {
    board.insertAdjacentHTML("beforeend", `<i class="rule-line ${options.line}"></i>`);
  }
}

function renderRuleBoards() {
  renderRuleBoard("setup", {
    0: rulePiece("white", "O"),
    3: rulePiece("white", "D"),
    5: rulePiece("white", "D"),
    4: rulePiece("red", "D"),
    7: rulePiece("red", "O"),
    8: rulePiece("red", "O")
  });
  renderRuleBoard("move-one", {
    1: rulePiece("white", "O"),
    3: rulePiece("white", "D"),
    4: rulePiece("red", "D"),
    5: rulePiece("white", "D"),
    7: rulePiece("red", "O"),
    8: rulePiece("red", "O")
  }, { targets: [0], motions: [{ edge: "top" }] });
  renderRuleBoard("move-two", {
    2: rulePiece("white", "O"),
    3: rulePiece("white", "D"),
    4: rulePiece("red", "D"),
    5: rulePiece("white", "D"),
    7: rulePiece("red", "O"),
    8: rulePiece("red", "O")
  }, { targets: [0], motions: [{ edge: "top-long" }] });
  renderRuleBoard("jump", {
    3: rulePiece("white", "D"),
    4: rulePiece("red", "D"),
    5: rulePiece("white", "D"),
    6: rulePiece("white", "O"),
    7: rulePiece("red", "O"),
    8: rulePiece("red", "O")
  }, { targets: [0], motions: [{ edge: "left-curve" }] });
  renderRuleBoard("change-direction", {
    3: rulePiece("white", "D"),
    4: rulePiece("red", "D"),
    5: rulePiece("white", "D"),
    6: rulePiece("white", "D"),
    7: rulePiece("red", "O"),
    8: rulePiece("red", "O")
  }, { targets: [0], motions: [{ edge: "left-curve-tail" }] });
  renderRuleBoard("twist", {
    0: rulePiece("white", "D"),
    3: rulePiece("white", "D"),
    4: rulePiece("red", "D"),
    5: rulePiece("white", "D"),
    7: rulePiece("red", "O"),
    8: rulePiece("red", "O")
  }, { targets: [0], motions: [{ edge: "same-cell-curve" }] });
  renderRuleBoard("pass", {
    0: rulePiece("white", "O"),
    3: rulePiece("white", "D"),
    4: rulePiece("red", "D"),
    5: rulePiece("white", "D"),
    7: rulePiece("red", "O"),
    8: rulePiece("red", "O")
  }, { motions: [{ edge: "same-cell-curve" }] });
  renderRuleBoard("final-win", {
    0: rulePiece("white", "O"),
    3: rulePiece("white", "D"),
    5: rulePiece("white", "D"),
    6: rulePiece("red", "D"),
    7: rulePiece("red", "O"),
    8: rulePiece("red", "O")
  }, { targets: [4], winning: [6, 7, 8], motions: [{ edge: "center-to-bottom-left" }] });
}

function freshState() {
  return {
    board: Array(9).fill(null),
    turn: 0,
    selected: null,
    pending: null,
    phase: "place",
    left: [3, 3],
    winner: null,
    winningLine: null
  };
}

function startNewGame(nextHumanPlayer) {
  humanPlayer = nextHumanPlayer;
  aiPlayer = 1 - humanPlayer;
  state = freshState();
  aiThinking = false;
  statusMessage = "";
  gameToken += 1;
  rotationAnimations.clear();
  placementAnimations.clear();
  movementAnimations.clear();
  render();
  maybeRunAi();
}

function cloneBoard(board) {
  return board.map(piece => piece ? { ...piece } : null);
}

function solverStateFromUi() {
  return {
    board: cloneBoard(state.board),
    turn: state.turn,
    phase: state.phase,
    left: [...state.left]
  };
}

function solutionStateFromUi() {
  const game = solverStateFromUi();
  const pending = state.pending;
  if (!pending) return game;

  if (pending.type === "place") {
    game.board[pending.index] = null;
    game.left[game.turn] += 1;
  } else if (pending.type === "move") {
    game.board[pending.from] = { ...pending.originalPiece };
    game.board[pending.to] = null;
  } else if (pending.type === "rotate") {
    game.board[pending.index] = { ...pending.originalPiece };
  }
  if (game.left[0] > 0 || game.left[1] > 0) game.phase = "place";
  return game;
}

function isAiTurn() {
  if (UI_TUNING_MODE) return false;
  return state.turn === aiPlayer && state.winner === null;
}

function isBusy() {
  return !tablebaseReady || performance.now() < inputReadyAt || aiThinking || isAiTurn();
}

function rowCol(index) {
  return [Math.floor(index / 3), index % 3];
}

function indexOf(row, col) {
  return row * 3 + col;
}

function directionLabel(direction) {
  return direction === "O" ? "orthogonal" : "diagonal";
}

function currentPlayer() {
  return PLAYERS[state.turn];
}

function findWinOnBoard(board, player) {
  return WIN_LINES.find(line =>
    line.every(index => board[index]?.player === player)
  ) || null;
}

function findWin(player) {
  return findWinOnBoard(state.board, player);
}

function nextTurn() {
  state.selected = null;
  state.pending = null;
  state.turn = 1 - state.turn;
  if (state.left[0] === 0 && state.left[1] === 0) {
    state.phase = "move";
  }
}

function beginPending(pending) {
  const index = pending.to ?? pending.index;
  state.selected = index;
  state.pending = pending;
  render();
}

function togglePieceDirection(index) {
  const piece = state.board[index];
  if (!piece || piece.player !== state.turn) return;
  const nextDirection = piece.direction === "O" ? "D" : "O";
  rotationAnimations.set(index, nextDirection === "D" ? "rotate-to-diagonal" : "rotate-to-orthogonal");
  piece.direction = nextDirection;
}

function queueRotationAnimations(beforeBoard, afterBoard) {
  beforeBoard.forEach((beforePiece, index) => {
    const afterPiece = afterBoard[index];
    if (!beforePiece || !afterPiece) return;
    if (beforePiece.player !== afterPiece.player || beforePiece.direction === afterPiece.direction) return;
    rotationAnimations.set(index, afterPiece.direction === "D" ? "rotate-to-diagonal" : "rotate-to-orthogonal");
  });
}

function queuePlacementAnimations(beforeBoard, afterBoard) {
  afterBoard.forEach((afterPiece, index) => {
    if (!afterPiece || beforeBoard[index]) return;
    placementAnimations.add(index);
  });
}

function queueMovementAnimation(from, to) {
  if (from === to) return;
  movementAnimations.set(to, { from });
}

function queueMovementAnimations(beforeBoard, afterBoard) {
  const removed = [];
  const added = [];
  beforeBoard.forEach((beforePiece, index) => {
    const afterPiece = afterBoard[index];
    if (beforePiece && !afterPiece) removed.push({ index, piece: beforePiece });
    if (!beforePiece && afterPiece) added.push({ index, piece: afterPiece });
  });
  if (removed.length !== 1 || added.length !== 1) return;
  if (removed[0].piece.player !== added[0].piece.player) return;
  queueMovementAnimation(removed[0].index, added[0].index);
}

function placePiece(index) {
  if (isBusy()) return;
  if (state.board[index] || state.left[state.turn] === 0) return reject("That square is not available.");
  state.board[index] = { player: state.turn, direction: "O" };
  placementAnimations.add(index);
  state.left[state.turn] -= 1;
  if (findWin(state.turn)) {
    finishAction();
  } else {
    beginPending({ type: "place", index });
  }
}

function rotatePending() {
  if (!state.pending || state.winner !== null || isBusy()) return;
  togglePieceDirection(state.pending.to ?? state.pending.index);
  render();
}

function canRotateAction() {
  if (state.winner !== null || isBusy()) return false;
  if (state.pending) return state.pending.type === "place" || state.pending.type === "move" || state.pending.type === "rotate";
  return state.phase === "move" && state.selected !== null;
}

function rotateAction() {
  if (!canRotateAction()) return;
  if (state.pending) {
    rotatePending();
    return;
  }
  const piece = state.board[state.selected];
  if (!piece || piece.player !== state.turn) return;
  const originalPiece = { ...piece };
  togglePieceDirection(state.selected);
  beginPending({ type: "rotate", index: state.selected, originalPiece });
}

function cancelPending() {
  if (!state.pending || state.winner !== null || isBusy()) return;
  const pending = state.pending;
  if (pending.type === "place") {
    state.board[pending.index] = null;
    state.left[state.turn] += 1;
    state.selected = null;
  } else if (pending.type === "move") {
    state.board[pending.from] = pending.originalPiece;
    state.board[pending.to] = null;
    state.selected = pending.from;
  } else if (pending.type === "rotate") {
    state.board[pending.index] = pending.originalPiece;
    state.selected = pending.index;
  }
  state.pending = null;
  statusMessage = "";
  render();
}

function cancelSelection() {
  if (state.pending || state.selected === null || state.winner !== null || isBusy()) return;
  state.selected = null;
  statusMessage = "";
  render();
}

function cancelInteraction() {
  if (state.pending) cancelPending();
  else cancelSelection();
}

function updatePendingPlacement(index) {
  if (!state.pending || state.pending.type !== "place") return;
  const piece = state.board[state.pending.index];
  if (!piece || state.board[index]) return;
  state.board[state.pending.index] = null;
  state.board[index] = piece;
  placementAnimations.add(index);
  beginPending({ type: "place", index });
}

function updatePendingMove(to) {
  const pending = state.pending;
  if (!pending || pending.type !== "move") return;
  if (to === pending.to) {
    rotatePending();
    return;
  }
  const currentPiece = state.board[pending.to];
  state.board[pending.from] = pending.originalPiece;
  state.board[pending.to] = null;
  const targets = legalTargets(pending.from);
  if (!targets.includes(to)) {
    state.board[pending.from] = null;
    state.board[pending.to] = currentPiece;
    return reject("That square is not available for this move.");
  }
  state.board[to] = { ...currentPiece };
  state.board[pending.from] = null;
  queueMovementAnimation(pending.to, to);
  beginPending({ ...pending, to });
}

function switchSelectionFromPendingRotate(index) {
  const pending = state.pending;
  const piece = state.board[index];
  if (!pending || pending.type !== "rotate" || !piece || piece.player !== state.turn) return false;
  state.board[pending.index] = pending.originalPiece;
  state.pending = null;
  state.selected = index;
  statusMessage = "";
  render();
  return true;
}

function pendingLegalTargets() {
  if (!state.pending) return [];
  if (state.pending.type !== "move") return [];
  const pending = state.pending;
  const currentPiece = state.board[pending.to];
  state.board[pending.from] = pending.originalPiece;
  state.board[pending.to] = null;
  const targets = legalTargets(pending.from);
  state.board[pending.from] = null;
  state.board[pending.to] = currentPiece;
  return targets;
}

function legalTargets(from) {
  const piece = state.board[from];
  if (!piece || piece.player !== state.turn) return [];
  const [row, col] = rowCol(from);
  const vectors = piece.direction === "O" ? ORTHOGONAL : DIAGONAL;
  const targets = [];
  for (const [dr, dc] of vectors) {
    for (const distance of [1, 2]) {
      const nr = row + dr * distance;
      const nc = col + dc * distance;
      if (nr < 0 || nr > 2 || nc < 0 || nc > 2) continue;
      const target = indexOf(nr, nc);
      if (!state.board[target]) targets.push(target);
    }
  }
  return targets;
}

function keyOfGame(game) {
  let boardCode = 0;
  for (const piece of game.board) {
    const cellCode = piece ? 1 + piece.player * 2 + (piece.direction === "D" ? 1 : 0) : 0;
    boardCode = boardCode * 5 + cellCode;
  }
  return [
    game.phase === "place" ? "p" : "m",
    game.turn,
    game.left[0],
    game.left[1],
    boardCode.toString(36).padStart(5, "0")
  ].join("");
}

function switchedGame(game) {
  const next = {
    board: cloneBoard(game.board),
    turn: 1 - game.turn,
    phase: game.left[0] === 0 && game.left[1] === 0 ? "move" : game.phase,
    left: [...game.left]
  };
  return next;
}

function makeSolverAction(game, after, desc) {
  const line = findWinOnBoard(after.board, game.turn);
  if (line) {
    return { type: "W", desc, after, line };
  }
  return { type: "S", desc, after, next: switchedGame(after) };
}

function solverActions(game) {
  const actions = [];
  const player = game.turn;

  if (game.phase === "place") {
    for (let index = 0; index < 9; index += 1) {
      if (game.board[index]) continue;
      for (const direction of ["O", "D"]) {
        const after = {
          board: cloneBoard(game.board),
          turn: player,
          phase: "place",
          left: [...game.left]
        };
        after.board[index] = { player, direction };
        after.left[player] -= 1;
        if (after.left[0] === 0 && after.left[1] === 0) after.phase = "move";
        actions.push(makeSolverAction(
          game,
          after,
          `${CELL_NAMES[index]} ${directionLabel(direction)}`
        ));
      }
    }
    return actions;
  }

  for (let from = 0; from < 9; from += 1) {
    const piece = game.board[from];
    if (!piece || piece.player !== player) continue;
    const [row, col] = rowCol(from);
    const vectors = piece.direction === "O" ? ORTHOGONAL : DIAGONAL;
    for (const [dr, dc] of vectors) {
      for (const distance of [1, 2]) {
        const nr = row + dr * distance;
        const nc = col + dc * distance;
        if (nr < 0 || nr > 2 || nc < 0 || nc > 2) continue;
        const to = indexOf(nr, nc);
        if (game.board[to]) continue;
        for (const direction of ["O", "D"]) {
          const after = {
            board: cloneBoard(game.board),
            turn: player,
            phase: "move",
            left: [...game.left]
          };
          after.board[to] = { player, direction };
          after.board[from] = null;
          actions.push(makeSolverAction(
            game,
            after,
            `${CELL_NAMES[from]} → ${CELL_NAMES[to]} ${directionLabel(direction)}`
          ));
        }
      }
    }

    const after = {
      board: cloneBoard(game.board),
      turn: player,
      phase: "move",
      left: [...game.left]
    };
    after.board[from] = { player, direction: piece.direction === "O" ? "D" : "O" };
    actions.push(makeSolverAction(game, after, `rotate ${CELL_NAMES[from]}`));
  }

  return actions;
}

function buildTablebase() {
  const initial = {
    board: Array(9).fill(null),
    turn: 0,
    phase: "place",
    left: [3, 3]
  };
  const queue = [initial];
  const seen = new Map([[keyOfGame(initial), initial]]);
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    for (const action of solverActions(queue[cursor])) {
      if (action.type !== "S") continue;
      const key = keyOfGame(action.next);
      if (!seen.has(key)) {
        seen.set(key, action.next);
        queue.push(action.next);
      }
    }
  }

  const actionMap = new Map();
  for (const [key, game] of seen) {
    actionMap.set(key, solverActions(game).map(action => {
      if (action.type === "S") return { ...action, nextKey: keyOfGame(action.next) };
      return action;
    }));
  }

  const value = new Map();
  let changed = true;
  while (changed) {
    changed = false;
    for (const [key, actions] of actionMap) {
      if (value.has(key)) continue;
      const winningAction = actions.some(action =>
        action.type === "W" || (action.type === "S" && value.get(action.nextKey) === -1)
      );
      if (winningAction) {
        value.set(key, 1);
        changed = true;
        continue;
      }
      const forcedLoss = actions.length > 0 && actions.every(action =>
        action.type === "S" && value.get(action.nextKey) === 1
      );
      if (forcedLoss) {
        value.set(key, -1);
        changed = true;
      }
    }
  }
  for (const key of seen.keys()) {
    if (!value.has(key)) value.set(key, 0);
  }

  const dtm = new Map();
  changed = true;
  while (changed) {
    changed = false;
    for (const [key, actions] of actionMap) {
      if (dtm.has(key) || value.get(key) === 0) continue;
      if (value.get(key) === 1) {
        let best = Infinity;
        for (const action of actions) {
          if (action.type === "W") best = Math.min(best, 1);
          if (action.type === "S" && value.get(action.nextKey) === -1 && dtm.has(action.nextKey)) {
            best = Math.min(best, 1 + dtm.get(action.nextKey));
          }
        }
        if (best < Infinity) {
          dtm.set(key, best);
          changed = true;
        }
      } else {
        let worst = 0;
        let ready = actions.length > 0;
        for (const action of actions) {
          if (action.type !== "S" || value.get(action.nextKey) !== 1 || !dtm.has(action.nextKey)) {
            ready = false;
            break;
          }
          worst = Math.max(worst, 1 + dtm.get(action.nextKey));
        }
        if (ready) {
          dtm.set(key, worst);
          changed = true;
        }
      }
    }
  }

  const policy = new Map();
  for (const [key, game] of seen) {
    const actions = actionMap.get(key) || [];
    if (!actions.length) continue;
    policy.set(key, chooseBestActionFromActions(actions, value, dtm));
  }

  return { actionMap, value, dtm, policy };
}

function unpackTablebasePolicy(source) {
  if (Array.isArray(source.policy)) return new Map(source.policy);
  const packed = typeof source === "string" ? source : source.policyPacked;
  if (typeof packed !== "string") {
    throw new Error("Invalid tablebase-data.js");
  }
  if (/^[pm]/.test(packed) && packed.length % 10 === 0) return unpackLegacyPolicy(packed);
  return unpackPackedPolicy(packed);
}

function unpackLegacyPolicy(packed) {
  if (packed.length % 10 !== 0) throw new Error("Invalid tablebase-data.js");
  const policy = new Map();
  for (let offset = 0; offset < packed.length; offset += 10) {
    policy.set(packed.slice(offset, offset + 9), parseInt(packed[offset + 9], 36));
  }
  return policy;
}

function unpackPackedPolicy(packed) {
  const binary = atob(packed);
  const policy = new Map();
  let previousCode = 0;
  let value = 0;
  let shift = 1;
  for (let index = 0; index < binary.length; index += 1) {
    const byte = binary.charCodeAt(index);
    value += (byte & 127) * shift;
    if (byte & 128) {
      shift *= 128;
      continue;
    }
    const actionIndex = value & 15;
    previousCode += Math.floor(value / 16);
    policy.set(keyFromCode(previousCode), actionIndex);
    value = 0;
    shift = 1;
  }
  if (shift !== 1) throw new Error("Invalid tablebase-data.js");
  return policy;
}

function readPackedVarint(binary, cursor) {
  let value = 0;
  let shift = 1;
  let index = cursor;
  while (index < binary.length) {
    const byte = binary.charCodeAt(index);
    value += (byte & 127) * shift;
    index += 1;
    if (!(byte & 128)) return { value, cursor: index };
    shift *= 128;
  }
  throw new Error("Invalid tablebase-data.js");
}

function unpackTablebaseEvaluation(source) {
  if (Array.isArray(source.evaluation)) {
    return {
      value: new Map(source.evaluation.map(([key, outcome]) => [key, outcome])),
      dtm: new Map(source.dtm || [])
    };
  }
  const packed = typeof source === "object" ? source.evaluationPacked : null;
  if (typeof packed !== "string") {
    return { value: new Map(), dtm: new Map() };
  }
  const binary = atob(packed);
  const value = new Map();
  const dtm = new Map();
  let previousCode = 0;
  let cursor = 0;
  while (cursor < binary.length) {
    const delta = readPackedVarint(binary, cursor);
    cursor = delta.cursor;
    const info = readPackedVarint(binary, cursor);
    cursor = info.cursor;
    previousCode += delta.value;
    const key = keyFromCode(previousCode);
    const outcome = (info.value % 3) - 1;
    const distance = Math.floor(info.value / 3);
    value.set(key, outcome);
    if (distance > 0) dtm.set(key, distance);
  }
  return { value, dtm };
}

function keyFromCode(code) {
  const boardCode = code % 1953125;
  let rest = Math.floor(code / 1953125);
  const left1 = rest % 4;
  rest = Math.floor(rest / 4);
  const left0 = rest % 4;
  rest = Math.floor(rest / 4);
  const turn = rest % 2;
  const phase = Math.floor(rest / 2) ? "m" : "p";
  return phase + turn + left0 + left1 + boardCode.toString(36).padStart(5, "0");
}

function getTablebase() {
  if (!tablebase) {
    if (!self.CHUNG_TOI_TABLEBASE) {
      throw new Error("Missing tablebase-data.js");
    }
    tablebase = {
      policy: unpackTablebasePolicy(self.CHUNG_TOI_TABLEBASE)
    };
  }
  return tablebase;
}

function ensureTablebaseEvaluation() {
  const loaded = getTablebase();
  if (!loaded.value || !loaded.dtm) {
    const evaluation = unpackTablebaseEvaluation(self.CHUNG_TOI_TABLEBASE);
    loaded.value = evaluation.value;
    loaded.dtm = evaluation.dtm;
  }
  return loaded;
}

function warmTablebase() {
  if (UI_TUNING_MODE) {
    tablebaseReady = true;
    inputReadyAt = 0;
    render();
    return;
  }
  try {
    getTablebase();
    tablebaseReady = true;
    inputReadyAt = 0;
    render();
    maybeRunAi();
  } catch (error) {
    tablebaseReady = false;
    statusMessage = "Tablebase file is missing. Run node generate-tablebase.js, then reload.";
    console.error(error);
    render();
  }
}

function scoreAction(action, tablebase) {
  if (action.type === "W") return 1;
  return -(tablebase.value.get(keyOfGame(action.next)) || 0);
}

function chooseBestActionFromActions(actions, value, dtm) {
  const ranked = actions.map((action, order) => {
    const nextKey = action.type === "S" ? action.nextKey || keyOfGame(action.next) : null;
    const score = action.type === "W" ? 1 : -(value.get(nextKey) || 0);
    const storedDtm = action.type === "W" ? 0 : dtm.get(nextKey);
    const distance = action.type === "W" ? 1 : storedDtm + 1;
    return { action, score, distance, order };
  });
  const wins = ranked.filter(item => item.score === 1);
  if (wins.length) return wins.sort((a, b) => a.distance - b.distance || a.order - b.order)[0].action;
  const draws = ranked.filter(item => item.score === 0);
  if (draws.length) return draws.sort((a, b) => a.order - b.order)[0].action;
  return ranked.sort((a, b) => b.distance - a.distance || a.order - b.order)[0].action;
}

function isAiOpeningGame(game) {
  return aiPlayer === 0
    && game.turn === 0
    && game.phase === "place"
    && game.left[0] === 3
    && game.left[1] === 3
    && game.board.every(piece => !piece);
}

function openingActionCellAndDirection(action) {
  if (action.type !== "S") return null;
  const index = action.after.board.findIndex(piece => piece?.player === 0);
  if (index < 0) return null;
  return { index, direction: action.after.board[index].direction };
}

function chooseRandomSafeOpeningAction(actions) {
  const safeByCellAndDirection = new Map();
  for (const action of actions) {
    const opening = openingActionCellAndDirection(action);
    if (!opening) continue;
    if (!SAFE_AI_OPENING_DIRECTIONS[opening.index]?.includes(opening.direction)) continue;
    safeByCellAndDirection.set(`${opening.index}:${opening.direction}`, action);
  }
  const cells = SAFE_AI_OPENING_DIRECTIONS
    .map((directions, index) => ({ index, directions }))
    .filter(({ index, directions }) =>
      directions.some(direction => safeByCellAndDirection.has(`${index}:${direction}`))
  );
  if (!cells.length) return null;
  const { index, directions: allowedDirections } = cells[Math.floor(Math.random() * cells.length)];
  const directions = allowedDirections.filter(direction => safeByCellAndDirection.has(`${index}:${direction}`));
  const direction = directions[Math.floor(Math.random() * directions.length)];
  return safeByCellAndDirection.get(`${index}:${direction}`);
}

function chooseAiAction() {
  if (UI_TUNING_MODE) return null;
  const game = solverStateFromUi();
  const tablebase = getTablebase();
  const actions = solverActions(game);
  if (isAiOpeningGame(game)) {
    const opening = chooseRandomSafeOpeningAction(actions);
    if (opening) return opening;
  }
  const planned = tablebase.policy.get(keyOfGame(game));
  if (Number.isInteger(planned) && actions[planned]) return actions[planned];
  if (planned && typeof planned === "object") return planned;
  throw new Error(`No tablebase policy for ${keyOfGame(game)}`);
}

function applyAiAction(action) {
  const beforeBoard = cloneBoard(state.board);
  const beforeLeft = [...state.left];
  const landing = action.type === "W" ? action.after : action.next;
  state.board = cloneBoard(landing.board);
  state.left = [...landing.left];
  state.phase = landing.phase;
  state.selected = null;
  state.pending = null;
  if (action.type === "W") {
    state.turn = aiPlayer;
    state.winner = aiPlayer;
    state.winningLine = action.line;
  } else {
    state.turn = landing.turn;
  }
  queueRotationAnimations(beforeBoard, state.board);
  if (landing.left[0] + landing.left[1] < beforeLeft[0] + beforeLeft[1]) {
    queuePlacementAnimations(beforeBoard, state.board);
  } else {
    queueMovementAnimations(beforeBoard, state.board);
  }
  render();
  maybeRunAi();
}

function maybeRunAi() {
  if (UI_TUNING_MODE) return;
  if (!tablebaseReady || !isAiTurn() || aiThinking) return;
  const token = gameToken;
  aiThinking = true;
  render();
  window.setTimeout(() => {
    if (token !== gameToken || !isAiTurn()) {
      aiThinking = false;
      render();
      return;
    }
    try {
      const action = chooseAiAction();
      if (token !== gameToken || !isAiTurn()) {
        aiThinking = false;
        render();
        return;
      }
      aiThinking = false;
      applyAiAction(action);
    } catch (error) {
      aiThinking = false;
      statusMessage = "AI failed to move. Restart the game and try again.";
      console.error(error);
      render();
    }
  }, 80);
}

function movePiece(to) {
  if (isBusy()) return;
  const from = state.selected;
  if (from === null) return;
  if (!legalTargets(from).includes(to)) return reject("The arrows do not point to that square.");
  const movedPiece = state.board[from];
  state.board[to] = { ...movedPiece };
  state.board[from] = null;
  queueMovementAnimation(from, to);
  if (findWin(state.turn)) {
    finishAction();
  } else {
    beginPending({ type: "move", from, to, originalPiece: { ...movedPiece } });
  }
}

function finishAction() {
  const winnerLine = findWin(state.turn);
  if (winnerLine) {
    state.winner = state.turn;
    state.winningLine = winnerLine;
    state.selected = null;
    state.pending = null;
  } else {
    nextTurn();
  }
  render();
  maybeRunAi();
}

function finishPending() {
  if (!state.pending || state.winner !== null || isBusy()) return;
  finishAction();
}

function handleCellClick(index, event) {
  if (event && event.timeStamp < inputReadyAt) return;
  statusMessage = "";
  if (state.winner !== null || isBusy()) return;

  if (state.pending) {
    const pending = state.pending;
    if (pending.type === "place") {
      if (index === pending.index) reject("Use Rotate to turn this piece, or Done to finish.");
      else if (!state.board[index]) updatePendingPlacement(index);
      else reject("Choose an empty square, or Done to finish this move.");
      return;
    }
    if (pending.type === "move") {
      if (index === pending.to) reject("Use Rotate to turn the moved piece, or Done to finish.");
      else if (!state.board[index]) updatePendingMove(index);
      else reject("Choose a highlighted square, Escape to undo, or Done.");
      return;
    }
    if (pending.type === "rotate") {
      if (index === pending.index) reject("Use Rotate to keep turning, Escape to cancel, or Done.");
      else if (switchSelectionFromPendingRotate(index)) return;
      else reject("Use Rotate to keep turning, Escape to cancel, or Done.");
    }
    return;
  }

  if (state.phase === "place") {
    placePiece(index);
    return;
  }

  const piece = state.board[index];
  if (piece?.player === state.turn) {
    state.selected = state.selected === index ? null : index;
    statusMessage = "";
    render();
    return;
  }
  if (state.selected !== null && !piece) {
    movePiece(index);
    return;
  }
  reject("Choose one of your own pieces.");
}

function reject(message) {
  statusMessage = message;
  renderStatus();
}

function drawPiece(piece, index) {
  if (!piece) return "";
  const player = PLAYERS[piece.player];
  const directionClass = piece.direction === "D" ? "diagonal" : "";
  const rotationClass = rotationAnimations.get(index) || "";
  const placementClass = placementAnimations.has(index) ? "place-in" : "";
  return `
    <span class="piece ${player.className} ${directionClass} ${rotationClass} ${placementClass}" aria-hidden="true">
      <svg viewBox="0 0 100 100" focusable="false">
        <g class="piece-shadow" transform="translate(0 10)">
          <path class="piece-shadow-shape" d="M34 5 H66 Q70 5 73 8 L92 27 Q95 30 95 34 V66 Q95 70 92 73 L73 92 Q70 95 66 95 H34 Q30 95 27 92 L8 73 Q5 70 5 66 V34 Q5 30 8 27 L27 8 Q30 5 34 5 Z"
            fill="rgba(47, 47, 43, .32)"/>
        </g>
        <g class="piece-face">
          <path d="M34 5 H66 Q70 5 73 8 L92 27 Q95 30 95 34 V66 Q95 70 92 73 L73 92 Q70 95 66 95 H34 Q30 95 27 92 L8 73 Q5 70 5 66 V34 Q5 30 8 27 L27 8 Q30 5 34 5 Z"
            fill="var(--piece-fill)"
            stroke="var(--piece-stroke)"
            stroke-width="5"
            stroke-linejoin="round"/>
          <g class="piece-mark" opacity=".84">
            <g stroke="var(--piece-mark)" stroke-width="4" stroke-linecap="round">
              <line x1="34" y1="50" x2="66" y2="50"/>
              <line x1="50" y1="34" x2="50" y2="66"/>
            </g>
            <g fill="var(--piece-mark)">
              <path d="M15 50 Q15 48.8 16.4 48.2 L32.6 43.9 Q35 43.2 35 45.5 V54.5 Q35 56.8 32.6 56.1 L16.4 51.8 Q15 51.2 15 50 Z"/>
              <path d="M85 50 Q85 48.8 83.6 48.2 L67.4 43.9 Q65 43.2 65 45.5 V54.5 Q65 56.8 67.4 56.1 L83.6 51.8 Q85 51.2 85 50 Z"/>
              <path d="M50 15 Q48.8 15 48.2 16.4 L43.9 32.6 Q43.2 35 45.5 35 H54.5 Q56.8 35 56.1 32.6 L51.8 16.4 Q51.2 15 50 15 Z"/>
              <path d="M50 85 Q48.8 85 48.2 83.6 L43.9 67.4 Q43.2 65 45.5 65 H54.5 Q56.8 65 56.1 67.4 L51.8 83.6 Q51.2 85 50 85 Z"/>
            </g>
          </g>
        </g>
      </svg>
    </span>`;
}

function drawCoords(index) {
  const [row, col] = rowCol(index);
  return `<span class="cell-coord" aria-hidden="true">${String.fromCharCode(97 + col)}${3 - row}</span>`;
}

function directionWord(direction) {
  return direction === "D" ? "diagonal" : "orthogonal";
}

function actionLabel(game, action) {
  const after = action.after.board;
  const removed = [];
  const added = [];
  const changed = [];
  game.board.forEach((beforePiece, index) => {
    const afterPiece = after[index];
    if (beforePiece && !afterPiece) removed.push(index);
    if (!beforePiece && afterPiece) added.push(index);
    if (beforePiece && afterPiece
      && beforePiece.player === afterPiece.player
      && beforePiece.direction !== afterPiece.direction) {
      changed.push(index);
    }
  });

  if (game.phase === "place" && added.length === 1) {
    const index = added[0];
    return `${CELL_COORDS[index]}, ${directionWord(after[index].direction)}`;
  }
  if (removed.length === 1 && added.length === 1) {
    const to = added[0];
    return `${CELL_COORDS[removed[0]]} -> ${CELL_COORDS[to]}, ${directionWord(after[to].direction)}`;
  }
  if (changed.length === 1) return `rotate ${CELL_COORDS[changed[0]]}`;
  return action.desc;
}

function rankedActionsForGame(game, tablebase) {
  return solverActions(game).map((action, order) => {
    const nextKey = action.type === "S" ? keyOfGame(action.next) : null;
    const score = action.type === "W" ? 1 : -(tablebase.value.get(nextKey) || 0);
    const storedDtm = action.type === "W" ? 0 : tablebase.dtm.get(nextKey);
    const distance = score === 0 ? null : (storedDtm || 0) + 1;
    return {
      action,
      order,
      score,
      distance,
      label: actionLabel(game, action)
    };
  }).sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    if (a.score === 1) return a.distance - b.distance || a.order - b.order;
    if (a.score === -1) return b.distance - a.distance || a.order - b.order;
    return a.order - b.order;
  });
}

function resultText(item) {
  if (item.score === 1) return `Wins in ${item.distance}`;
  if (item.score === -1) return `Loses in ${item.distance}`;
  return "Draws";
}

function renderSolutionTable(items) {
  const rows = items.map(item => `
    <div class="solution-row" role="row">
      <span class="solution-move" role="cell">${item.label}</span>
      <span class="solution-result" role="cell">${resultText(item)}</span>
    </div>
  `).join("");
  solutionTableEl.innerHTML = `
    <div class="solution-row solution-head" role="row">
      <span class="solution-move" role="columnheader">Move</span>
      <span class="solution-result" role="columnheader">Result</span>
    </div>
    ${rows || '<div class="solution-empty">No legal moves.</div>'}
  `;
}

function renderSolutionPanel() {
  if (!solutionHeadlineEl) return;
  if (!window.matchMedia("(min-width: 1340px)").matches) return;
  if (state.winner !== null) {
    solutionHeadlineEl.textContent = `${PLAYERS[state.winner].name} has won`;
    solutionBestEl.textContent = "The game is over.";
    solutionDetailEl.textContent = "Three in a row.";
    solutionChoicesTitleEl.textContent = "Legal moves";
    renderSolutionTable([]);
    return;
  }
  if (!tablebaseReady) {
    solutionHeadlineEl.textContent = "Solved position unavailable";
    solutionBestEl.textContent = "Best move: --";
    solutionDetailEl.textContent = "The tablebase is still loading.";
    solutionChoicesTitleEl.textContent = "Legal moves";
    renderSolutionTable([]);
    return;
  }
  if (aiThinking || isAiTurn()) return;

  const game = solutionStateFromUi();
  const tablebase = ensureTablebaseEvaluation();
  const key = keyOfGame(game);
  const outcome = tablebase.value.get(key) || 0;
  const ranked = rankedActionsForGame(game, tablebase);
  const best = ranked[0];
  const player = PLAYERS[game.turn];
  const opponent = PLAYERS[1 - game.turn];

  if (outcome === 1) {
    solutionHeadlineEl.textContent = `${player.name} is winning`;
    solutionBestEl.textContent = best ? `Best move: ${best.label}` : "Best move: --";
    solutionDetailEl.textContent = best ? `Wins in ${best.distance}.` : "Forced win.";
    solutionChoicesTitleEl.textContent = "Legal moves";
  } else if (outcome === -1) {
    solutionHeadlineEl.textContent = `${opponent.name} is winning`;
    solutionBestEl.textContent = best ? `Best defense: ${best.label}` : "Best defense: --";
    solutionDetailEl.textContent = best ? `Best defense loses in ${best.distance}.` : "Forced loss.";
    solutionChoicesTitleEl.textContent = "Legal moves";
  } else {
    solutionHeadlineEl.textContent = "Drawn with perfect play";
    solutionBestEl.textContent = best ? `Best move: ${best.label}` : "Best move: --";
    solutionDetailEl.textContent = "No forced win.";
    solutionChoicesTitleEl.textContent = "Legal moves";
  }
  renderSolutionTable(ranked);
}

function renderBoard() {
  const legal = state.pending
    ? pendingLegalTargets()
    : state.selected === null ? [] : legalTargets(state.selected);
  const cells = state.board.map((piece, index) => {
    const classes = ["cell"];
    if (state.selected === index) classes.push("selected");
    if (legal.includes(index)) classes.push("legal");
    if (movementAnimations.has(index)) classes.push("moving");
    if (state.winningLine?.includes(index)) classes.push("winning");
    const label = piece
      ? `${CELL_NAMES[index]} ${PLAYERS[piece.player].name} ${directionLabel(piece.direction)}`
      : `${CELL_NAMES[index]} empty`;
    const disabled = isBusy() ? " disabled" : "";
    return `<button class="${classes.join(" ")}" type="button" data-index="${index}" aria-label="${label}"${disabled}>${drawCoords(index)}${drawPiece(piece, index)}</button>`;
  }).join("");
  cellLayerEl.innerHTML = cells;
  applyMovementAnimations();
  rotationAnimations.clear();
  placementAnimations.clear();
  movementAnimations.clear();
  cellLayerEl.querySelectorAll(".cell").forEach(cell => {
    cell.addEventListener("click", event => handleCellClick(Number(cell.dataset.index), event));
  });
}

function applyMovementAnimations() {
  movementAnimations.forEach(({ from }, to) => {
    const fromCell = cellLayerEl.querySelector(`.cell[data-index="${from}"]`);
    const toCell = cellLayerEl.querySelector(`.cell[data-index="${to}"]`);
    const piece = toCell?.querySelector(".piece");
    if (!fromCell || !toCell || !piece) return;
    const fromRect = fromCell.getBoundingClientRect();
    const toRect = toCell.getBoundingClientRect();
    piece.style.setProperty("--move-x", `${fromRect.left - toRect.left}px`);
    piece.style.setProperty("--move-y", `${fromRect.top - toRect.top}px`);
    piece.classList.add("move-in");
  });
}

function renderStatus() {
  const player = currentPlayer();
  if (state.winner !== null) {
    headlineEl.textContent = `${PLAYERS[state.winner].name} wins`;
    sublineEl.textContent = "Three pieces of the same color are in a row.";
    return;
  }
  if (!tablebaseReady) {
    headlineEl.textContent = "Tablebase unavailable";
    sublineEl.textContent = statusMessage || "Run node generate-tablebase.js, then reload.";
    return;
  }
  if (aiThinking || isAiTurn()) {
    headlineEl.textContent = `${PLAYERS[aiPlayer].name} AI thinking`;
    sublineEl.textContent = statusMessage || "The AI is choosing from the full tablebase.";
    return;
  }
  if (state.pending) {
    headlineEl.textContent = `${player.name} adjust`;
    const pendingText = {
      place: "Use Rotate to turn this piece, another empty square to move it, then Done.",
      move: "Use Rotate to turn the moved piece, Escape to undo, or a highlighted square to retarget.",
      rotate: "Use Rotate to keep turning, Escape to cancel, or Done."
    };
    sublineEl.textContent = statusMessage || pendingText[state.pending.type] || "Adjust this move, then Done.";
    return;
  }
  if (state.phase === "place") {
    headlineEl.textContent = `${player.name} to place`;
    sublineEl.textContent = statusMessage || "Click an empty square.";
  } else if (state.selected === null) {
    headlineEl.textContent = `${player.name} to move`;
    sublineEl.textContent = statusMessage || "Choose one of your pieces.";
  } else {
    headlineEl.textContent = `${player.name} action`;
    sublineEl.textContent = statusMessage || `${CELL_NAMES[state.selected]} selected. Rotate, move, cancel, or switch pieces.`;
  }
}

function renderControls() {
  rotateBtn.disabled = !canRotateAction();
  doneBtn.disabled = !state.pending || state.winner !== null || isBusy();
  playFirstBtn.setAttribute("aria-pressed", String(humanPlayer === 0));
  playSecondBtn.setAttribute("aria-pressed", String(humanPlayer === 1));
}

function render() {
  renderBoard();
  renderStatus();
  renderSolutionPanel();
  renderControls();
}

rotateBtn.addEventListener("click", rotateAction);
doneBtn.addEventListener("click", finishPending);
playFirstBtn.addEventListener("click", () => startNewGame(0));
playSecondBtn.addEventListener("click", () => startNewGame(1));
document.addEventListener("keydown", event => {
  if (event.key === "Escape") cancelInteraction();
});
window.addEventListener("resize", renderSolutionPanel);

renderRuleBoards();
render();
warmTablebase();
