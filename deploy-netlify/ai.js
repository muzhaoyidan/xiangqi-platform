const { spawn } = require('node:child_process');
const { copyFile, readFile, writeFile, mkdir, chmod } = require('node:fs/promises');
const { createHash } = require('node:crypto');
const { join } = require('node:path');
const model = require('./model.json');

let setup;
async function prepareEngine() {
  const engineDir = join(__dirname, 'engine');
  const directory = join('/tmp', 'xiangqi-pikafish-' + model.sha256.slice(0,16));
  await mkdir(directory, { recursive:true });
  if (!/^[a-z0-9][a-z0-9-]*$/.test(process.env.SITE_NAME || '')) throw Error('Netlify SITE_NAME missing');
  const response = await fetch('https://' + process.env.SITE_NAME + '.netlify.app/' + model.part, {
    signal:AbortSignal.timeout(8000), redirect:'error',
  });
  if (!response.ok || Number(response.headers.get('content-length')) !== model.partSize) {
    throw Error('NNUE segment unavailable');
  }
  const network = Buffer.concat([
    await readFile(join(engineDir,'pikafish.nnue.part')),
    Buffer.from(await response.arrayBuffer()),
  ]);
  if (createHash('sha256').update(network).digest('hex') !== model.sha256) {
    throw Error('NNUE checksum mismatch');
  }
  const filename = 'Pikafish-Linux-x86-64-universal';
  const executable = join(directory,filename);
  await copyFile(join(engineDir,filename),executable);
  await chmod(executable,0o700);
  await writeFile(join(directory,'pikafish.nnue'),network);
  const runtimeDir = join(directory,'runtime');
  await mkdir(runtimeDir,{recursive:true});
  for(const name of ['ld-linux-x86-64.so.2','libm.so.6','libc.so.6']) {
    await copyFile(join(__dirname,'runtime',name),join(runtimeDir,name));
  }
  const loader = join(runtimeDir,'ld-linux-x86-64.so.2');
  await chmod(loader,0o700);
  return {executable,directory,loader,runtimeDir};
}

async function cloudSearch(UciEngine) {
  setup ??= prepareEngine().then(({executable,directory,loader,runtimeDir}) =>
    new UciEngine({start:()=>spawn(loader,['--library-path',runtimeDir,executable],{cwd:directory}),startupMs:5000})
  ).catch(error=>{
    setup = undefined;
    throw error;
  });
  const engine = await setup;
  return engine.search.bind(engine);
}

const modules = Promise.all([
  import('./engine.mjs'), import('./rules.mjs'), import('./game.mjs'),
]);
let busy = false;

function respond(statusCode, payload) {
  return {
    statusCode,
    headers: { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' },
    body: JSON.stringify(payload),
  };
}

function createHandler(searchOverride) {
  return async (event, context) => {
    if (context) context.callbackWaitsForEmptyEventLoop = false;
    if (event.httpMethod !== 'POST') return respond(405,{error:'请使用 POST'});
    if (busy) return respond(429,{error:'引擎正在处理其他对局，请重试'});
    const input = event.body || '';
    if (event.isBase64Encoded || input.length > 20000) return respond(413,{error:'请求格式不支持或过大'});
    busy = true;
    try {
      const [{UciEngine},{board,fen,legal,decode},{replay,uciMoves}] = await modules;
      let data, game;
      try {
        data = JSON.parse(input);
        if (typeof data.gameId !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(data.gameId)) {
          throw Error('棋局编号无效');
        }
        game = replay(data.moves);
        if (game.result) throw Error('棋局已结束或正在等待裁决');
      } catch(error) {
        return respond(400,{error:error.message});
      }
      const number = (key,fallback,min,max) => {
        const value = data.settings?.[key];
        return Number.isFinite(value) ? Math.max(min, Math.min(max, Math.trunc(value))) : fallback;
      };
      const settings = {
        time:number('time',3000,50,12000),
        depth:number('depth',0,0,128),
        threads:number('threads',2,1,2),
        hash:number('hash',128,1,128),
      };

      const search = searchOverride || await cloudSearch(UciEngine);
      const result = await search(fen(board(),'r'),settings,{
        moves:uciMoves(game.history), gameId:data.gameId,
      });
      if (!legal(game.board,...decode(result.move),game.turn)) throw Error('引擎返回非法着法');
      return respond(200,result);
    } catch (error) {
      console.error('Pikafish:',error.message);
      return respond(503,{error:'在线 Pikafish 暂时不可用，请重试。'});
    } finally {
      busy = false;
    }
  };
}

exports.handler = createHandler();
exports.createHandler = createHandler;
