import { check, legal, moves, side } from './rules.mjs';

export const other = color => color === 'r' ? 'b' : 'r';
const sideName = color => color === 'r' ? '红方' : '黑方';
const positionKey = (board, turn) => turn + board.map(piece => piece ?? '.').join('');
export const pieceIds = board => board.map((piece, i) => piece ? i + 1 : null);

function captures(board, ids, color) {
  const attacks = [];
  for (const [from, piece] of board.entries()) {
    if (!piece || side(piece) !== color) continue;
    for (const [to, target] of board.entries()) {
      if (target && side(target) !== color && legal(board, from, to, color)) {
        attacks.push({ from, to, attacker: ids[from], target: ids[to], piece, victim: target });
      }
    }
  }
  return attacks;
}

export function traceMove(before, ids, a, z, turn) {
  const after = before.slice();
  after[z] = after[a];
  after[a] = null;
  const afterIds = ids.slice();
  afterIds[z] = ids[a];
  afterIds[a] = null;
  const previous = new Set(captures(before, ids, turn).map(a => a.attacker + ':' + a.target));
  const threats = captures(after, afterIds, turn).filter(a => !previous.has(a.attacker + ':' + a.target));
  return {
    a, z, turn, p: before[a], c: before[z], before, after, ids, afterIds,
    movedId: ids[a], capturedId: ids[z], threats,
    gaveCheck: check(after, other(turn)),
  };
}

const relocated = (board, from, to) => {
  const after = board.slice();
  after[to] = after[from];
  after[from] = null;
  return after;
};

function tacticalChecks(board, color) {
  return moves(board, color)
    .map(([a, z]) => relocated(board, a, z))
    .filter(after => check(after, other(color)));
}

function mateThreat(board, color) {
  return tacticalChecks(board, color).some(after => moves(after, other(color)).length === 0);
}

export function classifyMove(move, reply) {
  if (move.gaveCheck) return { kind: 'check' };
  if (move.p.toLowerCase() === 'k' && check(move.before, move.turn)) return { kind: 'idle' };
  const enemy = other(move.turn);
  const checks = tacticalChecks(move.after, move.turn);
  if (checks.some(after => moves(after, enemy).length === 0) &&
      !mateThreat(move.before, move.turn)) return { kind: 'mate' };

  let uncertain = false;
  for (const threat of move.threats) {
    const { from, to, attacker, target, piece, victim } = threat;
    const victimType = victim.toLowerCase();
    if ('kp'.includes(piece.toLowerCase())) continue;
    if (victimType === 'p' && (enemy === 'r' ? to >= 45 : to < 45)) continue;
    const simpleTarget = 'rch'.includes(victimType);
    const escapedTarget = reply?.movedId === target && !reply.gaveCheck;
    const exchange = legal(move.after, to, from, enemy);
    const afterCapture = relocated(move.after, from, to);
    const recapture = afterCapture.some((p, i) => p && side(p) === enemy && legal(afterCapture, i, to, enemy));
    const safe = !mateThreat(afterCapture, enemy);
    // Recognize only direct chases of an undefended active piece that actually flees.
    if (simpleTarget && attacker === move.movedId && escapedTarget && !exchange &&
        !recapture && safe && !legal(reply.after, from, reply.z, move.turn)) {
      return { kind: 'chase', target, attacker, targetType: victimType === 'r' ? 'rook' : 'unrooted' };
    }
    uncertain = true;
  }
  // Continued checks, exchanges and attacks involving cooperating pieces need an arbiter.
  return { kind: uncertain || checks.length ? 'unknown' : 'idle' };
}

export function repeatedPeriod(history) {
  const keys = history.map(move => positionKey(move.after, other(move.turn)));
  for (let period = 2; period * 3 <= keys.length; period += 2) {
    const first = keys.length - 3 * period;
    if (history[first].c) continue;
    let repeated = true;
    for (let i = first + period; i < keys.length && repeated; i++) {
      repeated = keys[i] === keys[i-period] &&
        (i === first + period ||
          (history[i].a === history[i-period].a && history[i].z === history[i-period].z));
    }
    if (repeated) return period;
  }
  return 0;
}

const everyKind = (moves, kind) => moves.length > 0 && moves.every(move => move.kind === kind);

function priority(attacks) {
  const kinds = new Set(attacks.map(attack => attack.kind));
  const chases = attacks.filter(attack => attack.kind === 'chase');
  if (everyKind(attacks, 'mate')) return true;
  if (kinds.size === 2 && kinds.has('check') && kinds.has('mate')) return true;
  if (!chases.length || !chases.every(a => ['rook','unrooted'].includes(a.targetType))) return false;
  return kinds.size === 1 || (kinds.size === 2 &&
    new Set(chases.map(a => a.targetType)).size === 1 &&
    (kinds.has('check') || kinds.has('mate')));
}

export function cycleRuling(cycle, completedPlies) {
  const attacks = { r: [], b: [] };
  for (const move of cycle) attacks[move.turn].push(move);
  const redChecks = everyKind(attacks.r, 'check');
  const blackChecks = everyKind(attacks.b, 'check');
  if (redChecks !== blackChecks) return { kind: 'loss', side: redChecks ? 'r' : 'b', reason: '长将' };
  if (cycle.some(move => move.kind === 'unknown')) return { kind: 'review' };
  const redForbidden = !attacks.r.some(move => move.kind === 'idle');
  const blackForbidden = !attacks.b.some(move => move.kind === 'idle');
  let required = null;
  if (redForbidden !== blackForbidden) required = redForbidden ? 'r' : 'b';
  if (redForbidden && blackForbidden) {
    const redPriority = priority(attacks.r), blackPriority = priority(attacks.b);
    if (redPriority !== blackPriority) required = redPriority ? 'r' : 'b';
  }
  if (!required && completedPlies <= 50) required = 'r';
  return { kind: 'vary', side: required };
}

export function naturalLimit(history, claimant, { rounds = 60, maxChecks = 10 } = {}) {
  const count = { r: 0, b: 0 };
  let checks = 0;
  for (let i = history.length - 1; i >= 0 && !history[i].c; i--) {
    const move = history[i];
    if (move.turn === claimant && move.gaveCheck && ++checks > maxChecks) continue;
    count[move.turn]++;
  }
  return Math.min(count.r, count.b) >= rounds;
}

export function competitionState(history, pending = null) {
  if (pending) {
    const expected = pending.cycle[pending.elapsed % pending.cycle.length];
    const last = history.at(-1);
    const follows = last.a === expected.a && last.z === expected.z;
    if (follows) {
      const elapsed = pending.elapsed + 1;
      if (elapsed === 4) return {
        result: pending.side ? sideName(other(pending.side)) + '获胜 · 对方应变未变' : '和棋 · 双方不变',
      };
      return { pending: { ...pending, elapsed } };
    }
    // After a departure, resume normal play. A historical ruling does not carry
    // across an unrelated continuation.
    return {};
  }
  const period = repeatedPeriod(history);
  if (period) {
    const cycle = history.slice(-period);
    const classified = cycle.map((move, i) => ({
      turn: move.turn, ...classifyMove(move, cycle[(i + 1) % period]),
    }));
    const first = history.length - 3 * period;
    const firstMove = history[first];
    const equivalent = cycle[0];
    if (firstMove.a !== equivalent.a || firstMove.z !== equivalent.z) {
      const entrance = classifyMove(firstMove, history[first+1]);
      if (entrance.kind !== classified[0].kind || entrance.targetType !== classified[0].targetType) {
        return { result: '重复局面 · 需人工裁决首着性质' };
      }
    }
    const ruling = cycleRuling(classified, history.length);
    if (ruling.kind === 'review') return { result: '重复局面 · 需人工裁决复杂杀捉' };
    if (ruling.kind === 'loss') return { result: sideName(other(ruling.side)) + '获胜 · 对方' + ruling.reason };
    return { pending: { side: ruling.side, cycle, elapsed: 0 } };
  }
  if (['r','b'].some(color => naturalLimit(history, color))) return { result: '和棋 · 自然限着' };
  return {};
}

export function variationNotice(pending) {
  if (!pending) return '';
  return pending.side ? sideName(pending.side) + '须在两回合内变着' : '双方可在两回合内变着';
}
