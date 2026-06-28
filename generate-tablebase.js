const fs = require("node:fs");

const WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6]
];
const ORTHOGONAL = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAGONAL = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const CELL_NAMES = ["top-left", "top", "top-right", "left", "center", "right", "bottom-left", "bottom", "bottom-right"];

function cloneBoard(board) {
  return board.map(piece => piece ? { ...piece } : null);
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

function findWinOnBoard(board, player) {
  return WIN_LINES.find(line =>
    line.every(index => board[index]?.player === player)
  ) || null;
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

function keyToCode(key) {
  const phaseCode = key[0] === "m" ? 1 : 0;
  const turn = Number(key[1]);
  const left0 = Number(key[2]);
  const left1 = Number(key[3]);
  const boardCode = parseInt(key.slice(4), 36);
  return (((((phaseCode * 2 + turn) * 4 + left0) * 4 + left1) * 1953125) + boardCode);
}

function switchedGame(game) {
  return {
    board: cloneBoard(game.board),
    turn: 1 - game.turn,
    phase: game.left[0] === 0 && game.left[1] === 0 ? "move" : game.phase,
    left: [...game.left]
  };
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
            `${CELL_NAMES[from]} -> ${CELL_NAMES[to]} ${directionLabel(direction)}`
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
    const action = chooseBestActionFromActions(actions, value, dtm);
    policy.set(key, actions.indexOf(action));
  }

  return { actionMap, value, dtm, policy };
}

function packPolicy(policy) {
  const records = Array.from(policy, ([key, actionIndex]) => {
    if (actionIndex < 0 || actionIndex >= 16) throw new Error(`Action index out of range: ${actionIndex}`);
    return [keyToCode(key), actionIndex];
  }).sort((a, b) => a[0] - b[0]);

  const bytes = [];
  let previousCode = 0;
  for (const [code, actionIndex] of records) {
    let value = ((code - previousCode) * 16) + actionIndex;
    previousCode = code;
    while (value >= 128) {
      bytes.push((value & 127) | 128);
      value = Math.floor(value / 128);
    }
    bytes.push(value);
  }
  return Buffer.from(bytes).toString("base64");
}

const tablebase = buildTablebase();
const payload = packPolicy(tablebase.policy);
const chunks = payload.match(/.{1,8192}/g) || [];
const body = `self.CHUNG_TOI_TABLEBASE=${JSON.stringify(chunks)}.join("");\n`;

fs.mkdirSync("public", { recursive: true });
fs.writeFileSync("public/tablebase-data.js", body);

console.log(`Wrote public/tablebase-data.js`);
console.log(`policy=${tablebase.policy.size} bytes=${Buffer.byteLength(body)}`);
