// Picks the best tiles for a player's next Relay Beacon -- the client-side
// "where should this go" hint shown during beacon placement and during the
// onboarding checklist's EXPAND_RELAY_BEACON step.
//
// A beacon's job early on is to push reach and vision out, so a site is
// scored by what it newly gives the player: every tile in its disk the
// player can't currently see counts (that is the land it reveals), ground it
// newly brings into reach counts, and a valuable tile (town, resource, dock)
// newly reached is worth far more than plain land -- the same "only new
// coverage counts" idea as the AI's own siting (apps/simulation/src/ai/
// relay-beacon-command-planner.ts's estimateNewReachCoverage). On top of
// that, callers can pass `targets` (e.g. the town the onboarding checklist
// wants the player to reach): a site whose reach disk covers a target always
// wins, and when no single beacon can reach one yet, the site closest to the
// nearest target wins so a chain of beacons walks reach toward it.
//
// Candidates include owned FRONTIER tiles, not just SETTLED ones: the tile
// menu offers Build Relay Beacon there as a garrison-then-build chain. Being
// already settled earns no credit (playtest: right after landing the AFC was
// the only settled tile, so it was recommended even though a beacon on it
// reveals barely anything past the AFC's own vision).
//
// The AI scorer runs in the simulation worker against planner tile types
// and a fog-shadow model this client doesn't have, so this is a deliberately
// small client mirror rather than a shared import.

import { chebyshevWithWrap, landGatedTileKeysInDisk, RELAY_BEACON_VISION_BONUS, tileKey, WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { tileHasTownIdentity } from "../client-town-identity.js";
import type { Tile } from "../client-types.js";
import { REACH_RADIUS_BY_KIND } from "../client-reach-overlay/client-reach-overlay-anchor-disk.js";

export type RelayBeaconSite = { x: number; y: number; score: number; coversTarget: boolean };

export type RelayBeaconSiteOptions = {
  /** The player's current reach (tile keys). Tiles already inside it never count as new coverage. */
  reach: ReadonlySet<string>;
  /** Tiles the player is trying to bring into reach. Covering one outranks any amount of plain coverage. */
  targets?: readonly { x: number; y: number }[];
  /** How many sites to return. Picked sites are kept at least a beacon radius apart. */
  limit?: number;
};

const OUTPOST_RADIUS = REACH_RADIUS_BY_KIND.OUTPOST;
const VALUABLE_WEIGHT = 8;
// Per land tile the beacon's vision would reveal (not currently visible: never seen, or fogged).
const REVEAL_WEIGHT = 1;
const TARGET_WEIGHT = 1_000;
// Bounds the per-call cost (each evaluated candidate is one 11x11 land-gated
// disk walk). Interior tiles are discarded by a cheap probe first, so this
// only bites for very large empires with very long borders.
const MAX_EVALUATED_CANDIDATES = 400;

const wrapX = (x: number): number => ((x % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH;
const wrapY = (y: number): number => ((y % WORLD_HEIGHT) + WORLD_HEIGHT) % WORLD_HEIGHT;

/**
 * Can this player put a Relay Beacon on this tile right now? Mirrors the
 * tile menu's own guard (client-tile-action-logic.ts's build_relay_beacon
 * block: no siege battery, observatory or economic structure) plus the
 * server's placement checks for a settled build (owned, settled, land).
 */
export const isRelayBeaconPlacementTile = (tile: Tile | undefined, playerId: string): boolean =>
  Boolean(
    tile &&
      tile.ownerId === playerId &&
      tile.ownershipState === "SETTLED" &&
      tile.terrain === "LAND" &&
      !tile.optimisticPending &&
      !tile.economicStructure &&
      !tile.siegeBattery &&
      !tile.observatory
  );

/**
 * Could the onboarding hint send the player to build a beacon here? Settled
 * placement tiles, plus owned FRONTIER land the tile menu can garrison and
 * then build on (same structure guards).
 */
export const isRelayBeaconSiteCandidate = (tile: Tile | undefined, playerId: string): boolean =>
  isRelayBeaconPlacementTile(tile, playerId) ||
  Boolean(tile && tile.ownershipState === "FRONTIER" && isRelayBeaconPlacementTile({ ...tile, ownershipState: "SETTLED" }, playerId));

/** The reach disk a beacon at (x, y) would add -- same land-gated math computeLocalReachSet uses for real anchors. */
export const relayBeaconReachDisk = (tiles: ReadonlyMap<string, Tile>, x: number, y: number): string[] =>
  landGatedTileKeysInDisk(x, y, OUTPOST_RADIUS, (tx, ty) => {
    const tile = tiles.get(tileKey(tx, ty));
    return tile ? tile.terrain === "LAND" : true;
  });

// Beacons this player is already building claim their disk too, so a second
// site doesn't get credit for land the first is about to cover.
const reachWithPendingBeacons = (tiles: ReadonlyMap<string, Tile>, playerId: string, reach: ReadonlySet<string>): ReadonlySet<string> => {
  let merged: Set<string> | undefined;
  for (const tile of tiles.values()) {
    const beacon = tile.economicStructure;
    if (tile.ownerId !== playerId || beacon?.type !== "RELAY_BEACON" || beacon.status !== "under_construction") continue;
    merged ??= new Set(reach);
    for (const key of relayBeaconReachDisk(tiles, tile.x, tile.y)) merged.add(key);
  }
  return merged ?? reach;
};

// A tile deep inside current reach can't add anything: if every probe point
// a full beacon radius away is already in reach, skip the disk walk.
const PROBE_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [-OUTPOST_RADIUS, -OUTPOST_RADIUS], [0, -OUTPOST_RADIUS], [OUTPOST_RADIUS, -OUTPOST_RADIUS],
  [-OUTPOST_RADIUS, 0], [OUTPOST_RADIUS, 0],
  [-OUTPOST_RADIUS, OUTPOST_RADIUS], [0, OUTPOST_RADIUS], [OUTPOST_RADIUS, OUTPOST_RADIUS]
];
const mayAddReach = (x: number, y: number, reach: ReadonlySet<string>): boolean =>
  PROBE_OFFSETS.some(([dx, dy]) => !reach.has(tileKey(wrapX(x + dx), wrapY(y + dy))));

// Land this beacon's vision would newly show: tiles in its vision square the
// player can't see right now (never seen, or fogged), except ones already
// known to be water. Vision isn't land-gated, unlike reach.
const revealedLandCount = (tiles: ReadonlyMap<string, Tile>, x: number, y: number): number => {
  let revealed = 0;
  for (let dy = -RELAY_BEACON_VISION_BONUS; dy <= RELAY_BEACON_VISION_BONUS; dy += 1) {
    for (let dx = -RELAY_BEACON_VISION_BONUS; dx <= RELAY_BEACON_VISION_BONUS; dx += 1) {
      const tile = tiles.get(tileKey(wrapX(x + dx), wrapY(y + dy)));
      if (!tile || (tile.fogged && tile.terrain === "LAND")) revealed += 1;
    }
  }
  return revealed;
};

const scoreSite = (
  tiles: ReadonlyMap<string, Tile>,
  playerId: string,
  x: number,
  y: number,
  reach: ReadonlySet<string>,
  targetKeys: ReadonlySet<string>
): { score: number; coversTarget: boolean } => {
  let score = revealedLandCount(tiles, x, y) * REVEAL_WEIGHT;
  let coversTarget = false;
  for (const key of relayBeaconReachDisk(tiles, x, y)) {
    if (reach.has(key)) continue;
    if (targetKeys.has(key)) {
      coversTarget = true;
      score += TARGET_WEIGHT;
    }
    const tile = tiles.get(key);
    if (!tile) {
      score += 1; // unseen ground: assume plain land, same convention as computeLocalReachSet
      continue;
    }
    if (tile.terrain !== "LAND" || tile.ownerId === playerId) continue;
    if (tile.reachOwnerId && tile.reachOwnerId !== playerId) continue; // already held by a rival's reach
    score += tileHasTownIdentity(tile) || tile.resource || tile.dockId ? VALUABLE_WEIGHT : 1;
  }
  return { score, coversTarget };
};

const nearestTargetDistance = (x: number, y: number, targets: readonly { x: number; y: number }[]): number => {
  let best = Number.POSITIVE_INFINITY;
  for (const target of targets) best = Math.min(best, chebyshevWithWrap(x, y, target.x, target.y));
  return best;
};

/**
 * Best Relay Beacon sites for this player, best first. Empty when the player
 * has no tile a beacon could go on, or no site would reveal or reach anything new.
 */
export const bestRelayBeaconSites = (
  tiles: ReadonlyMap<string, Tile>,
  playerId: string,
  options: RelayBeaconSiteOptions
): RelayBeaconSite[] => {
  const targets = options.targets ?? [];
  const limit = Math.max(1, options.limit ?? 1);
  const targetKeys = new Set(targets.map((t) => tileKey(wrapX(t.x), wrapY(t.y))));
  const reach = reachWithPendingBeacons(tiles, playerId, options.reach);
  const scored: Array<RelayBeaconSite & { distance: number }> = [];
  let evaluated = 0;
  for (const tile of tiles.values()) {
    if (evaluated >= MAX_EVALUATED_CANDIDATES) break;
    if (!isRelayBeaconSiteCandidate(tile, playerId) || !mayAddReach(tile.x, tile.y, reach)) continue;
    evaluated += 1;
    const { score, coversTarget } = scoreSite(tiles, playerId, tile.x, tile.y, reach, targetKeys);
    if (score <= 0) continue;
    const distance = targets.length > 0 ? nearestTargetDistance(tile.x, tile.y, targets) : 0;
    scored.push({ x: tile.x, y: tile.y, score, coversTarget, distance });
  }
  scored.sort((a, b) => {
    if (a.coversTarget !== b.coversTarget) return a.coversTarget ? -1 : 1;
    if (!a.coversTarget && a.distance !== b.distance) return a.distance - b.distance;
    if (a.score !== b.score) return b.score - a.score;
    return a.y - b.y || a.x - b.x; // stable across renders so the marker doesn't flicker between ties
  });
  const picked: RelayBeaconSite[] = [];
  for (const site of scored) {
    if (picked.length >= limit) break;
    if (picked.some((p) => chebyshevWithWrap(p.x, p.y, site.x, site.y) <= OUTPOST_RADIUS)) continue;
    picked.push({ x: site.x, y: site.y, score: site.score, coversTarget: site.coversTarget });
  }
  return picked;
};
