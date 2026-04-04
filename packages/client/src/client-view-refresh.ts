import { CHUNK_SIZE } from "@border-empires/shared";
import type { ClientState } from "./client-state.js";

export const centerOnOwnedTile = (state: Pick<ClientState, "tiles" | "me" | "homeTile" | "camX" | "camY">): void => {
  const own = [...state.tiles.values()].find((tile) => tile.ownerId === state.me);
  if (own) {
    state.camX = own.x;
    state.camY = own.y;
    return;
  }
  if (state.homeTile) {
    state.camX = state.homeTile.x;
    state.camY = state.homeTile.y;
  }
};

export const requestViewRefresh = (
  state: Pick<
    ClientState,
    "authSessionReady" | "fogDisabled" | "camX" | "camY" | "lastSubCx" | "lastSubCy" | "lastSubRadius" | "lastSubAt" | "firstChunkAt"
  >,
  deps: {
    ws: WebSocket;
    fullMapChunkRadius: number;
    radius?: number;
    force?: boolean;
  }
): void => {
  if (deps.ws.readyState !== deps.ws.OPEN) return;
  if (!state.authSessionReady) return;
  const effectiveRadius = state.fogDisabled ? deps.fullMapChunkRadius : deps.radius ?? 2;
  const cx = Math.floor(state.camX / CHUNK_SIZE);
  const cy = Math.floor(state.camY / CHUNK_SIZE);
  const elapsed = Date.now() - state.lastSubAt;
  const sameSub = cx === state.lastSubCx && cy === state.lastSubCy && effectiveRadius === state.lastSubRadius;
  const stillWaitingForInitialChunks = state.firstChunkAt === 0;
  const forcedRetryCooldownMs = stillWaitingForInitialChunks ? 1200 : 30_000;
  const normalRefreshCooldownMs = 700;
  if (sameSub) {
    if (!deps.force && elapsed < normalRefreshCooldownMs) return;
    if (deps.force && elapsed < forcedRetryCooldownMs) return;
  }
  state.lastSubCx = cx;
  state.lastSubCy = cy;
  state.lastSubRadius = effectiveRadius;
  state.lastSubAt = Date.now();
  deps.ws.send(
    JSON.stringify({
      type: "SUBSCRIBE_CHUNKS",
      cx,
      cy,
      radius: effectiveRadius
    })
  );
};

export const maybeRefreshForCamera = (
  state: Pick<ClientState, "authSessionReady" | "camX" | "camY" | "lastSubCx" | "lastSubCy" | "actionInFlight" | "capture" | "actionQueue">,
  deps: {
    ws: WebSocket;
    requestViewRefresh: (radius?: number, force?: boolean) => void;
    force?: boolean;
  }
): void => {
  if (deps.ws.readyState !== deps.ws.OPEN) return;
  if (!state.authSessionReady) return;
  if (!deps.force && (state.actionInFlight || state.capture || state.actionQueue.length > 0)) return;
  const cx = Math.floor(state.camX / CHUNK_SIZE);
  const cy = Math.floor(state.camY / CHUNK_SIZE);
  const chunkChanged = cx !== state.lastSubCx || cy !== state.lastSubCy;
  if (deps.force || chunkChanged) deps.requestViewRefresh();
};
