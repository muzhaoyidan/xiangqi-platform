import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const bundled = fileURLToPath(new URL('./engine/Pikafish-Windows-x86-64-universal.exe', import.meta.url));

function launch() {
  const path = process.env.PIKAFISH_PATH || bundled;
  if (!existsSync(path)) throw Error('Pikafish 未安装，请检查 PIKAFISH_PATH 与 NNUE 文件。');
  return spawn(path, [], { cwd: process.env.PIKAFISH_CWD || dirname(path), windowsHide: true });
}

const clamp = (value, fallback, min, max) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? Math.trunc(value) : fallback));

export class UciEngine {
  #child;
  #pending;
  #options = new Map();
  #applied = new Map();
  #queue = Promise.resolve();
  #gameId;

  constructor({ start = launch, startupMs = 10000, searchGraceMs = 3000, stopMs = 1000 } = {}) {
    Object.assign(this, { start, startupMs, searchGraceMs, stopMs });
  }

  search(fen, settings = {}, { moves = [], signal, gameId } = {}) {
    if (!/^[a-zA-Z1-9/]+ [wb] - - \d+ \d+$/.test(fen) ||
        !moves.every(move => /^[a-i][0-9][a-i][0-9]$/.test(move))) {
      return Promise.reject(Error('无效的 UCI 局面'));
    }
    const request = this.#queue.then(() => this.#search(fen, settings, moves, signal, gameId));
    this.#queue = request.catch(() => {});
    return request;
  }

  async #search(fen, settings, moves, signal, gameId) {
    signal?.throwIfAborted();
    if (!this.#child) await this.#connect();
    signal?.throwIfAborted();

    let needsReady = false;
    if (gameId !== this.#gameId) {
      this.#send('ucinewgame');
      this.#gameId = gameId;
      needsReady = true;
    }
    for (const [name, fallback, cap, key] of [
      ['Threads', 2, 64, 'threads'], ['Hash', 128, 1024, 'hash'],
    ]) {
      const bounds = this.#options.get(name);
      if (!bounds) continue;
      const value = clamp(settings?.[key], fallback, bounds[0], Math.min(bounds[1], cap));
      if (this.#applied.get(name) === value) continue;
      this.#send('setoption name ' + name + ' value ' + value);
      this.#applied.set(name, value);
      needsReady = true;
    }
    if (needsReady) await this.#exchange('isready', line => line === 'readyok', this.startupMs);
    signal?.throwIfAborted();

    const time = clamp(settings?.time, 3000, 50, 60000);
    const depth = clamp(settings?.depth, 0, 0, 128);
    this.#send('position fen ' + fen + (moves.length ? ' moves ' + moves.join(' ') : ''));
    let info = '';
    const best = await this.#exchange('go movetime ' + time + (depth ? ' depth ' + depth : ''), line => {
      if (line.startsWith('info depth ')) info = line;
      return line.startsWith('bestmove ');
    }, time + this.searchGraceMs, signal);
    return { move: best.split(/\s+/)[1], info, options: Object.fromEntries(this.#options) };
  }

  async #connect() {
    const child = this.start();
    this.#child = child;
    const fail = error => {
      if (this.#child === child) this.#reset(error);
    };
    child.once('error', fail);
    child.once('exit', () => fail(Error('Pikafish 异常退出，可重试搜索。')));
    child.stdin.on('error', fail);
    child.stderr?.resume();
    const lines = createInterface({ input: child.stdout });
    lines.on('line', line => {
      if (this.#child !== child) return;
      const option = line.match(/^option name (.+?) type spin default \S+ min (\d+) max (\d+)/);
      if (option) this.#options.set(option[1], [+option[2], +option[3]]);
      if (line.startsWith('info string CRITICAL ERROR')) return fail(Error(line));
      this.#pending?.onLine(line);
    });
    await this.#exchange('uci', line => line === 'uciok', this.startupMs);
    await this.#exchange('isready', line => line === 'readyok', this.startupMs);
  }

  #send(command) {
    if (!this.#child) throw Error('Pikafish 进程已断开');
    this.#child.stdin.write(command + '\n');
  }

  #exchange(command, matches, timeout, signal) {
    return new Promise((resolve, reject) => {
      let stopped = false;
      let timer;
      const finish = (error, line) => {
        this.#pending = undefined;
        clearTimeout(timer);
        signal?.removeEventListener('abort', stop);
        if (error) reject(error);
        else resolve(line);
      };
      const stop = () => {
        if (stopped) return;
        stopped = true;
        clearTimeout(timer);
        timer = setTimeout(() => this.#reset(signal.reason), this.stopMs);
        try { this.#send('stop'); } catch (error) { this.#reset(error); }
      };
      this.#pending = {
        reject: finish,
        onLine: line => {
          if (matches(line)) finish(stopped ? signal.reason : null, line);
        },
      };
      timer = setTimeout(() => this.#reset(Error('Pikafish 搜索或握手超时，可重试。')), timeout);
      if (signal?.aborted) return finish(signal.reason);
      signal?.addEventListener('abort', stop, { once: true });
      try { this.#send(command); } catch (error) { this.#reset(error); }
    });
  }

  #reset(error) {
    const child = this.#child;
    this.#child = undefined;
    this.#options.clear();
    this.#applied.clear();
    this.#gameId = undefined;
    this.#pending?.reject(error);
    child?.kill();
  }

  close() { this.#reset(Error('Pikafish 已关闭')); }
}

const engine = new UciEngine();
export const search = (...args) => engine.search(...args);
export const closeEngine = () => engine.close();
