import { WORLD_HEIGHT, WORLD_WIDTH, wrapX, wrapY } from "@border-empires/shared";
import { keyForTile } from "../client-app-runtime-utils.js";
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

const ownsTile = (state: HostileMusterAlertState, x: number, y: number): boolean =>
  state.tiles.get(keyForTile(wrapX(x, WORLD_WIDTH), wrapY(y, WORLD_HEIGHT)))?.ownerId === state.me;

// Nearest own tile to (x, y), scanning outward ring by ring, or undefined
// when none is within the radius. At most (2r+1)^2 map lookups per flag,
// i.e. a few thousand lookups per recompute even with dozens of visible enemy
// flags: cheap next to the full tile walk persistentAlertsForState already
// does, so there is no prefilter.
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

// activeTruces is not pruned when a truce runs out (see
// activeTruceWithPlayerFromState in client-player-actions.ts), so an entry
// only counts while its endsAt is still ahead.
export const isFriendlyOwner = (state: HostileMusterAlertState, ownerId: string, nowEpochMs: number): boolean =>
  ownerId === state.me ||
  Boolean(state.allies?.includes(ownerId)) ||
  Boolean(state.activeTruces?.some((truce) => truce.otherPlayerId === ownerId && truce.endsAt > nowEpochMs));

/**
 * The hostile muster flag on this tile, when it is close enough to the
 * player's own territory to warrant an alert. Allies and truce partners are
 * not hostile. A fogged tile's flag is stale, and so is one on a tile we own
 * (the sim clears a flag when its tile is captured), so both are ignored.
 */
export const hostileMusterNearBorder = (
  state: HostileMusterAlertState,
  tile: Tile,
  nowEpochMs: number = Date.now()
): HostileMusterNearBorder | undefined => {
  const muster = tile.muster;
  if (!muster || !state.me || tile.fogged || tile.ownerId === state.me) return undefined;
  if (isFriendlyOwner(state, muster.ownerId, nowEpochMs)) return undefined;
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

// Flags are tracked by owner and tile; the threat rank (lower = worse) is
// remembered per flag so a flag that escalates (HOLD -> ADVANCE, or a MARCH
// aimed at our land) is announced again.
const announceKey = (flag: HostileMusterNearBorder): string => `${flag.ownerId}@${flag.x},${flag.y}`;

const threatRank = (flag: HostileMusterNearBorder): number => (flag.marchingOnUs ? 0 : flag.mode === "HOLD" ? 2 : 1);

// One-time toast (state.captureAlert via showCaptureAlert) for flags that
// newly appeared near the border, or escalated.
export type HostileMusterAnnouncement = {
  title: string;
  detail: string;
  tone: "error" | "warn";
  focus: { x: number; y: number };
};

export type HostileMusterAnnounceOptions = {
  // false while another toast is still showing: pending flags stay pending
  // (still tracked) and are announced once the toast slot frees up.
  canShow: boolean;
  // true during the warm-up after the map first loads: flags are recorded as
  // already known without a toast, so logging in next to long-standing enemy
  // flags doesn't announce them as new (their locator pins still show).
  silent: boolean;
};

export type HostileMusterAnnouncer = {
  /**
   * An announcement for flags that are new near the border (or escalated)
   * since last announced, or undefined when there is nothing to say or it
   * can't be shown yet. nowMs is any monotonic clock (the frame's
   * performance.now()).
   */
  announce: (
    flags: readonly HostileMusterNearBorder[],
    nowMs: number,
    options: HostileMusterAnnounceOptions
  ) => HostileMusterAnnouncement | undefined;
  trackedCount: () => number;
};

type TrackedFlag = { lastSeenAt: number; announcedRank: number | undefined };

export const createHostileMusterAnnouncer = (): HostileMusterAnnouncer => {
  const trackedByKey = new Map<string, TrackedFlag>();
  return {
    announce: (flags, nowMs, options) => {
      const pending: HostileMusterNearBorder[] = [];
      for (const flag of flags) {
        const key = announceKey(flag);
        const tracked = trackedByKey.get(key) ?? { lastSeenAt: nowMs, announcedRank: undefined };
        tracked.lastSeenAt = nowMs;
        if (tracked.announcedRank === undefined || threatRank(flag) < tracked.announcedRank) pending.push(flag);
        else tracked.announcedRank = threatRank(flag); // de-escalation: a later escalation is news again
        // Delete-then-set keeps Map insertion order = least recently seen first.
        trackedByKey.delete(key);
        trackedByKey.set(key, tracked);
      }
      for (const [key, tracked] of trackedByKey) {
        if (nowMs - tracked.lastSeenAt <= HOSTILE_MUSTER_ANNOUNCE_MEMORY_MS && trackedByKey.size <= HOSTILE_MUSTER_ANNOUNCE_MAX_TRACKED) break;
        trackedByKey.delete(key);
      }
      if (pending.length === 0 || (!options.canShow && !options.silent)) return undefined;
      for (const flag of pending) {
        const tracked = trackedByKey.get(announceKey(flag));
        if (tracked) tracked.announcedRank = threatRank(flag);
      }
      if (options.silent) return undefined;
      const lead = [...pending].sort((a, b) => threatRank(a) - threatRank(b) || a.distanceTiles - b.distanceTiles)[0]!;
      const anyAdvancing = pending.some((flag) => flag.mode !== "HOLD");
      return {
        title: pending.length === 1 ? "Enemy muster flag near your border" : `${pending.length} enemy muster flags near your border`,
        detail: pending.length === 1 ? hostileMusterDetail(lead) : `Closest threat: ${hostileMusterDetail(lead)}`,
        tone: anyAdvancing ? "error" : "warn",
        focus: { x: lead.x, y: lead.y }
      };
    },
    trackedCount: () => trackedByKey.size
  };
};
