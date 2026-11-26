import { test } from 'node:test';
import assert from 'node:assert/strict';
import { competitionState, cycleRuling, naturalLimit, pieceIds, repeatedPeriod, traceMove } from './adjudication.mjs';
import { decode, legal } from './rules.mjs';
import { applyMove, newGame, restore, searchRequests, undoTurn } from './game.mjs';

function sequence(pieces, pattern, repeats) {
  let board = Array(90).fill(null);
  for (const [square,piece] of Object.entries(pieces)) board[decode(square+square)[0]] = piece;
  let ids = pieceIds(board);
  const history = [];
  for (let i=0; i<pattern.length*repeats; i++) {
    const [from,to] = decode(pattern[i%pattern.length]);
    const turn = i%2 ? 'b' : 'r';
    assert(legal(board,from,to,turn), pattern[i%pattern.length]);
    const move = traceMove(board,ids,from,to,turn);
    history.push(move);
    board = move.after;
    ids = move.afterIds;
  }
  return history;
}

test('单方长将须满三轮，走完第二轮仍可继续', () => {
  const history = sequence({d0:'K',f9:'k',e6:'R'}, ['e6f6','f9e9','f6e6','e9f9'],3);
  assert.equal(repeatedPeriod(history.slice(0,8)),0);
  assert.equal(repeatedPeriod(history),4);
  assert.match(competitionState(history).result,/黑方获胜.*长将/);
});

test('无根马被持续追捉，固定 ID 跨循环保持，红方须变着', () => {
  const history = sequence({e0:'K',f9:'k',a5:'R',b7:'h'}, ['a5b5','b7a9','b5a5','a9b7'],4);
  const first = history[0].threats.find(t=>t.victim==='h');
  assert.equal(first.target,history[1].movedId);
  assert.equal(history[2].threats.find(t=>t.victim==='h').target,first.target);
  let outcome = competitionState(history.slice(0,12));
  assert.equal(outcome.pending?.side,'r');
  const changed = traceMove(history[11].after,history[11].afterIds,...decode('a5a6'),'r');
  assert.deepEqual(competitionState([...history.slice(0,12),changed],outcome.pending),{});
  for(let i=13;i<=16;i++) outcome=competitionState(history.slice(0,i),outcome.pending);
  assert.match(outcome.result,/黑方获胜.*应变未变/);
});

test('双方闲着，前 25 回合仍须红方先变；超过后才可双方不变判和',()=>{
  const history = sequence({d0:'K',f9:'k'},['d0d1','f9f8','d1d0','f8f9'],4);
  assert.equal(competitionState(history.slice(0,12)).pending.side,'r');
  let outcome=cycleRuling([{turn:'r',kind:'idle'},{turn:'b',kind:'idle'}],51);
  assert.deepEqual(outcome,{kind:'vary',side:null});
  outcome={pending:{side:null,cycle:history.slice(8,12),elapsed:0}};
  for(let i=13;i<=16;i++) outcome=competitionState(history.slice(0,i),outcome.pending);
  assert.match(outcome.result,/和棋/);
});

// Chapter 8 diagrams: published move classifications are the input to the
// arbitration table test. Board-level recognition is tested separately above.
test('2020 棋例细则图 6、7、12、19、25 的裁决表',()=>{
  function rule(red, black) {
    return cycleRuling([
      ...red.map(move=>({turn:'r',...move})),
      ...black.map(move=>({turn:'b',...move})),
    ],60);
  }
  const check={kind:'check'}, idle={kind:'idle'}, mate={kind:'mate'};
  const rook={kind:'chase',targetType:'rook'}, loose={kind:'chase',targetType:'unrooted'};
  const joint={kind:'chase',targetType:'joint'};
  assert.deepEqual(rule([check,check],[idle,idle]),{kind:'loss',side:'r',reason:'长将'});
  assert.deepEqual(rule([mate,mate],[idle,idle]),{kind:'vary',side:'r'});
  assert.deepEqual(rule([idle,idle],[rook,rook]),{kind:'vary',side:'b'});
  assert.deepEqual(rule([loose,check],[mate,mate]),{kind:'vary',side:null});
  assert.deepEqual(rule([joint,joint],[rook,rook]),{kind:'vary',side:'b'});
  assert.deepEqual(rule([check,{kind:'unknown'}],[idle,idle]),{kind:'review'});
});

test('自然限着按双方完整回合计数，提出方超 10 次的将军扣除，吃子清零',()=>{
  const track=Array.from({length:120},(_,i)=>({turn:i%2?'b':'r',gaveCheck:i%2===0&&i<22}));
  assert.equal(naturalLimit(track,'r'),false);
  assert.equal(naturalLimit(track,'b'),true);
  assert.equal(naturalLimit(track.slice(0,119),'b'),false);
  assert.equal(naturalLimit([...track,{turn:'r'},{turn:'b'}],'r'),true);
  assert.equal(naturalLimit([...track,{turn:'r',c:'h'}],'b'),false);
});

test('思考中悔棋与连续重开取消旧请求，旧应手失效',()=>{
  const requests=searchRequests();
  const current=applyMove(newGame(),...decode('h2e2'));
  const old=requests.begin();
  requests.cancel();
  const undone=undoTurn(current,'r');
  assert.deepEqual(undone,newGame());
  assert.equal(old.signal.aborted,true);
  const opening=requests.begin();
  requests.cancel();
  const latest=requests.begin();
  assert.equal(opening.signal.aborted,true);
  assert.equal(opening.current(),false);
  assert.equal(latest.current(),true);
});

test('拒绝损坏存档，旧格式可重放并恢复原始棋子 ID',()=>{
  for (const save of ['{',null,'{"human":"r","moves":[null]}',
    '{"human":"r","moves":[[999,2]]}','{"human":"r","moves":[[0,1]]}']) {
    assert.throws(()=>restore(save));
  }
  const made=applyMove(newGame(),...decode('h2e2'));
  const saved=restore(JSON.stringify({human:'r',moves:[decode('h2e2')],result:'invalid'}));
  assert.deepEqual(saved.game,made);
});

test('2020 棋例细则图 6：按原图摆子与官方着法重放三轮',()=>{
  const history=sequence({c9:'e',e8:'k',c1:'p',d0:'K',f0:'R',g0:'E',h0:'c'},
    ['f0e0','e8f8','e0f0','f8e8'],3);
  assert.deepEqual(history.slice(0,4).map(move=>move.gaveCheck),[true,false,true,false]);
  assert.match(competitionState(history).result,/黑方获胜.*长将/);
});
