import { test } from 'node:test';
import assert from 'node:assert/strict';
import { competitionState, pieceIds, repeatedPeriod, traceMove } from './adjudication.mjs';
import { decode, legal } from './rules.mjs';

// Transcribed from the diagrams at https://cnchess.net/rules/ChaptEight.html.
// These positions require tactical classification beyond the supported subset.
const cases = [
  {
    figure: 7,
    pieces: {c9:'e',d9:'a',e9:'k',g9:'c',e8:'a',f8:'R',g8:'H',i8:'r',e7:'e',
      d3:'p',e3:'p',c2:'h',e2:'E',c0:'E',e0:'K',i0:'C'},
    cycle: ['i0h0','i8h8','h0i0','h8i8'],
    officialRuling: '红方长杀，红方变着',
  },
  {
    figure: 12,
    pieces: {d9:'k',e8:'a',g9:'P',a8:'P',g7:'r',h7:'c',i6:'R',a2:'E',e2:'E',e1:'A',e0:'K',f0:'A'},
    cycle: ['i6h6','h7i7','h6i6','i7h7'],
    officialRuling: '黑方长捉，黑方变着',
  },
  {
    figure: 19,
    pieces: {f9:'a',g9:'R',d8:'k',e8:'a',d7:'c',e7:'c',d6:'R',c4:'P',g4:'p',a3:'P',
      c3:'r',e2:'E',h1:'h',e1:'A',c0:'E',e0:'K',f0:'A'},
    cycle: ['d6e6','d7b7','e6d6','b7d7'],
    officialRuling: '双方禁着，不变作和（仍适用前 25 回合例外）',
  },
  {
    figure: 25,
    pieces: {b9:'R',d9:'h',e9:'k',f9:'a',g9:'e',e8:'a',f8:'c',a7:'e',a6:'p',c6:'P',
      e6:'p',i6:'p',f5:'h',h5:'r',i5:'c',d4:'R',a3:'P',d3:'C',e3:'P',g3:'P',
      c2:'H',e2:'E',f2:'C',g2:'r',e1:'A',e0:'K',f0:'A',g0:'E'},
    cycle: ['d4d5','f5g7','d5d4','g7f5'],
    officialRuling: '联合捉子对长捉车，黑方变着',
  },
];

for (const {figure,pieces,cycle,officialRuling} of cases) {
  test('官方图 '+figure+' 复杂棋例保留人工裁决（'+officialRuling+'）', () => {
    let board = Array(90).fill(null);
    for (const [square,piece] of Object.entries(pieces)) board[decode(square+square)[0]] = piece;
    let ids = pieceIds(board);
    const history = [];
    for (const move of [...cycle,...cycle,...cycle]) {
      const turn = history.length%2 ? 'b' : 'r';
      const [from,to] = decode(move);
      assert(legal(board,from,to,turn),move);
      const played = traceMove(board,ids,from,to,turn);
      history.push(played);
      board = played.after;
      ids = played.afterIds;
    }
    assert.equal(repeatedPeriod(history),4);
    assert.match(competitionState(history).result,/需人工裁决/);
  });
}
