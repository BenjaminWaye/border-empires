// Whether a known town can be reached overland from the player's land, so its
// tile menu offers Expand To: a client-only check, run on the few nearest
// candidate towns when the guide's tile scan refreshes (tutorial-guide-input.ts).
//
// It mirrors the waypoint planner Expand To uses (planWaypoint in
// @border-empires/shared, via expandToAction in client-tile-action-neutral.ts):
// steps go 8 ways over LAND, an unexplored tile counts as passable (the
// planner is optimistic about the unknown too), and a dock pair jumps from
// one dock onto the far dock's landing ground. It searches backward from the
// town and succeeds on touching the player's own land.
//
// A town cut off by water the player has already seen (typically what the
// scout drone just reported across a strait) has no route: the guide's town
// step then sends the drone out again instead of asking for an Expand To the
// menu doesn't offer. It is bounded: a search that runs out of budget is
// treated as reachable (the route is long but open, as the planner's far
// larger search would find), so only a sealed-off town is ever skipped.
// Allied and truce borders, which the planner also refuses to cross, are not
// modelled.

import { dockLandingGroundCoords, tileKey, WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import type { DockPair, Tile } from "../client-types.js";

/** Tiles the backward search may visit before giving up and calling the town reachable. */
export const GUIDE_TOWN_ROUTE_BUDGET = 4096;

const wrap = (value: number, size: number): number => ((value % size) + size) % size;

/** For each landing-ground tile, the docks whose crossing lands there (reverse of the planner's dock jumps). */
const reverseDockLinks = (tiles: ReadonlyMap<string, Tile>, dockPairs: ReadonlyArray<DockPair>): Map<string, Array<{ x: number; y: number }>> => {
  const terrainAt = (x: number, y: number): string | undefined => tiles.get(tileKey(x, y))?.terrain;
  const out = new Map<string, Array<{ x: number; y: number }>>();
  const add = (fromX: number, fromY: number, farX: number, farY: number): void => {
    for (const landing of dockLandingGroundCoords(farX, farY, terrainAt)) {
      const key = tileKey(landing.x, landing.y);
      const list = out.get(key) ?? [];
      list.push({ x: fromX, y: fromY });
      out.set(key, list);
    }
  };
  for (const pair of dockPairs) {
    add(pair.ax, pair.ay, pair.bx, pair.by);
    add(pair.bx, pair.by, pair.ax, pair.ay);
  }
  return out;
};

/** Builds the check for one tile scan; the dock links are computed once and shared by every town checked. */
export const createGuideTownRouteCheck = (
  tiles: ReadonlyMap<string, Tile>,
  me: string,
  dockPairs: ReadonlyArray<DockPair>
): ((town: { x: number; y: number }) => boolean) => {
  let docks: Map<string, Array<{ x: number; y: number }>> | undefined;
  const passable = (tile: Tile | undefined): boolean => !tile || tile.terrain === "LAND";
  return (town) => {
    docks ??= reverseDockLinks(tiles, dockPairs);
    const seen = new Set<string>([tileKey(town.x, town.y)]);
    const queue: Array<{ x: number; y: number }> = [town];
    for (let head = 0; head < queue.length; head++) {
      if (seen.size > GUIDE_TOWN_ROUTE_BUDGET) return true;
      const at = queue[head]!;
      const next: Array<{ x: number; y: number }> = [...(docks.get(tileKey(at.x, at.y)) ?? [])];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx !== 0 || dy !== 0) next.push({ x: wrap(at.x + dx, WORLD_WIDTH), y: wrap(at.y + dy, WORLD_HEIGHT) });
        }
      }
      for (const step of next) {
        const key = tileKey(step.x, step.y);
        if (seen.has(key)) continue;
        seen.add(key);
        const tile = tiles.get(key);
        if (tile?.ownerId === me && tile.terrain === "LAND") return true;
        if (passable(tile)) queue.push(step);
      }
    }
    return false;
  };
};
