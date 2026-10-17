import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import { isMapUnobstructed, type MapUnobstructedState } from "../client-map-unobstructed/client-map-unobstructed.js";
import {
  AFC_JOIN_DESCENT_MS,
  AFC_JOIN_DROP_DWELL_MS,
  AFC_JOIN_FALLBACK_REVEAL_MS,
  AFC_JOIN_MAX_AGE_MS,
  AFC_JOIN_TOTAL_MS
} from "./client-afc-join-drop-timeline.js";

// Join-time AFC drop controller (docs/manifest-afc-module-delivery-animation-plan.md,
// "Join drop"). Ticked once per frame from the runtime loop, before either
// renderer draws. It (1) arms when the viewer's own home AFC is freshly
// activated and not yet shown, hiding the real AFC; (2) starts the drop only
// once the map has been unobstructed for the dwell; (3) reveals the real AFC
// at touchdown; (4) persists "played" when the drop completes.

export type AfcJoinDropTickState = MapUnobstructedState &
  Pick<ClientState, "me" | "tiles" | "tilesRevision" | "connection" | "firstChunkAt" | "camX" | "camY" | "afcJoinDrop" | "afcJoinDropFxQueue">;

export type AfcJoinDropTickDeps = {
  readonly state: AfcJoinDropTickState;
  /** performance.now() */
  readonly nowMs: number;
  /** Date.now(); compared with the server-stamped AFC `activatedAt`. */
  readonly wallNowMs: number;
  readonly tabVisible: boolean;
  /** Half the number of tiles on screen along each axis. */
  readonly viewHalfExtentTiles: { readonly halfW: number; readonly halfH: number };
  readonly keyFor: (x: number, y: number) => string;
  readonly isSeen: (tipId: string) => boolean;
  readonly markSeen: (tipId: string) => void;
  /** Bumps the tile revision so the 3D renderer rebuilds (AFC hidden/revealed). */
  readonly onTileChanged: (x: number, y: number) => void;
  /** Fires once, the moment the landing animation starts (plays the rocket sound). */
  readonly onDropStart?: () => void;
};

/** Minimum gap between scans for a fresh AFC, and the longer gap once a drop has settled (a later fresh AFC is rare). */
const SCAN_INTERVAL_IDLE_MS = 250;
const SCAN_INTERVAL_DONE_MS = 5000;
const FX_QUEUE_CAP = 4;

export const afcJoinDropTipId = (activatedAt: number): string => `AFC_JOIN_DROP_${activatedAt}`;

const wrappedDelta = (from: number, to: number, size: number): number => {
  let d = (to - from) % size;
  if (d > size / 2) d -= size;
  if (d < -size / 2) d += size;
  return d;
};

/** Generous margin so the AFC counts as "on screen" only when comfortably inside the view. */
const ON_SCREEN_MARGIN = 0.8;

const isOnScreen = (deps: AfcJoinDropTickDeps, x: number, y: number): boolean => {
  const { state, viewHalfExtentTiles } = deps;
  return (
    Math.abs(wrappedDelta(state.camX, x, WORLD_WIDTH)) <= Math.max(2, viewHalfExtentTiles.halfW * ON_SCREEN_MARGIN) &&
    Math.abs(wrappedDelta(state.camY, y, WORLD_HEIGHT)) <= Math.max(2, viewHalfExtentTiles.halfH * ON_SCREEN_MARGIN)
  );
};

type FreshAfc = { readonly x: number; readonly y: number; readonly activatedAt: number; readonly identity: string };

const afcIdentity = (x: number, y: number, activatedAt: number): string => `${x},${y}:${activatedAt}`;

/** The viewer's own AFC at (x, y), if it is still there, as an identity comparable with drop.decidedFor. */
const ownAfcIdentityAt = (deps: AfcJoinDropTickDeps, x: number, y: number): string | undefined => {
  const afc = deps.state.tiles.get(deps.keyFor(x, y))?.afc;
  return afc && afc.ownerId === deps.state.me && afc.activatedAt !== undefined ? afcIdentity(x, y, afc.activatedAt) : undefined;
};

/** The viewer's newest own AFC activated within AFC_JOIN_MAX_AGE_MS. Scans every known tile -- the AFC is not necessarily on state.homeTile -- so the caller throttles it. */
const findFreshOwnAfc = (deps: AfcJoinDropTickDeps): FreshAfc | undefined => {
  const { state } = deps;
  if (!state.me) return undefined;
  let best: FreshAfc | undefined;
  for (const tile of state.tiles.values()) {
    const afc = tile.afc;
    if (!afc || afc.ownerId !== state.me || afc.activatedAt === undefined) continue;
    if (deps.wallNowMs - afc.activatedAt > AFC_JOIN_MAX_AGE_MS) continue;
    if (!best || afc.activatedAt > best.activatedAt) best = { x: tile.x, y: tile.y, activatedAt: afc.activatedAt, identity: afcIdentity(tile.x, tile.y, afc.activatedAt) };
  }
  return best;
};

const gateOpen = (deps: AfcJoinDropTickDeps, x: number, y: number): boolean =>
  deps.tabVisible &&
  deps.state.connection === "initialized" &&
  deps.state.firstChunkAt > 0 &&
  isMapUnobstructed(deps.state) &&
  isOnScreen(deps, x, y);

const finish = (deps: AfcJoinDropTickDeps, markPlayed: boolean): void => {
  const drop = deps.state.afcJoinDrop;
  const wasHidden = !drop.revealed;
  if (markPlayed && drop.tipId) deps.markSeen(drop.tipId);
  drop.phase = "done";
  drop.revealed = true;
  drop.gateOpenSince = 0;
  if (wasHidden) deps.onTileChanged(drop.x, drop.y);
};

export const tickAfcJoinDrop = (deps: AfcJoinDropTickDeps): void => {
  const { state, nowMs } = deps;
  const drop = state.afcJoinDrop;

  if (drop.phase === "waiting" || drop.phase === "playing") {
    // The AFC went away or was replaced (elimination respawn, new season):
    // stand down without animating; a later scan picks up the new one.
    if (ownAfcIdentityAt(deps, drop.x, drop.y) !== drop.decidedFor) {
      finish(deps, false);
      return;
    }
  }

  if (drop.phase === "idle" || drop.phase === "done") {
    if (state.tilesRevision === drop.scannedRevision) return;
    if (nowMs - drop.lastScanAt < (drop.phase === "idle" ? SCAN_INTERVAL_IDLE_MS : SCAN_INTERVAL_DONE_MS)) return;
    drop.scannedRevision = state.tilesRevision;
    drop.lastScanAt = nowMs;
    const fresh = findFreshOwnAfc(deps);
    if (!fresh || fresh.identity === drop.decidedFor) return;
    const tipId = afcJoinDropTipId(fresh.activatedAt);
    drop.decidedFor = fresh.identity;
    if (deps.isSeen(tipId)) {
      drop.phase = "done";
      return;
    }
    Object.assign(drop, {
      phase: "waiting", x: fresh.x, y: fresh.y, tipId, waitingSince: nowMs, gateOpenSince: 0, startedAt: 0, landsAt: 0, revealed: false
    });
    deps.onTileChanged(fresh.x, fresh.y);
    return;
  }

  if (drop.phase === "waiting") {
    if (gateOpen(deps, drop.x, drop.y)) {
      if (drop.gateOpenSince === 0) drop.gateOpenSince = nowMs;
      if (nowMs - drop.gateOpenSince >= AFC_JOIN_DROP_DWELL_MS) {
        drop.phase = "playing";
        drop.startedAt = nowMs;
        drop.landsAt = nowMs + AFC_JOIN_DESCENT_MS;
        state.afcJoinDropFxQueue.push({ x: drop.x, y: drop.y, queuedAt: nowMs });
        // Only the 3D renderer drains this; keep a 2D-only session from accumulating one entry per season/respawn.
        if (state.afcJoinDropFxQueue.length > FX_QUEUE_CAP) state.afcJoinDropFxQueue.shift();
        deps.onDropStart?.();
      }
    } else {
      drop.gateOpenSince = 0;
      if (deps.tabVisible && nowMs - drop.waitingSince >= AFC_JOIN_FALLBACK_REVEAL_MS) finish(deps, true);
    }
    return;
  }

  // playing
  if (!drop.revealed && nowMs >= drop.landsAt) {
    drop.revealed = true;
    deps.onTileChanged(drop.x, drop.y);
  }
  if (nowMs - drop.startedAt >= AFC_JOIN_TOTAL_MS) finish(deps, true);
};
