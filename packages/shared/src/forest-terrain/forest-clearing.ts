/**
 * AFC landing-site forest clearing. An Automated Fabrication Complex clears
 * the forest from its own tile and all 8 neighbours. The clearing itself is
 * never persisted or sent over the wire: an AFC is never removed once placed
 * (capture only changes its owner), so "within one tile of an AFC" is fully
 * derivable from tile state that already is -- the simulation re-derives it
 * on hydration (runtime-hydration.ts) and the client on every tile update
 * carrying an AFC plus after any world-seed reset.
 */

import { clearForestAt } from "../worldgen/worldgen.js";

/** Chebyshev radius of the footprint an AFC clears (and, server-side, flattens mountains in). */
export const AFC_LANDING_FOOTPRINT_RADIUS = 1;

/** Clears forest from the AFC tile at (x, y) and its 8 neighbours. Returns true if any tile visibly changed. */
export const clearForestAroundAfcTile = (x: number, y: number): boolean => {
  let changed = false;
  for (let dy = -AFC_LANDING_FOOTPRINT_RADIUS; dy <= AFC_LANDING_FOOTPRINT_RADIUS; dy += 1) {
    for (let dx = -AFC_LANDING_FOOTPRINT_RADIUS; dx <= AFC_LANDING_FOOTPRINT_RADIUS; dx += 1) {
      if (clearForestAt(x + dx, y + dy)) changed = true;
    }
  }
  return changed;
};

/** Applies clearForestAroundAfcTile for every tile carrying an AFC. Returns true if any tile visibly changed. */
export const clearForestAroundAfcTiles = (tiles: Iterable<{ x: number; y: number; afc?: unknown }>): boolean => {
  let changed = false;
  for (const tile of tiles) {
    if (tile.afc && clearForestAroundAfcTile(tile.x, tile.y)) changed = true;
  }
  return changed;
};

/**
 * Towns and docks never stand in a forest: a tile carrying either has its
 * trees cleared. Like the AFC footprint this is re-derived from permanent tile
 * state (tile.town / tile.dockId) rather than persisted or sent over the wire.
 * Returns true if the tile visibly changed.
 */
export const clearForestOnTownOrDockTile = (tile: { x: number; y: number; town?: unknown; dockId?: unknown }): boolean =>
  tile.town || tile.dockId ? clearForestAt(tile.x, tile.y) : false;

/** Applies clearForestOnTownOrDockTile for every tile. Returns true if any tile visibly changed. */
export const clearForestOnTownAndDockTiles = (tiles: Iterable<{ x: number; y: number; town?: unknown; dockId?: unknown }>): boolean => {
  let changed = false;
  for (const tile of tiles) {
    if (clearForestOnTownOrDockTile(tile)) changed = true;
  }
  return changed;
};
