import {test} from 'node:test';import assert from 'node:assert/strict';import {board,legal,raw,moves,check,fen,decode,uci} from './rules.mjs';import {search} from './engine.mjs';
test('初始局面 32 子，红方 44 合法着法',()=>{let b=board();assert.equal(b.filter(Boolean).length,32);assert.equal(moves(b,'r').length,44);});
test('马腿阻挡',()=>{let b=board();assert(raw(b,82,63));b[73]='P';assert(!raw(b,82,63));});
test('象眼、河界',()=>{let b=board();assert(raw(b,83,63));b[73]='P';assert(!raw(b,83,63));b=Array(90).fill(null);b[47]='E';assert(!raw(b,47,27));});
test('炮必须隔一子吃子',()=>{let b=Array(90).fill(null);b[64]='C';b[1]='r';assert(!raw(b,64,1));b[37]='P';assert(raw(b,64,1));b[46]='P';assert(!raw(b,64,1));});
test('兵过河横走，禁止后退',()=>{let b=Array(90).fill(null);b[54]='P';assert(raw(b,54,45));assert(!raw(b,54,55));b[36]='P';assert(raw(b,36,37));assert(!raw(b,36,45));});
test('将士九宫',()=>{let b=board();assert(!raw(b,85,84));assert(raw(b,84,76));});
test('将帅照面与应将',()=>{let b=Array(90).fill(null);b[4]='k';b[85]='K';b[49]='R';assert(!legal(b,49,48,'r'));b[49]=null;assert(check(b,'r'));});
test('UCI 坐标往返',()=>{for(let a=0;a<90;a++)for(let z=0;z<90;z++)assert.deepEqual(decode(uci(a,z)),[a,z]);});
test('无引擎时明确失败',async()=>{let old=process.env.PIKAFISH_PATH;process.env.PIKAFISH_PATH='Z:/missing-pikafish.exe';try{await assert.rejects(search(fen(board(),'r')),/Pikafish 未安装/);}finally{if(old)process.env.PIKAFISH_PATH=old;else delete process.env.PIKAFISH_PATH;}});
test('车不能越子及吃己子',()=>{let b=board();assert(!raw(b,81,45));assert(!raw(b,81,82));assert(raw(b,81,72));});
test('无合法着法的困毙局面',()=>{let b=Array(90).fill(null);b[3]='k';b[85]='K';b[66]='r';b[68]='r';b[75]='r';assert(!check(b,'r'));assert.equal(moves(b,'r').length,0);});
test('无合法应将的将死局面',()=>{let b=Array(90).fill(null);b[4]='k';b[85]='K';b[66]='r';b[68]='r';b[76]='r';assert(check(b,'r'));assert.equal(moves(b,'r').length,0);});
test('所有初始合法着法均不送将',()=>{let b=board();for(let [a,z]of moves(b,'r')){let c=b.slice();c[z]=c[a];c[a]=null;assert(!check(c,'r'));}});



test('中文棋谱按各方视角记录平、进、退',async()=>{
  const {chineseMove}=await import('./rules.mjs');
  const b=board();
  assert.equal(chineseMove(b,...decode('h2e2')),'炮二平五');
  assert.equal(chineseMove(b,...decode('h9g7')),'马８进７');
  assert.equal(chineseMove(b,...decode('a0a2')),'车九进二');
  assert.equal(chineseMove(b,...decode('g0e2')),'相三进五');
  const retreat=Array(90).fill(null);
  retreat[decode('e2e2')[0]]='R';
  retreat[decode('f8f8')[0]]='a';
  assert.equal(chineseMove(retreat,...decode('e2e1')),'车五退一');
  assert.equal(chineseMove(retreat,...decode('f8e9')),'士６退５');
});
test('中文棋谱按走前局面区分同路前中后',async()=>{
  const {chineseMove}=await import('./rules.mjs');
  const b=Array(90).fill(null);
  for(const square of ['c6','c5','c4']) b[decode(square+square)[0]]='P';
  for(const square of ['g3','g4']) b[decode(square+square)[0]]='r';
  assert.equal(chineseMove(b,...decode('c6d6')),'前兵平六');
  assert.equal(chineseMove(b,...decode('c5d5')),'中兵平六');
  assert.equal(chineseMove(b,...decode('c4d4')),'后兵平六');
  assert.equal(chineseMove(b,...decode('g3g2')),'前车进１');
  assert.equal(chineseMove(b,...decode('g4h4')),'后车平８');
  for(const square of ['d5','d6']) b[decode(square+square)[0]]='P';
  assert.equal(chineseMove(b,...decode('c6b6')),'前兵七平八');
});
