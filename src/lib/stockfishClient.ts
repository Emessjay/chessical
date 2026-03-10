import engineJsUrl from "stockfish/bin/stockfish-18-lite-single.js?url";
import engineWasmUrl from "stockfish/bin/stockfish-18-lite-single.wasm?url";

export type StockfishScore =
  | { type: "cp"; value: number }
  | { type: "mate"; value: number };

export interface StockfishInfo {
  depth?: number;
  seldepth?: number;
  multipv?: number;
  nodes?: number;
  nps?: number;
  timeMs?: number;
  score?: StockfishScore;
  pv?: string[];
  raw?: string;
}

export interface StockfishBestMove {
  bestmove: string;
  ponder?: string;
}

type EngineWorker = Worker;

function parseUciInfo(line: string): StockfishInfo | null {
  if (!line.startsWith("info ")) return null;
  const tokens = line.trim().split(/\s+/);

  const info: StockfishInfo = { raw: line };
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    const next = () => (i + 1 < tokens.length ? tokens[i + 1] : undefined);

    if (t === "depth" && next()) {
      info.depth = Number(next());
      i++;
      continue;
    }
    if (t === "seldepth" && next()) {
      info.seldepth = Number(next());
      i++;
      continue;
    }
    if (t === "multipv" && next()) {
      info.multipv = Number(next());
      i++;
      continue;
    }
    if (t === "nodes" && next()) {
      info.nodes = Number(next());
      i++;
      continue;
    }
    if (t === "nps" && next()) {
      info.nps = Number(next());
      i++;
      continue;
    }
    if (t === "time" && next()) {
      info.timeMs = Number(next());
      i++;
      continue;
    }
    if (t === "score" && tokens[i + 2] && tokens[i + 3]) {
      const scoreType = tokens[i + 1];
      const scoreValue = Number(tokens[i + 2]);
      if (scoreType === "cp" && Number.isFinite(scoreValue)) {
        info.score = { type: "cp", value: scoreValue };
      } else if (scoreType === "mate" && Number.isFinite(scoreValue)) {
        info.score = { type: "mate", value: scoreValue };
      }
      i += 2;
      continue;
    }
    if (t === "pv") {
      info.pv = tokens.slice(i + 1);
      break;
    }
  }

  return info;
}

function parseBestMove(line: string): StockfishBestMove | null {
  if (!line.startsWith("bestmove ")) return null;
  const tokens = line.trim().split(/\s+/);
  const bestmove = tokens[1];
  if (!bestmove) return null;
  const ponderIdx = tokens.indexOf("ponder");
  const ponder = ponderIdx >= 0 ? tokens[ponderIdx + 1] : undefined;
  return { bestmove, ponder };
}

export class StockfishClient {
  private worker: EngineWorker;
  private ready = false;
  private destroyed = false;
  private listeners = new Set<(line: string) => void>();
  private initError: Error | null = null;

  constructor() {
    const workerUrl = `${engineJsUrl}#${encodeURIComponent(engineWasmUrl)},worker`;
    this.worker = new Worker(workerUrl);
    this.worker.onmessage = (ev: MessageEvent<string>) => {
      const line = String(ev.data ?? "");
      for (const cb of this.listeners) cb(line);
      if (line === "uciok") {
        this.ready = true;
      }
    };
    this.worker.onerror = (ev) => {
      const message =
        ev instanceof ErrorEvent
          ? ev.message
          : typeof (ev as unknown as { message?: string }).message === "string"
            ? String((ev as unknown as { message?: string }).message)
            : "Unknown worker error";
      this.initError = new Error(`Stockfish worker failed to load: ${message}`);
    };
    // Some runtimes surface load/wasm issues as an "error" event on the worker itself.
    // Keep this separate from UCI parsing so init() can fail fast with a meaningful message.
    this.worker.addEventListener("error", () => {
      if (!this.initError) {
        this.initError = new Error("Stockfish worker failed to load");
      }
    });
  }

  onLine(cb: (line: string) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  post(cmd: string) {
    if (this.destroyed) return;
    this.worker.postMessage(cmd);
  }

  async init(): Promise<void> {
    if (this.destroyed) return;
    if (this.ready) return;
    if (this.initError) throw this.initError;

    await new Promise<void>((resolve, reject) => {
      let done = false;
      const timeout = setTimeout(() => {
        if (done) return;
        done = true;
        off();
        reject(this.initError ?? new Error("Stockfish init timeout"));
      }, 20000);

      const off = this.onLine((line) => {
        if (line === "uciok") {
          if (done) return;
          done = true;
          clearTimeout(timeout);
          off();
          resolve();
        }
      });

      this.post("uci");
    });

    await this.isReady();
  }

  async isReady(): Promise<void> {
    if (this.destroyed) return;
    if (this.initError) throw this.initError;
    await new Promise<void>((resolve, reject) => {
      let done = false;
      const timeout = setTimeout(() => {
        if (done) return;
        done = true;
        off();
        reject(this.initError ?? new Error("Stockfish isready timeout"));
      }, 20000);

      const off = this.onLine((line) => {
        if (line === "readyok") {
          if (done) return;
          done = true;
          clearTimeout(timeout);
          off();
          resolve();
        }
      });

      this.post("isready");
    });
  }

  stop() {
    this.post("stop");
  }

  async analyzePosition(
    fen: string,
    opts: { depth?: number } = {}
  ): Promise<{
    onInfo: (cb: (info: StockfishInfo) => void) => () => void;
    done: Promise<{ bestMove: StockfishBestMove | null; lastInfo: StockfishInfo | null }>;
    stop: () => void;
  }> {
    await this.init();

    const depth = opts.depth ?? 14;
    let lastInfo: StockfishInfo | null = null;
    let bestMove: StockfishBestMove | null = null;
    const infoListeners = new Set<(info: StockfishInfo) => void>();

    const off = this.onLine((line) => {
      const info = parseUciInfo(line);
      if (info) {
        lastInfo = info;
        for (const cb of infoListeners) cb(info);
        return;
      }
      const bm = parseBestMove(line);
      if (bm) {
        bestMove = bm;
      }
    });

    // Fresh analysis
    this.post("stop");
    this.post("ucinewgame");
    this.post(`position fen ${fen}`);
    this.post(`go depth ${depth}`);

    const done = new Promise<{
      bestMove: StockfishBestMove | null;
      lastInfo: StockfishInfo | null;
    }>((resolve) => {
      const offBest = this.onLine((line) => {
        if (line.startsWith("bestmove ")) {
          offBest();
          off();
          resolve({ bestMove, lastInfo });
        }
      });
    });

    return {
      onInfo: (cb) => {
        infoListeners.add(cb);
        return () => infoListeners.delete(cb);
      },
      done,
      stop: () => {
        this.post("stop");
      },
    };
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    try {
      this.worker.terminate();
    } catch {
      // ignore
    }
    this.listeners.clear();
  }
}

