import { Worker } from "node:worker_threads";

import type { Tile } from "@border-empires/shared";

import type { ChunkSummaryMode } from "../chunk/snapshots.js";
import type { ChunkReadEntry, ChunkReadMode, ChunkReadRequest, ChunkReadWorkerResponse } from "./chunk-read-shared.js";

type CreateChunkReadManagerDeps = {
  enabled: boolean;
  now: () => number;
  chunkCountX: number;
  chunkCountY: number;
  onError: (message: string, err: unknown) => void;
  loadChunkTilesLocal: (cx: number, cy: number, mode: ChunkSummaryMode) => readonly Tile[];
};

type ChunkReadInflight = {
  startedAt: number;
  resolve: (chunks: Tile[][]) => void;
  reject: (err: unknown) => void;
};

export type ChunkReadWorkerState = {
  available: boolean;
  crashed: boolean;
  pending: number;
  lastRoundTripMs: number;
  lastUsedWorker: boolean;
  hydrated: boolean;
};

const HOT_PATH_MODES: ChunkReadMode[] = ["thin", "shell"];

export const createChunkReadManager = (deps: CreateChunkReadManagerDeps): {
  state: ChunkReadWorkerState;
  hydrateAll: () => Promise<void>;
  markChunkDirty: (cx: number, cy: number) => Promise<void>;
  loadBatch: (requests: ChunkReadRequest[]) => Promise<readonly Tile[][]>;
} => {
  const state: ChunkReadWorkerState = {
    available: false,
    crashed: false,
    pending: 0,
    lastRoundTripMs: 0,
    lastUsedWorker: false,
    hydrated: false
  };

  let worker: Worker | undefined;
  let nextRequestId = 0;
  const inflight = new Map<number, ChunkReadInflight>();
  let pendingHydrationResolves: Array<() => void> = [];
  let pendingHydrationRejects: Array<(err: unknown) => void> = [];

  const fallbackBatch = async (requests: ChunkReadRequest[]): Promise<readonly Tile[][]> => {
    state.lastUsedWorker = false;
    return requests.map((request) => [...deps.loadChunkTilesLocal(request.cx, request.cy, request.mode)]);
  };

  const clearInflight = (reason: string): void => {
    for (const [id, entry] of inflight.entries()) {
      inflight.delete(id);
      entry.reject(new Error(reason));
    }
    state.pending = 0;
  };

  const clearPendingHydrations = (err: unknown): void => {
    const rejects = pendingHydrationRejects;
    pendingHydrationResolves = [];
    pendingHydrationRejects = [];
    for (const reject of rejects) reject(err);
  };

  const ensureWorker = (): Worker | undefined => {
    if (!deps.enabled) return undefined;
    if (worker) return worker;
    try {
      const created = new Worker(new URL("./chunk-read-worker.js", import.meta.url));
      created.on("message", (message: ChunkReadWorkerResponse) => {
        if (message.type === "ready") {
          state.available = true;
          state.hydrated = true;
          const resolves = pendingHydrationResolves;
          pendingHydrationResolves = [];
          pendingHydrationRejects = [];
          for (const resolve of resolves) resolve();
          return;
        }
        const entry = inflight.get(message.id);
        if (!entry) return;
        inflight.delete(message.id);
        state.pending = inflight.size;
        state.lastRoundTripMs = deps.now() - entry.startedAt;
        state.lastUsedWorker = true;
        entry.resolve(message.chunks);
      });
      created.on("error", (err) => {
        state.available = false;
        state.crashed = true;
        state.hydrated = false;
        worker = undefined;
        clearInflight("chunk read worker crashed");
        clearPendingHydrations(new Error("chunk read worker crashed"));
        deps.onError("chunk read worker crashed", err);
      });
      created.on("exit", (code) => {
        state.available = false;
        worker = undefined;
        if (code !== 0) {
          state.crashed = true;
          state.hydrated = false;
          clearInflight(`chunk read worker exited with code ${code}`);
          clearPendingHydrations(new Error(`chunk read worker exited with code ${code}`));
        }
      });
      worker = created;
      state.available = false;
      state.crashed = false;
      return worker;
    } catch (err) {
      state.available = false;
      state.crashed = true;
      deps.onError("failed to start chunk read worker", err);
      return undefined;
    }
  };

  const chunkEntriesFor = (cx: number, cy: number): ChunkReadEntry[] =>
    HOT_PATH_MODES.map((mode) => ({
      cx,
      cy,
      mode,
      tiles: [...deps.loadChunkTilesLocal(cx, cy, mode)]
    }));

  const postHydrate = async (chunks: ChunkReadEntry[]): Promise<void> => {
    const live = ensureWorker();
    if (!live) return;
    state.available = false;
    state.hydrated = false;
    await new Promise<void>((resolve, reject) => {
      pendingHydrationResolves.push(resolve);
      pendingHydrationRejects.push(reject);
      live.postMessage({
        type: "hydrate",
        chunks
      });
    });
  };

  return {
    state,
    hydrateAll: async () => {
      const chunks: ChunkReadEntry[] = [];
      for (let cy = 0; cy < deps.chunkCountY; cy += 1) {
        for (let cx = 0; cx < deps.chunkCountX; cx += 1) {
          chunks.push(...chunkEntriesFor(cx, cy));
        }
      }
      await postHydrate(chunks);
    },
    markChunkDirty: async (cx, cy) => {
      if (!state.hydrated) return;
      await postHydrate(chunkEntriesFor(cx, cy));
    },
    loadBatch: async (requests) => {
      const live = ensureWorker();
      if (!live || !state.hydrated) {
        return fallbackBatch(requests);
      }
      const id = ++nextRequestId;
      return new Promise<readonly Tile[][]>((resolve, reject) => {
        inflight.set(id, {
          startedAt: deps.now(),
          resolve,
          reject
        });
        state.pending = inflight.size;
        live.postMessage({
          type: "read",
          id,
          requests
        });
      }).catch(async (err) => {
        deps.onError("chunk read worker request failed", err);
        return fallbackBatch(requests);
      });
    }
  };
};
