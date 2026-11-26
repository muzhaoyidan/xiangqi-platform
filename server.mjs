import { spawn } from 'node:child_process';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { search, closeEngine } from './engine.mjs';
import { board, fen, legal, decode } from './rules.mjs';
import { replay, uciMoves } from './game.mjs';

const assets = new Set(['index.html','app.mjs','rules.mjs','game.mjs','adjudication.mjs','style.css']);

async function jsonBody(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 20000) throw Error('请求过大');
  }
  return JSON.parse(body);
}

function json(res, status, body) {
  if (res.destroyed) return;
  res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

export function createServer(runSearch = search) {
  return http.createServer(async (req,res) => {
    try {
      if (req.method === 'POST' && req.url === '/api/ai') {
        const controller = new AbortController();
        res.once('close', () => {
          if (!res.writableEnded) controller.abort();
        });
        const data = await jsonBody(req);
        if (typeof data.gameId !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(data.gameId)) throw Error('棋局编号无效');
        const game = replay(data.moves);
        if (game.result) throw Error('棋局已结束或暂停裁决');
        const result = await runSearch(fen(board(),'r'), data.settings, {
          moves: uciMoves(game.history), signal: controller.signal, gameId: data.gameId,
        });
        if (!legal(game.board, ...decode(result.move), game.turn)) {
          throw Error('引擎返回非法着法，已拒绝执行');
        }
        json(res,200,result);
        return;
      }

      const asset = req.url === '/' ? 'index.html' : req.url.slice(1);
      if (req.method !== 'GET' || !assets.has(asset)) {
        res.writeHead(404);
        res.end();
        return;
      }
      const type = asset.endsWith('.mjs') ? 'text/javascript' : asset.endsWith('.css') ? 'text/css' : 'text/html';
      res.setHeader('Content-Type', type + '; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.end(await readFile(new URL(asset,import.meta.url)));
    } catch (error) {
      json(res,400,{ error:error.message });
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createServer();
  server.on('error', error => {
    console.error(error.code === 'EADDRINUSE'
      ? '端口 3100 已被占用。若象棋服务已在运行，请打开 http://127.0.0.1:3100/。'
      : '象棋服务启动失败：'+error.message);
    process.exitCode=1;
  });
  for (const signal of ['SIGINT','SIGTERM']) {
    process.once(signal, () => {
      closeEngine();
      server.close();
    });
  }
  server.listen(3100,'127.0.0.1',() => {
    const url='http://127.0.0.1:3100/';
    console.log('中国象棋 '+url);
    if (process.platform === 'win32' && process.argv.includes('--open')) {
      try {
        const browser = spawn('explorer.exe',[url],{stdio:'ignore',windowsHide:true});
        browser.on('error',() => console.log('请在浏览器中打开 '+url));
        browser.unref();
      } catch {
        console.log('请在浏览器中打开 '+url);
      }
    }
  });
}
