import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { PassThrough } from 'node:stream';
import { UciEngine } from './engine.mjs';
import { createServer } from './server.mjs';
import { board, fen, decode } from './rules.mjs';

const startFen=fen(board(),'r');
const fixture = () => {
  const children=[];
  function start() {
    const child=new EventEmitter();
    child.stdout=new PassThrough();
    child.stderr=new PassThrough();
    child.commands=[];
    child.kill=()=>{ child.killed=true; child.emit('exit',0); };
    child.stdin={
      on(){},
      write(data) {
        const cmd=data.trim();
        child.commands.push(cmd);
        child.emit('command',cmd);
        const reply={uci:'option name Threads type spin default 1 min 1 max 8\nuciok',isready:'readyok',stop:'bestmove h2e2'}[cmd];
        if(reply) queueMicrotask(()=>child.stdout.write(reply+'\n'));
      },
    };
    children.push(child);
    return child;
  }
  return {children,engine:new UciEngine({start,startupMs:250,searchGraceMs:20,stopMs:50})};
};

const until = async predicate => {
  for(let i=0;i<200;i++) {
    if(predicate()) return;
    await new Promise(resolve=>setTimeout(resolve,1));
  }
  throw Error('expected engine command');
};

test('原生协议层复用进程，取消发送 stop，等待旧 bestmove 后再搜索',async()=>{
  const {engine,children}=fixture();
  try {
    const abort=new AbortController();
    const old=engine.search(startFen,{time:1000},{signal:abort.signal,moves:['h2e2'],gameId:'first'});
    await until(()=>children[0]?.commands.includes('go movetime 1000'));
    abort.abort();
    const next=engine.search(startFen,{time:1000},{moves:['h2e2','h9g7'],gameId:'next'});
    await assert.rejects(old,{name:'AbortError'});
    await until(()=>children[0].commands.filter(cmd=>cmd.startsWith('go ')).length===2);
    const {commands}=children[0];
    assert(commands.includes('position fen '+startFen+' moves h2e2 h9g7'));
    assert(commands.indexOf('stop')<commands.lastIndexOf('go movetime 1000'));
    assert.equal(commands.filter(cmd=>cmd==='uci').length,1);
    assert.equal(children.length,1);
    children[0].stdout.write('bestmove h0g2\n');
    assert.equal((await next).move,'h0g2');
  } finally { engine.close(); }
});

test('引擎崩溃和超时后自动创建新进程，下次搜索可成功',async()=>{
  const {engine,children}=fixture();
  try {
    const crashed=engine.search(startFen,{time:1000});
    await until(()=>children[0]?.commands.includes('go movetime 1000'));
    children[0].emit('exit',1);
    await assert.rejects(crashed,/异常退出/);
    await assert.rejects(engine.search(startFen,{time:50}),/超时/);
    assert.equal(children[1].killed,true);
    const recovered=engine.search(startFen,{time:1000});
    await until(()=>children[2]?.commands.includes('go movetime 1000'));
    children[2].stdout.write('bestmove h2e2\n');
    assert.equal((await recovered).move,'h2e2');
  } finally {engine.close();}
});

test('HTTP 断开触发 stop，新请求仍可使用同一个引擎进程',async()=>{
  const {engine,children}=fixture();
  const server=createServer((...args)=>engine.search(...args));
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const url='http://127.0.0.1:'+server.address().port+'/api/ai';
  const body=JSON.stringify({moves:[decode('h2e2')],gameId:'first',settings:{time:1000}});
  const abort=new AbortController();
  try {
    const request=fetch(url,{method:'POST',body,signal:abort.signal});
    await until(()=>children[0]?.commands.includes('go movetime 1000'));
    abort.abort();
    await assert.rejects(request,{name:'AbortError'});
    await until(()=>children[0].commands.includes('stop'));
    const next=fetch(url,{method:'POST',body});
    await until(()=>children[0].commands.filter(cmd=>cmd.startsWith('go ')).length===2);
    children[0].stdout.write('bestmove h9g7\n');
    const response=await next;
    assert.equal(response.status,200);
    assert.equal((await response.json()).move,'h9g7');
    assert.equal(children.length,1);
  } finally {
    engine.close();
    server.closeAllConnections();
    server.close();
  }
});
