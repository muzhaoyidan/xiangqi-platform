import { board, check, legal, moves, uci } from './rules.mjs';
import { competitionState, other, pieceIds, traceMove } from './adjudication.mjs';

export function newGame() {
  const position = board();
  return { board: position, ids: pieceIds(position), turn: 'r', history: [], pending: null, result: '' };
}

export function applyMove(game, a, z, { adjudicate = true } = {}) {
  if (game.result || ![a,z].every(i => Number.isInteger(i) && i >= 0 && i < 90) ||
      !legal(game.board,a,z,game.turn)) throw Error('棋局中有非法着法或终局后的着法');
  const move = traceMove(game.board, game.ids, a, z, game.turn);
  move.previousPending = game.pending;
  const turn = other(game.turn);
  const history = [...game.history, move];
  let outcome = {};
  if (adjudicate) {
    outcome = moves(move.after, turn).length === 0
      ? { result: (turn === 'r' ? '黑方' : '红方') + '获胜 · ' + (check(move.after,turn) ? '将死' : '困毙') }
      : competitionState(history, game.pending);
  }
  return { board: move.after, ids: move.afterIds, turn, history, pending: outcome.pending ?? null, result: outcome.result ?? '' };
}

export function replay(sequence, options) {
  if (!Array.isArray(sequence) || sequence.length > 1500) throw Error('无效的着法记录');
  let game = newGame();
  for (const pair of sequence) {
    if (!Array.isArray(pair) || pair.length !== 2) throw Error('无效的着法记录');
    game = applyMove(game, pair[0], pair[1], options);
  }
  return game;
}

export function restore(serialized) {
  const save = JSON.parse(serialized);
  if (!save || !['r','b'].includes(save.human)) throw Error('没有有效存档');
  const game = replay(save.moves);
  const resignation = (save.human === 'r' ? '黑方' : '红方') + '获胜 · 玩家认输';
  if (!game.result && save.result === resignation) game.result = resignation;
  return { game, human: save.human };
}

export function undoTurn(game, human) {
  const lastHuman = game.history.findLastIndex(move => move.turn === human);
  if (lastHuman === -1) return game;
  const move = game.history[lastHuman];
  return {
    board: move.before, ids: move.ids, turn: human, history: game.history.slice(0,lastHuman),
    pending: move.previousPending, result: '',
  };
}

export function uciMoves(history) { return history.map(move => uci(move.a,move.z)); }

export function searchRequests() {
  let active;
  return {
    begin() {
      active?.abort();
      const controller = new AbortController();
      active = controller;
      return { signal: controller.signal, current: () => active === controller };
    },
    cancel() {
      active?.abort();
      active = undefined;
    },
  };
}
