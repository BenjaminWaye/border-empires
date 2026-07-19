import { CHUNK_SIZE } from "@border-empires/shared";
import { CAMERA_LOCATION_STORAGE_KEY } from "./client-constants.js";
import { effectiveFogDisabled } from "./client-map-reveal/client-map-reveal.js";
import type { RealtimeSocket } from "./client-socket-types.js";
import { storageSet, type ClientState } from "./client-state/client-state.js";

// Persists the player's last-viewed map location so a reload/reconnect (or a
// fresh login on the same browser) drops them back where they were instead
// of always re-centering on their empire. Best-effort: storage failures are
// swallowed by storageSet.
export const saveCameraLocation = (state: Pick<ClientState, "camX" | "camY" | "zoom">): void => {
  storageSet(CAMERA_LOCATION_STORAGE_KEY, JSON.stringify({ x: state.camX, y: state.camY, zoom: state.zoom }));
};

const CAMERA_SAVE_THROTTLE_MS = 1_000;
// Module-local throttle timer, not ClientState — this is a pure
// implementation detail of maybeSaveCameraLocation()'s debounce, not
// meaningful application state anything else needs to read/reset/persist.
let lastCameraSaveAt = 0;

// Deliberately independent of the chunk-subscribe cooldown in
// requestViewRefresh(): that logic only progresses once the camera crosses a
// full CHUNK_SIZE (64-tile) boundary, which an ordinary pan/zoom near the
// player's base routinely never does. Saving the last-viewed location should
// happen far more often than that, so this has its own lightweight,
// unconditional (not gated on auth/socket/queued-action state) time-based
// throttle instead of piggybacking on the subscribe gate.
export const maybeSaveCameraLocation = (state: Pick<ClientState, "camX" | "camY" | "zoom">): void => {
  const now = Date.now();
  if (now - lastCameraSaveAt < CAMERA_SAVE_THROTTLE_MS) return;
  lastCameraSaveAt = now;
  saveCameraLocation(state);
};

export const resetCameraSaveThrottleForTests = (): void => {
  lastCameraSaveAt = 0;
};

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
    | "authSessionReady"
    | "fogDisabled"
    | "mapRevealEnabled"
    | "camX"
    | "camY"
    | "zoom"
    | "lastSubCx"
    | "lastSubCy"
    | "lastSubRadius"
    | "lastSubAt"
    | "firstChunkAt"
  >,
  deps: {
    ws: RealtimeSocket;
    fullMapChunkRadius: number;
    radius?: number;
    force?: boolean;
  }
): void => {
  if (deps.ws.readyState !== deps.ws.OPEN) return;
  if (!state.authSessionReady) return;
  const effectiveRadius = effectiveFogDisabled(state) ? deps.fullMapChunkRadius : deps.radius ?? 2;
  const cx = Math.floor(state.camX / CHUNK_SIZE);
  const cy = Math.floor(state.camY / CHUNK_SIZE);
  const elapsed = Date.now() - state.lastSubAt;
  const sameSub = cx === state.lastSubCx && cy === state.lastSubCy && effectiveRadius === state.lastSubRadius;
  const stillWaitingForInitialChunks = state.firstChunkAt === 0;
  const forcedRetryCooldownMs = stillWaitingForInitialChunks ? 8_000 : 30_000;
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
  state: Pick<
    ClientState,
    "authSessionReady" | "camX" | "camY" | "zoom" | "lastSubCx" | "lastSubCy" | "actionInFlight" | "capture" | "actionQueue"
  >,
  deps: {
    ws: RealtimeSocket;
    requestViewRefresh: (radius?: number, force?: boolean) => void;
    force?: boolean;
  }
): void => {
  // Runs every call regardless of auth/socket/queued-action state below —
  // it's a pure local write, and this is called every render frame (see
  // client-runtime-loop.ts) plus every pan/zoom input event, so it's the
  // one place that reliably observes camera changes independent of whether
  // a chunk-subscribe network round trip is happening.
  maybeSaveCameraLocation(state);
  if (deps.ws.readyState !== deps.ws.OPEN) return;
  if (!state.authSessionReady) return;
  if (!deps.force && (state.actionInFlight || state.capture || state.actionQueue.length > 0)) return;
  const cx = Math.floor(state.camX / CHUNK_SIZE);
  const cy = Math.floor(state.camY / CHUNK_SIZE);
  const chunkChanged = cx !== state.lastSubCx || cy !== state.lastSubCy;
  if (deps.force || chunkChanged) deps.requestViewRefresh();
};
