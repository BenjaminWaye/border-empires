import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";

// A hostile muster flag is "near your border" when one of your own tiles is
// within this many tiles of it (toroidal Chebyshev distance). Flags sit on
// their owner's land, so a flag this close is staging troops right next to
// you: an ADVANCE flag reaches MUSTER_ADVANCE_RANGE_STEPS, but alerting on
// that whole radius would flag every muster of a neighbouring empire and
// turn the alert into noise.
export const HOSTILE_MUSTER_BORDER_RADIUS_TILES = 4;

// How long a flag that dropped out of view (fogged, or briefly out of the
// streamed area) is still remembered as already announced, so it doesn't
// re-announce every time vision flickers.
export const HOSTILE_MUSTER_ANNOUNCE_MEMORY_MS = 5 * 60_000;
// Hard cap on remembered announcements, independent of the TTL above.
export const HOSTILE_MUSTER_ANNOUNCE_MAX_TRACKED = 256;

export type HostileMusterNearBorder = {
  x: number;
  y: number;
  ownerId: string;
  ownerName: string;
  mode: NonNullable<Tile["muster"]>["mode"];
  distanceTiles: number;
  // MARCH flags whose target is one of this player's own tiles.
  marchingOnUs: boolean;
};

export type HostileMusterAlertState = Pick<ClientState, "me" | "tiles"> &
  Partial<Pick<ClientState, "allies" | "activeTruces" | "playerNames">>;

const wrap = (value: number, dim: number): number => ((value % dim) + dim) % dim;

const ownsTile = (state: HostileMusterAlertState, x: number, y: number): boolean =>
  state.tiles.get(`${wrap(x, WORLD_WIDTH)},${wrap(y, WORLD_HEIGHT)}`)?.ownerId === state.me;

// Nearest own tile to (x, y), scanning outward ring by ring, or undefined
// when none is within the radius. At most (2r+1)^2 map lookups per flag.
const distanceToOwnTerritory = (state: HostileMusterAlertState, x: number, y: number, radius: number): number | undefined => {
  for (let ring = 1; ring <= radius; ring += 1) {
    for (let d = -ring; d <= ring; d += 1) {
      if (
        ownsTile(state, x + d, y - ring) ||
        ownsTile(state, x + d, y + ring) ||
        ownsTile(state, x - ring, y + d) ||
        ownsTile(state, x + ring, y + d)
      ) {
        return ring;
      }
    }
  }
  return undefined;
};

const isFriendlyOwner = (state: HostileMusterAlertState, ownerId: string): boolean =>
  ownerId === state.me ||
  Boolean(state.allies?.includes(ownerId)) ||
  Boolean(state.activeTruces?.some((truce) => truce.otherPlayerId === ownerId));

/**
 * The hostile muster flag on this tile, when it is close enough to the
 * player's own territory to warrant an alert. Allies and truce partners are
 * not hostile. A fogged tile's flag is stale, and so is one on a tile we own
 * (the sim clears a flag when its tile is captured), so both are ignored.
 */
export const hostileMusterNearBorder = (state: HostileMusterAlertState, tile: Tile): HostileMusterNearBorder | undefined => {
  const muster = tile.muster;
  if (!muster || !state.me || tile.fogged || tile.ownerId === state.me) return undefined;
  if (isFriendlyOwner(state, muster.ownerId)) return undefined;
  const distanceTiles = distanceToOwnTerritory(state, tile.x, tile.y, HOSTILE_MUSTER_BORDER_RADIUS_TILES);
  if (distanceTiles === undefined) return undefined;
  const marchingOnUs =
    muster.mode === "MARCH" && muster.targetX !== undefined && muster.targetY !== undefined && ownsTile(state, muster.targetX, muster.targetY);
  return {
    x: tile.x,
    y: tile.y,
    ownerId: muster.ownerId,
    ownerName: state.playerNames?.get(muster.ownerId) || "An enemy empire",
    mode: muster.mode,
    distanceTiles,
    marchingOnUs
  };
};

const tilesLabel = (distance: number): string => (distance <= 1 ? "right on your border" : `${distance} tiles from your border`);

export const hostileMusterDetail = (flag: HostileMusterNearBorder): string => {
  if (flag.marchingOnUs) return `${flag.ownerName}'s muster flag is marching on your land.`;
  if (flag.mode === "ADVANCE") return `${flag.ownerName}'s muster flag is set to Advance, ${tilesLabel(flag.distanceTiles)}.`;
  if (flag.mode === "MARCH") return `${flag.ownerName}'s muster flag is marching, ${tilesLabel(flag.distanceTiles)}.`;
  return `${flag.ownerName} is mustering troops ${tilesLabel(flag.distanceTiles)}.`;
};

const announceKey = (flag: HostileMusterNearBorder): string => `${flag.ownerId}@${flag.x},${flag.y}`;

const threatRank = (flag: HostileMusterNearBorder): number => (flag.marchingOnUs ? 0 : flag.mode === "HOLD" ? 2 : 1);

// One-time toast (state.captureAlert via showCaptureAlert) for flags that
// newly appeared near the border.
export type HostileMusterAnnouncement = {
  title: string;
  detail: string;
  tone: "error" | "warn";
  focus: { x: number; y: number };
};

export type HostileMusterAnnouncer = {
  /**
   * An announcement for flags not seen near the border before, or undefined
   * when nothing is new. nowMs is any monotonic clock (the frame's
   * performance.now()).
   */
  announce: (flags: readonly HostileMusterNearBorder[], nowMs: number) => HostileMusterAnnouncement | undefined;
  trackedCount: () => number;
};

export const createHostileMusterAnnouncer = (): HostileMusterAnnouncer => {
  const lastSeenAtByKey = new Map<string, number>();
  return {
    announce: (flags, nowMs) => {
      const fresh: HostileMusterNearBorder[] = [];
      for (const flag of flags) {
        const key = announceKey(flag);
        if (!lastSeenAtByKey.has(key)) fresh.push(flag);
        // Delete-then-set keeps Map insertion order = least recently seen first.
        lastSeenAtByKey.delete(key);
        lastSeenAtByKey.set(key, nowMs);
      }
      for (const [key, seenAt] of lastSeenAtByKey) {
        if (nowMs - seenAt <= HOSTILE_MUSTER_ANNOUNCE_MEMORY_MS && lastSeenAtByKey.size <= HOSTILE_MUSTER_ANNOUNCE_MAX_TRACKED) break;
        lastSeenAtByKey.delete(key);
      }
      if (fresh.length === 0) return undefined;
      const lead = [...fresh].sort((a, b) => threatRank(a) - threatRank(b) || a.distanceTiles - b.distanceTiles)[0]!;
      const anyAdvancing = fresh.some((flag) => flag.mode !== "HOLD");
      return {
        title: fresh.length === 1 ? "Enemy muster flag near your border" : `${fresh.length} enemy muster flags near your border`,
        detail: fresh.length === 1 ? hostileMusterDetail(lead) : `Closest threat: ${hostileMusterDetail(lead)}`,
        tone: anyAdvancing ? "error" : "warn",
        focus: { x: lead.x, y: lead.y }
      };
    },
    trackedCount: () => lastSeenAtByKey.size
  };
};
