import { CHUNK_SIZE, WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import type { WebSocket } from "ws";
import type { FetchTileDetailResult } from "../sim-client/sim-client.js";

export interface ViewportDetailSession {
  playerId?: string | undefined;
  fogDisabled: boolean;
}
export interface ViewportDetailDependencies {
  seasonForPlayer: (playerId: string) => { seasonId: string; status: string } | undefined;
  fetch: (playerId: string, x: number, y: number, fullVisibility: boolean, radius: number) => Promise<FetchTileDetailResult>;
  send: (socket: WebSocket, tiles: FetchTileDetailResult["tiles"]) => void;
  record: (outcome: string, fields: Record<string, string | number>) => void;
}
type View = { cx: number; cy: number };
type PendingView = { view: View; key: string; seasonId: string };
type SocketState = { playerId: string; lastView?: View; running: boolean; pending?: PendingView | undefined; delivered?: string | undefined };

// One in-flight viewport and one latest pending viewport per socket. No
// per-player full-world detail caches; old socket state is weakly held.
export const createViewportDetailLoader = (deps: ViewportDetailDependencies): {
  subscribe: (socket: WebSocket, session: ViewportDetailSession, view: View) => void;
  refresh: (socket: WebSocket, session: ViewportDetailSession) => void;
} => {
  const states = new WeakMap<WebSocket, SocketState>();
  const subscribe = (socket: WebSocket, session: ViewportDetailSession, view: View): void => {
    const playerId = session.playerId;
    if (!playerId) return;
    const season = deps.seasonForPlayer(playerId);
    if (!session.fogDisabled && season?.status !== "ended") return;
    if (!Number.isInteger(view.cx) || !Number.isInteger(view.cy) || view.cx < 0 || view.cy < 0 ||
        view.cx >= Math.ceil(WORLD_WIDTH / CHUNK_SIZE) || view.cy >= Math.ceil(WORLD_HEIGHT / CHUNK_SIZE)) return;
    const key = `${season?.seasonId ?? ""}:${view.cx}:${view.cy}`;
    const prior = states.get(socket);
    const state = prior?.playerId === playerId ? prior : { playerId, running: false };
    states.set(socket, state);
    state.lastView = view;
    if (state.delivered === key && season?.status === "ended") return;
    state.pending = { view, key, seasonId: season?.seasonId ?? "" };
    if (state.running) { deps.record("coalesced", { playerId }); return; }
    state.running = true;
    const pendingView = (): PendingView | undefined => state.pending;
    void (async () => {
      try {
        while (state.pending && socket.readyState === socket.OPEN && session.playerId === playerId) {
          const next = state.pending;
          state.pending = undefined;
          const startedAt = Date.now();
          // A 64-tile camera chunk plus 32 tiles of padding covers a typical
          // 50x50 viewport even at the chunk edge. Never honor full-map radii.
          const result = await deps.fetch(playerId, next.view.cx * CHUNK_SIZE + CHUNK_SIZE / 2,
            next.view.cy * CHUNK_SIZE + CHUNK_SIZE / 2, true, CHUNK_SIZE);
          const current = deps.seasonForPlayer(playerId);
          if (socket.readyState !== socket.OPEN || session.playerId !== playerId || states.get(socket) !== state ||
              current?.seasonId !== next.seasonId ||
              (!session.fogDisabled && current?.status !== "ended")) continue;
          const queued = pendingView();
          if (queued && queued.key !== next.key) continue;
          deps.send(socket, result.tiles);
          state.delivered = next.key;
          deps.record("sent", { playerId, tileCount: result.tiles.length, durationMs: Date.now() - startedAt });
        }
      } catch (error) {
        deps.record("failed", { playerId, error: error instanceof Error ? error.message : String(error) });
      } finally {
        state.running = false;
        const queued = pendingView();
        if (queued && socket.readyState === socket.OPEN && states.get(socket) === state) {
          state.pending = undefined;
          subscribe(socket, session, queued.view);
        }
      }
    })();
  };
  return {
    subscribe,
    refresh: (socket, session) => {
      const state = states.get(socket);
      if (!state?.lastView) return;
      state.delivered = undefined;
      subscribe(socket, session, state.lastView);
    }
  };
};
