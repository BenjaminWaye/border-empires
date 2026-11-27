// The guide's island check: a House whose land sits on an island it has fully
// seen (every land tile it can walk to is ringed by known water) can't reach a
// town across the sea by Expand To, and flying the scout drone several legs out
// to reveal one only shows a town it still can't take. Every land mass has at
// least one dock (server-worldgen-docks.ts), so the town step points at the
// island's dock instead: Expand To a free one, Garrison one of the player's,
// then Cross the sea from it (docs/game-mechanics.md, Docks).
//
// Client-only, run with the guide's tile scan (tutorial-guide-input.ts). It
// walks 8 ways over known LAND from the player's land, like Expand To's planner.
// `sealed` says every edge of that land meets known water; a tile the client
// has never received leaves it open (maybe not an island). The guide uses an
// open result's dock too once the nearest town is more than one drone leg away
// (owner, 2026-11-27: then the player is probably on an island). A walk that
// runs past its budget is a continent. Fogged tiles keep their dockId, so a
// dock seen once still counts.

import { tileKey, WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import type { Tile } from "../client-types.js";

/** "expand": a free dock on the island. "garrison": the player's dock, not yet garrisoned. "cross": the player's garrisoned dock. */
export type GuideIslandDockAction = "expand" | "garrison" | "cross";
export type GuideIslandDock = { action: GuideIslandDockAction; x: number; y: number };
/** The dock on the player's land mass, and whether that land is a fully seen island. */
export type GuideLandDock = { dock: GuideIslandDock; sealed: boolean };

/** Land tiles the walk may visit before calling the land mass a continent. */
export const GUIDE_ISLAND_TILE_BUDGET = 4096;

const wrap = (value: number, size: number): number => ((value % size) + size) % size;
const RANK: Record<GuideIslandDockAction, number> = { cross: 0, garrison: 1, expand: 2 };

const distance = (a: { x: number; y: number }, b: { x: number; y: number }): number => {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return Math.max(Math.min(dx, WORLD_WIDTH - dx), Math.min(dy, WORLD_HEIGHT - dy));
};

const dockAction = (tile: Tile, me: string): GuideIslandDockAction | undefined => {
  if (!tile.dockId) return undefined;
  if (tile.ownerId === me) return tile.ownershipState === "SETTLED" ? "cross" : "garrison";
  // A rival's or Planetary Defense dock is a fight, not a first step.
  return tile.ownerId ? undefined : "expand";
};

/**
 * The dock on the player's land mass, or undefined on a continent (the walk
 * runs past its budget) or when the land shows no dock the player can use.
 * Prefers the player's garrisoned dock, then their own, then the free dock
 * nearest home.
 */
export const guideLandDock = (
  tiles: ReadonlyMap<string, Tile>,
  me: string,
  home: { x: number; y: number } | undefined
): GuideLandDock | undefined => {
  if (!me) return undefined;
  const queue: Tile[] = [];
  const seen = new Set<string>();
  for (const [key, tile] of tiles) {
    if (tile.ownerId !== me || tile.terrain !== "LAND") continue;
    seen.add(key);
    queue.push(tile);
  }
  if (queue.length === 0) return undefined;
  let best: GuideIslandDock | undefined;
  let bestDistance = Infinity;
  let sealed = true;
  for (let head = 0; head < queue.length; head++) {
    if (seen.size > GUIDE_ISLAND_TILE_BUDGET) return undefined;
    const at = queue[head]!;
    const action = dockAction(at, me);
    if (action) {
      const d = home ? distance(at, home) : 0;
      if (!best || RANK[action] < RANK[best.action] || (RANK[action] === RANK[best.action] && d < bestDistance)) {
        best = { action, x: at.x, y: at.y };
        bestDistance = d;
      }
    }
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const x = wrap(at.x + dx, WORLD_WIDTH);
        const y = wrap(at.y + dy, WORLD_HEIGHT);
        const key = tileKey(x, y);
        if (seen.has(key)) continue;
        const tile = tiles.get(key);
        // Ground the client has never received: the coast could go on, so this may not be an island.
        if (!tile) {
          sealed = false;
          continue;
        }
        seen.add(key);
        if (tile.terrain === "LAND") queue.push(tile);
      }
    }
  }
  return best ? { dock: best, sealed } : undefined;
};

/** The dock when the player's land is a fully seen island (see guideLandDock). */
export const guideIslandDock = (
  tiles: ReadonlyMap<string, Tile>,
  me: string,
  home: { x: number; y: number } | undefined
): GuideIslandDock | undefined => {
  const found = guideLandDock(tiles, me, home);
  return found?.sealed ? found.dock : undefined;
};
