import type { Terrain } from "@border-empires/shared";
import { MAX_SUPPORT_RING_RADIUS as MAX_SUPPORT_LOOKUP_RADIUS, supportRingRadiusForTier } from "@border-empires/shared";
import type { Tile } from "./client-types.js";

// Shared eligibility/anchor logic for a town's support ring, used by both
// renderers: the 3D hatch-tile overlay (client-map-3d/client-map-3d.ts) and
// the 2D canvas equivalent (client-map-2d-town-support-tile-overlay.ts).
// Pulled out so the two renderers can't silently drift on what counts as a
// "support plot" -- see AGENTS.md's renderer-parity rule. This mirrors the
// server's authoritative eligibility (economy-network-support-ring.ts):
// non-SETTLEMENT towns only, player-owned + SETTLED tiles are the ones
// actually contributing, and the ring radius is tier-aware
// (supportRingRadiusForTier: 1 for every tier except GREAT_CITY/METROPOLIS,
// which get a second ring at radius 2) -- NOT a hardcoded 8-neighbor square,
// which this file used to be before 2026-09-10: the overlay/lookup never
// consulted the town's tier at all, so a Great City or Metropolis town's
// second ring never rendered or was interactable client-side even while the
// server-side economic bonus was (intermittently) live for it.

export type TownSupportLookupDeps = {
  tiles: ReadonlyMap<string, Tile>;
  wrapX: (x: number) => number;
  wrapY: (y: number) => number;
  keyFor: (x: number, y: number) => string;
  terrainAt: (x: number, y: number) => Terrain;
  me: string | undefined;
};

export const isTownSupportHighlightableAt = (wx: number, wy: number, deps: TownSupportLookupDeps): boolean => {
  const tile = deps.tiles.get(deps.keyFor(wx, wy));
  const terrain = tile?.terrain ?? deps.terrainAt(wx, wy);
  if (terrain !== "LAND") return false;
  if (tile?.dockId) return false;
  return true;
};

// Find the player's anchor town for the support-tile overlay: either the
// selected tile itself (when the player selects one of their own non-
// settlement towns) or, if the selected tile is a support tile adjacent to
// such a town, that adjacent town. The second case keeps the overlay visible
// after the player clicks a support tile to settle it.
export const supportPlotAnchorTown = (selectedTile: Tile | undefined, deps: TownSupportLookupDeps): Tile | undefined => {
  if (!selectedTile) return undefined;
  if (selectedTile.town && selectedTile.town.populationTier !== "SETTLEMENT" && selectedTile.ownerId === deps.me) {
    return selectedTile;
  }
  // Walk out to the widest radius any tier can use (GREAT_CITY/METROPOLIS's
  // 2) looking for one of the player's non-settlement towns, then discard a
  // candidate whose OWN tier doesn't actually reach this far -- a Town-tier
  // neighbor at distance 2 doesn't anchor here even though a Great City
  // neighbor at distance 2 would. If multiple match, pick the deterministic
  // lowest (x,y) so the overlay stays stable as the user drags the selection
  // around.
  let best: Tile | undefined;
  for (let dy = -MAX_SUPPORT_LOOKUP_RADIUS; dy <= MAX_SUPPORT_LOOKUP_RADIUS; dy += 1) {
    for (let dx = -MAX_SUPPORT_LOOKUP_RADIUS; dx <= MAX_SUPPORT_LOOKUP_RADIUS; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const nx = deps.wrapX(selectedTile.x + dx);
      const ny = deps.wrapY(selectedTile.y + dy);
      const neighbor = deps.tiles.get(deps.keyFor(nx, ny));
      if (!neighbor?.town) continue;
      if (neighbor.town.populationTier === "SETTLEMENT") continue;
      if (neighbor.ownerId !== deps.me) continue;
      if (neighbor.ownershipState !== "SETTLED") continue;
      if (Math.max(Math.abs(dx), Math.abs(dy)) > supportRingRadiusForTier(neighbor.town.populationTier)) continue;
      if (!best || neighbor.x < best.x || (neighbor.x === best.x && neighbor.y < best.y)) {
        best = neighbor;
      }
    }
  }
  return best;
};

export type TownSupportPlotEntry = { wx: number; wy: number; dx: number; dy: number; settled: boolean };

// Convenience for the 2D canvas renderer: the same anchor-plus-entries walk,
// collapsed into a single per-frame lookup map (tile key -> settled) so the
// draw loop only needs a plain Map.has()/get() per tile.
export const townSupportPlotMapFor2D = (selected: Tile | undefined, deps: TownSupportLookupDeps): Map<string, boolean> => {
  const map = new Map<string, boolean>();
  const anchor = supportPlotAnchorTown(selected, deps);
  if (anchor) {
    for (const { wx, wy, settled } of townSupportPlotEntries(anchor, deps)) map.set(deps.keyFor(wx, wy), settled);
  }
  return map;
};

// The anchor's highlightable support plots (8 for most tiers, 24 for
// GREAT_CITY/METROPOLIS), each flagged with whether it currently contributes
// to the town (player-owned + SETTLED) or is merely eligible once settled.
export const townSupportPlotEntries = (anchor: Tile, deps: TownSupportLookupDeps): TownSupportPlotEntry[] => {
  const entries: TownSupportPlotEntry[] = [];
  const radius = supportRingRadiusForTier(anchor.town?.populationTier);
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const wx = deps.wrapX(anchor.x + dx);
      const wy = deps.wrapY(anchor.y + dy);
      if (!isTownSupportHighlightableAt(wx, wy, deps)) continue;
      const tile = deps.tiles.get(deps.keyFor(wx, wy));
      const settled = tile?.ownerId === deps.me && tile?.ownershipState === "SETTLED";
      entries.push({ wx, wy, dx, dy, settled });
    }
  }
  return entries;
};
