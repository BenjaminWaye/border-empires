import { CHUNK_SIZE } from "@border-empires/shared";
import { CAMERA_LOCATION_STORAGE_KEY } from "./client-constants.js";
import { effectiveFogDisabled } from "./client-map-reveal/client-map-reveal.js";
import type { RealtimeSocket } from "./client-socket-types.js";
import { storageSet, type ClientState } from "./client-state/client-state.js";
import { maybeSaveDiscoveredTiles } from "./client-state/client-discovered-tiles-storage.js";
import { recordClientDebugEvent } from "./client-debug/client-debug.js";

// Persists the player's last-viewed map location so a reload/reconnect (or a
// fresh login on the same browser) drops them back where they were instead
// of always re-centering on their empire. Best-effort: storage failures are
// swallowed by storageSet. bridgeDebugSeasonId is tagged onto the saved
// payload (when known) so a later fresh page load can tell whether the
// restored position still belongs to the current season — see
// cameraLocationInitialState() and the INIT handler in
// client-network-init-message.ts for why that's needed.
export const saveCameraLocation = (state: Pick<ClientState, "camX" | "camY" | "zoom"> & { bridgeDebugSeasonId?: string | undefined }): void => {
  storageSet(
    CAMERA_LOCATION_STORAGE_KEY,
    JSON.stringify({ x: state.camX, y: state.camY, zoom: state.zoom, seasonId: state.bridgeDebugSeasonId || undefined })
  );
};

// Removes the persisted camera location so the next page load starts at the
// default position instead of restoring stale coordinates from a previous
// season. Called on SEASON_ROLLOVER so the player doesn't land on darkness.
// Also cancels any pending camera save to prevent a race condition where a
// scheduled save could re-persist the old coordinates after this clears them.
export const clearCameraLocation = (): void => {
  // Cancel any pending save that might fire after we clear localStorage
  if (pendingSaveTask !== undefined) {
    if (typeof cancelIdleCallback === "function") {
      cancelIdleCallback(pendingSaveTask);
    } else {
      clearTimeout(pendingSaveTask);
    }
    pendingSaveTask = undefined;
  }
  // Reset throttle so even if a save was in progress, future saves restart fresh
  lastCameraSaveAt = 0;
  try {
    window.localStorage.removeItem(CAMERA_LOCATION_STORAGE_KEY);
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
};

const CAMERA_SAVE_THROTTLE_MS = 1_000;
// Module-local throttle timer, not ClientState — this is a pure
// implementation detail of maybeSaveCameraLocation()'s debounce, not
// meaningful application state anything else needs to read/reset/persist.
let lastCameraSaveAt = 0;

// requestAnimationFrame callback (client-runtime-loop.ts) — synchronous
// localStorage.setItem() there directly extends that frame's render time,
// which showed up as visible pan/zoom jank once per throttle window (a real
// player report). requestIdleCallback moves the actual write off the render
// frame entirely; setTimeout is the fallback for environments without it
// (older Safari, and Node in tests).
let pendingSaveTask: number | undefined;
const scheduleOffFrame: (task: () => void) => void =
  typeof requestIdleCallback === "function"
    ? (task) => {
        pendingSaveTask = requestIdleCallback(task, { timeout: 500 }) as unknown as number;
      }
    : (task) => {
        pendingSaveTask = setTimeout(task, 0) as unknown as number;
      };

// Deliberately independent of the chunk-subscribe cooldown in
// requestViewRefresh(): that logic only progresses once the camera crosses a
// full CHUNK_SIZE (64-tile) boundary, which an ordinary pan/zoom near the
// player's base routinely never does. Saving the last-viewed location should
// happen far more often than that, so this has its own lightweight,
// unconditional (not gated on auth/socket/queued-action state) time-based
// throttle instead of piggybacking on the subscribe gate.
export const maybeSaveCameraLocation = (state: Pick<ClientState, "camX" | "camY" | "zoom"> & { bridgeDebugSeasonId?: string | undefined }): void => {
  const now = Date.now();
  if (now - lastCameraSaveAt < CAMERA_SAVE_THROTTLE_MS) return;
  lastCameraSaveAt = now;
  // Snapshot now — this runs inside the render loop's rAF callback, and by
  // the time the idle callback fires the caller's `state` object may have
  // moved on to a newer camera position than what triggered this save.
  const snapshot = { camX: state.camX, camY: state.camY, zoom: state.zoom, bridgeDebugSeasonId: state.bridgeDebugSeasonId };
  scheduleOffFrame(() => saveCameraLocation(snapshot));
};

export const resetCameraSaveThrottleForTests = (): void => {
  lastCameraSaveAt = 0;
};

export const centerOnOwnedTile = (state: Pick<ClientState, "tiles" | "me" | "homeTile" | "camX" | "camY" | "camSubX" | "camSubY">): void => {
  const own = [...state.tiles.values()].find((tile) => tile.ownerId === state.me);
  if (own) {
    state.camX = own.x;
    state.camY = own.y;
    state.camSubX = 0;
    state.camSubY = 0;
    return;
  }
  if (state.homeTile) {
    state.camX = state.homeTile.x;
    state.camY = state.homeTile.y;
    state.camSubX = 0;
    state.camSubY = 0;
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
  // Unconditional (not gated behind a debug flag): this is the one place
  // that decides whether the client asks the server for more map data, and
  // a stuck/black-map report needs to show whether a request was actually
  // sent, suppressed by the cooldown, or never attempted at all.
  if (deps.ws.readyState !== deps.ws.OPEN) {
    recordClientDebugEvent("info", "chunk-sync", "subscribe-skipped", { reason: "ws-not-open", readyState: deps.ws.readyState });
    return;
  }
  if (!state.authSessionReady) {
    recordClientDebugEvent("info", "chunk-sync", "subscribe-skipped", { reason: "auth-session-not-ready" });
    return;
  }
  const effectiveRadius = effectiveFogDisabled(state) ? deps.fullMapChunkRadius : deps.radius ?? 2;
  const cx = Math.floor(state.camX / CHUNK_SIZE);
  const cy = Math.floor(state.camY / CHUNK_SIZE);
  const elapsed = Date.now() - state.lastSubAt;
  const sameSub = cx === state.lastSubCx && cy === state.lastSubCy && effectiveRadius === state.lastSubRadius;
  const stillWaitingForInitialChunks = state.firstChunkAt === 0;
  const forcedRetryCooldownMs = stillWaitingForInitialChunks ? 8_000 : 30_000;
  const normalRefreshCooldownMs = 700;
  if (sameSub) {
    if (!deps.force && elapsed < normalRefreshCooldownMs) {
      recordClientDebugEvent("info", "chunk-sync", "subscribe-suppressed", { cx, cy, radius: effectiveRadius, elapsed, cooldownMs: normalRefreshCooldownMs, force: false });
      return;
    }
    if (deps.force && elapsed < forcedRetryCooldownMs) {
      recordClientDebugEvent("info", "chunk-sync", "subscribe-suppressed", { cx, cy, radius: effectiveRadius, elapsed, cooldownMs: forcedRetryCooldownMs, force: true });
      return;
    }
  }
  state.lastSubCx = cx;
  state.lastSubCy = cy;
  state.lastSubRadius = effectiveRadius;
  state.lastSubAt = Date.now();
  recordClientDebugEvent("info", "chunk-sync", "subscribe-sent", { cx, cy, radius: effectiveRadius, force: Boolean(deps.force) });
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
    | "authSessionReady"
    | "camX"
    | "camY"
    | "zoom"
    | "lastSubCx"
    | "lastSubCy"
    | "actionInFlight"
    | "capture"
    | "actionQueue"
    | "me"
    | "discoveredTiles"
    | "discoveredDockTiles"
  > & { bridgeDebugSeasonId?: string | undefined },
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
  // Same rationale for discoveredTiles: throttled write-through so a hard
  // refresh has something recent to restore from (see
  // client-network-init-message.ts's INIT handler and
  // client-discovered-tiles-storage.ts).
  maybeSaveDiscoveredTiles(state);
  if (deps.ws.readyState !== deps.ws.OPEN) return;
  if (!state.authSessionReady) return;
  if (!deps.force && (state.actionInFlight || state.capture || state.actionQueue.length > 0)) return;
  const cx = Math.floor(state.camX / CHUNK_SIZE);
  const cy = Math.floor(state.camY / CHUNK_SIZE);
  const chunkChanged = cx !== state.lastSubCx || cy !== state.lastSubCy;
  if (deps.force || chunkChanged) deps.requestViewRefresh();
};
