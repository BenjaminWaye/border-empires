// The guide's dock lead: where to send the scout drone when the nearest town is more than one drone leg
// away (the player is probably on an island) and no dock shows on the player's land yet. Like the town
// lead, it marks a real target instead of a random patch of fog (owner, 2026-11-27).
//
// No server help needed: the init message carries every dock in the world (mapMeta.dockPairs), so the
// client picks the nearest dock that could be on the player's own land mass. It reuses the town route
// check without dock crossings: a walk over LAND (unexplored ground counts as passable, seen water
// blocks) from the dock back to the player's land, so a dock across a strait the player has seen is
// skipped. A rival's or Planetary Defense dock is skipped too.

import { tileKey, WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import type { DockPair, Tile } from "../client-types.js";
import { createGuideTownRouteCheck } from "./tutorial-guide-town-route.js";

/** A dock to steer to; `unexplored` while the player has never seen its tile (so a tap offers Explore). */
export type GuideDockLead = { x: number; y: number; unexplored: boolean };

/** Nearest docks checked for an overland route, so a world of docks costs a few bounded walks. */
export const GUIDE_DOCK_LEAD_CANDIDATES = 6;

const axisDistance = (a: number, b: number, size: number): number => {
  const d = Math.abs(a - b);
  return Math.min(d, size - d);
};

export const guideDockLead = (
  tiles: ReadonlyMap<string, Tile>,
  discovered: ReadonlySet<string>,
  me: string,
  home: { x: number; y: number } | undefined,
  dockPairs: ReadonlyArray<DockPair>
): GuideDockLead | undefined => {
  if (!home || !me) return undefined;
  const docks = new Map<string, { x: number; y: number; d: number }>();
  const add = (x: number, y: number): void => {
    const key = tileKey(x, y);
    const owner = tiles.get(key)?.ownerId;
    if (docks.has(key) || (owner && owner !== me)) return;
    docks.set(key, { x, y, d: Math.max(axisDistance(x, home.x, WORLD_WIDTH), axisDistance(y, home.y, WORLD_HEIGHT)) });
  };
  for (const pair of dockPairs) {
    add(pair.ax, pair.ay);
    add(pair.bx, pair.by);
  }
  const overland = createGuideTownRouteCheck(tiles, me, []);
  const nearest = [...docks.values()].sort((a, b) => a.d - b.d || a.y - b.y || a.x - b.x).slice(0, GUIDE_DOCK_LEAD_CANDIDATES);
  const dock = nearest.find((candidate) => overland(candidate));
  if (!dock) return undefined;
  const key = tileKey(dock.x, dock.y);
  return { x: dock.x, y: dock.y, unexplored: !tiles.has(key) && !discovered.has(key) };
};
