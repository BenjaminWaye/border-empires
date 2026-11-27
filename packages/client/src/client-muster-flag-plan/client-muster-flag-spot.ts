// docs/launch-attack-flag-placement-plan.md §2–3: whether a manual attack
// would raise a brand new muster flag, and where the Launch Attack sheet
// suggests putting it. A flag on the firing tile -- what the attack used to
// raise automatically -- sits right on the border, where one enemy capture
// destroys the manpower staged on it; a spot a few tiles back is safer at the
// cost of a longer march to the front.
import { WORLD_HEIGHT, WORLD_WIDTH, wrapX, wrapY } from "@border-empires/shared";
import { MUSTER_FLAG_REQUEST_TIMEOUT_MS } from "../client-constants.js";
import { isFriendlyOwner } from "../client-hostile-muster-alerts/client-hostile-muster-alerts.js";
import { MUSTER_REMOTE_FUNDING_RADIUS_TILES, findClosestOwnedMusterTile } from "../client-muster-attack-gate/client-muster-attack-gate.js";
import { ownTileSiegeAt } from "../client-muster-siege/client-muster-siege.js";
import { clientMusterTransitRoute } from "../client-muster-transit-route/client-muster-transit-route.js";
import { chebyshevDistanceClient } from "../client-tile-action-support/client-tile-action-support.js";
import type { ClientState } from "../client-state/client-state.js";

type Point = { x: number; y: number };

/** A flag this many tiles (Chebyshev) or more from hostile ground counts as safe. */
export const FLAG_SAFE_DISTANCE_TILES = 3;

export type MusterFlagSpotKind = "safe" | "closer" | "border";

export type MusterFlagSpot = Point & {
  kind: MusterFlagSpotKind;
  /** Tiles to the nearest hostile tile; undefined when none is within FLAG_SAFE_DISTANCE_TILES. */
  enemyDistance: number | undefined;
  /** The company's march from this spot to the firing tile. */
  transitMs: number;
};

const keyAt = (x: number, y: number): string => `${wrapX(x, WORLD_WIDTH)},${wrapY(y, WORLD_HEIGHT)}`;

/** Flag tiles the player asked for that haven't appeared yet (SET_MUSTER has no ack). */
const pendingFlagPlacements = (state: ClientState, nowMs: number): Point[] => {
  const out: Point[] = [];
  for (const entry of state.pendingMusterAttacks) {
    if (entry.musterRequestedAt == null || nowMs - entry.musterRequestedAt > MUSTER_FLAG_REQUEST_TIMEOUT_MS) continue;
    if (state.tiles.get(entry.musterTileKey)?.muster?.ownerId === state.me) continue;
    const [x, y] = entry.musterTileKey.split(",").map(Number);
    if (Number.isFinite(x) && Number.isFinite(y)) out.push({ x: x!, y: y! });
  }
  return out;
};

/**
 * True when an attack fired from `origin` on `target` would raise a brand new
 * flag -- the only case the placement step is shown. False when a flag the
 * attack would reuse already exists (on the firing tile, touching the target,
 * or within funding range of the firing tile), when one is still being
 * placed within that range, or when the player is at the flag cap (the
 * attack then explains "Muster flags full" as before).
 */
export const attackNeedsNewMusterFlag = (state: ClientState, origin: Point, target: Point, nowMs = Date.now()): boolean => {
  if (state.tiles.get(keyAt(origin.x, origin.y))?.muster?.ownerId === state.me) return false;
  if (findClosestOwnedMusterTile(state, origin.x, origin.y, target.x, target.y)) return false;
  const pending = pendingFlagPlacements(state, nowMs);
  if (pending.some((p) => chebyshevDistanceClient(p.x, p.y, origin.x, origin.y) <= MUSTER_REMOTE_FUNDING_RADIUS_TILES)) return false;
  let flags = 0;
  for (const tile of state.tiles.values()) if (tile.muster?.ownerId === state.me) flags += 1;
  return flags + new Set(pending.map((p) => `${p.x},${p.y}`)).size < state.musterFlagLimit;
};

const enemyDistanceAt = (state: ClientState, x: number, y: number, nowMs: number): number | undefined => {
  for (let ring = 1; ring < FLAG_SAFE_DISTANCE_TILES; ring += 1) {
    for (let dy = -ring; dy <= ring; dy += 1) {
      for (let dx = -ring; dx <= ring; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const ownerId = state.tiles.get(keyAt(x + dx, y + dy))?.ownerId;
        if (ownerId !== undefined && !isFriendlyOwner(state, ownerId, nowMs)) return ring;
      }
    }
  }
  return undefined;
};

// fromOrigin is the Chebyshev distance to the firing tile. Ties go to the
// tile most directly behind it, away from the target: furthest along that
// direction (`behind`), then nearest the line (`offLine`).
type Candidate = Point & { enemyDistance: number | undefined; fromOrigin: number; behind: number; offLine: number; transitMs?: number };

/** Larger is safer: no hostile tile within the search radius beats any known distance. */
const safety = (c: Candidate): number => c.enemyDistance ?? FLAG_SAFE_DISTANCE_TILES;

const nearestFirst = (a: Candidate, b: Candidate): number =>
  a.fromOrigin - b.fromOrigin || safety(b) - safety(a) || b.behind - a.behind || a.offLine - b.offLine || a.x - b.x || a.y - b.y;

/** Signed shortest offset from `from` to `to` on a wrapped axis. */
const wrappedDelta = (from: number, to: number, size: number): number => {
  const d = (((to - from) % size) + size) % size;
  return d > size / 2 ? d - size : d;
};

/** Spots of one class considered for march time; the nearest few by distance. */
const TRANSIT_CANDIDATES = 6;

const transitOf = (state: ClientState, c: Candidate, origin: Point): number => {
  c.transitMs ??= clientMusterTransitRoute(state, c, origin).transitMs;
  return c.transitMs;
};

/**
 * The best spot among `pool`: of the nearest few, the one whose company
 * reaches the firing tile soonest (so a tile across a strait, which marches
 * through a dock, loses to one on the same shore), ties by nearestFirst.
 */
const quickestNear = (state: ClientState, pool: Candidate[], origin: Point): Candidate | undefined =>
  pool
    .sort(nearestFirst)
    .slice(0, TRANSIT_CANDIDATES)
    .sort((a, b) => transitOf(state, a, origin) - transitOf(state, b, origin) || nearestFirst(a, b))[0];

/**
 * Where the Launch Attack sheet offers to raise the new flag for an attack
 * fired from `origin` on `target`, default first: a safe tile (at least
 * FLAG_SAFE_DISTANCE_TILES from hostile ground; the safest tiles in range
 * when none is that far), a closer tile when one sits between, and the firing
 * tile itself. Within each class, the nearest few tiles (directly behind the
 * firing tile on a tie) are compared by real march time, so a tile reached
 * only through a dock loses to one on the same shore. Every spot is the
 * player's own unbesieged land without a flag, within the server's
 * remote-funding radius of the firing tile, so the new flag can fund the
 * attack from where it stands.
 */
export const musterFlagSpotChoices = (state: ClientState, origin: Point, nowMs = Date.now(), target?: Point): MusterFlagSpot[] => {
  const candidates: Candidate[] = [];
  // Direction from the target to the firing tile: "behind" the front.
  const awayX = target ? Math.sign(wrappedDelta(target.x, origin.x, WORLD_WIDTH)) : 0;
  const awayY = target ? Math.sign(wrappedDelta(target.y, origin.y, WORLD_HEIGHT)) : 0;
  const radius = MUSTER_REMOTE_FUNDING_RADIUS_TILES;
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const tile = state.tiles.get(keyAt(origin.x + dx, origin.y + dy));
      if (!tile || tile.ownerId !== state.me || tile.terrain !== "LAND" || tile.muster) continue;
      if (ownTileSiegeAt(state, tile.x, tile.y, nowMs)) continue;
      candidates.push({
        x: tile.x,
        y: tile.y,
        enemyDistance: enemyDistanceAt(state, tile.x, tile.y, nowMs),
        fromOrigin: Math.max(Math.abs(dx), Math.abs(dy)),
        behind: dx * awayX + dy * awayY,
        offLine: awayX === 0 && awayY === 0 ? dx * dx + dy * dy : Math.abs(dx * awayY - dy * awayX)
      });
    }
  }
  const picks: Array<{ c: Candidate; kind: MusterFlagSpotKind }> = [];
  const originCandidate: Candidate = {
    x: origin.x,
    y: origin.y,
    enemyDistance: enemyDistanceAt(state, origin.x, origin.y, nowMs),
    fromOrigin: 0,
    behind: 0,
    offLine: 0,
    transitMs: 0
  };
  const topSafety = Math.max(...candidates.map(safety));
  const safest = topSafety > safety(originCandidate) ? quickestNear(state, candidates.filter((c) => safety(c) === topSafety), origin) : undefined;
  if (safest) picks.push({ c: safest, kind: "safe" });
  const closer = quickestNear(
    state,
    candidates.filter((c) => safety(c) > safety(originCandidate) && (!safest || safety(c) < safety(safest))),
    origin
  );
  if (closer) picks.push({ c: closer, kind: "closer" });
  picks.push({ c: originCandidate, kind: "border" });
  return picks.map(({ c, kind }) => ({
    x: c.x,
    y: c.y,
    kind,
    enemyDistance: c.enemyDistance,
    transitMs: transitOf(state, c, origin)
  }));
};
