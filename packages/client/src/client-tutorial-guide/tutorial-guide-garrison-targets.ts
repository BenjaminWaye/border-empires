// The "garrison your border" step: what it completes on and what it rings.
//
// Reach (the AFC, towns, docks, Relay Beacons) claims neutral land as FRONTIER
// for free, and FRONTIER has no defence. Auto-garrison only ever takes towns,
// docks, resources and the town support ring, so most of a beacon's disk stays
// FRONTIER unless the player garrisons it by hand (docs/core-loop.md §12,
// tension 5). The step teaches that by doing it once: garrison a plain tile.
//
// "Plain" is land the game never garrisons for the player: no town, dock,
// resource, AFC or building on it, and not within GARRISON_ANCHOR_CLEARANCE of
// one of the player's towns or AFCs. That clearance keeps the AFC's landing
// footprint (garrisoned at spawn) and a town's support ring (garrisoned with
// the town) from completing the step before the player has done anything. A
// tile with a Relay Beacon on it doesn't count either: the beacon step
// garrisons its own site, and this step is about the land around it.
//
// Targets are the player's own FRONTIER plain tiles inside reach (Garrison is
// reach-gated) on the border, those touching another owner first.

import { chebyshevWithWrap, tileKey, WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import type { Tile } from "../client-types.js";
import { tileHasTownIdentity } from "../client-town-identity.js";

export type GuideGarrisonScan = {
  /** The player holds a garrisoned plain tile (see the file comment): the step is done. */
  garrisonedPlain: boolean;
  /** Own FRONTIER plain border tiles inside reach, nearest home first. */
  targets: Array<{ x: number; y: number }>;
};

/** A support ring is at most 2 tiles deep, and an AFC footprint 1. */
export const GARRISON_ANCHOR_CLEARANCE = 2;
const MAX_TARGETS = 3;

const NEIGHBOUR_OFFSETS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1]
] as const;

const wrap = (value: number, size: number): number => ((value % size) + size) % size;

const hasBuilding = (tile: Tile): boolean =>
  Boolean(tile.economicStructure || tile.fort || tile.observatory || tile.siegeBattery || tile.afc);

const isAnchor = (tile: Tile): boolean => Boolean(tile.afc) || tileHasTownIdentity(tile);

const isPlain = (tile: Tile): boolean =>
  tile.terrain === "LAND" && !tile.resource && !tile.dockId && !tile.dock && !tileHasTownIdentity(tile) && !hasBuilding(tile);

export const scanGuideGarrisonTargets = (
  tiles: ReadonlyMap<string, Tile>,
  me: string,
  inReach: (x: number, y: number) => boolean,
  byDistance: (t: { x: number; y: number }) => number
): GuideGarrisonScan => {
  const anchors: Tile[] = [];
  const plain: Tile[] = [];
  for (const tile of tiles.values()) {
    if (tile.ownerId !== me) continue;
    if (isAnchor(tile)) anchors.push(tile);
    else if (isPlain(tile) && !tile.optimisticPending) plain.push(tile);
  }
  const nearAnchor = (tile: Tile): boolean =>
    anchors.some((a) => chebyshevWithWrap(a.x, a.y, tile.x, tile.y) <= GARRISON_ANCHOR_CLEARANCE);
  const neighbours = (tile: Tile): Array<Tile | undefined> =>
    NEIGHBOUR_OFFSETS.map(([dx, dy]) => tiles.get(tileKey(wrap(tile.x + dx, WORLD_WIDTH), wrap(tile.y + dy, WORLD_HEIGHT))));

  let garrisonedPlain = false;
  const contested: Tile[] = [];
  const border: Tile[] = [];
  for (const tile of plain) {
    if (nearAnchor(tile)) continue;
    if (tile.ownershipState === "SETTLED") {
      garrisonedPlain = true;
      continue;
    }
    if (tile.ownershipState !== "FRONTIER" || !inReach(tile.x, tile.y)) continue;
    const around = neighbours(tile);
    if (around.some((n) => n?.ownerId && n.ownerId !== me)) contested.push(tile);
    else if (around.some((n) => !n || (n.terrain === "LAND" && n.ownerId !== me))) border.push(tile);
  }
  const nearest = (list: Tile[]) => list.sort((a, b) => byDistance(a) - byDistance(b)).map(({ x, y }) => ({ x, y }));
  return { garrisonedPlain, targets: [...nearest(contested), ...nearest(border)].slice(0, MAX_TARGETS) };
};
