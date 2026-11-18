import type { DomainTileState } from "@border-empires/game-domain";
import { FORT_PERIMETER_BY_VARIANT, WORLD_HEIGHT, WORLD_WIDTH, defendingFortVariant, fortPerimeterSourceVariant } from "@border-empires/shared";
import { simulationTileKey } from "../seed-state/seed-state.js";

// Fort perimeter auto-garrison (packages/shared/src/fort-perimeter): the
// perimeter only defends garrisoned ground, so the owner's plain FRONTIER
// land inside it auto-garrisons through the ordinary auto-settle queue, the
// same way a grown town's support ring does: same cost, reach and slot gates
// as a manual Garrison, and nothing reserved up front. Resource, town and dock
// tiles keep following their own auto-garrison switch. Coverage is derived
// from the tiles on every check, so nothing extra is stored.

type TileLookup = ReadonlyMap<string, DomainTileState>;

const tileAt = (tiles: TileLookup) => (x: number, y: number) => tiles.get(simulationTileKey(x, y));

/** True when one of the owner's standing forts has `tile` inside its perimeter. */
export const isInOwnFortPerimeter = (tiles: TileLookup, ownerId: string, tile: Pick<DomainTileState, "x" | "y">, nowMs: number): boolean =>
  fortPerimeterSourceVariant(ownerId, tile.x, tile.y, tileAt(tiles), nowMs) !== undefined;

/** A tile with no town, dock or resource of its own that a fort perimeter covers: auto-garrisons whatever the town switch says. */
export const isPlainFortPerimeterTile = (tiles: TileLookup, ownerId: string, tile: DomainTileState, nowMs: number): boolean =>
  !tile.town && !tile.dockId && !tile.resource && isInOwnFortPerimeter(tiles, ownerId, tile, nowMs);

const perimeterRadius = (tile: DomainTileState | undefined, ownerId: string): number => {
  const fort = tile?.fort;
  if (!tile || !fort || tile.ownerId !== ownerId || fort.ownerId !== ownerId) return 0;
  const variant = defendingFortVariant(fort);
  return variant ? FORT_PERIMETER_BY_VARIANT[variant].radius : 0;
};

/**
 * Tile keys a fort tile's change newly brings inside its owner's perimeter: a
 * fort finishing, or an upgrade that widens the radius. Empty otherwise.
 */
export const newlyCoveredFortPerimeterKeys = (previous: DomainTileState | undefined, next: DomainTileState): { ownerId: string; tileKeys: string[] } | undefined => {
  const ownerId = next.ownerId;
  if (!ownerId) return undefined;
  const radius = perimeterRadius(next, ownerId);
  const previousRadius = previous?.ownerId === ownerId ? perimeterRadius(previous, ownerId) : 0;
  if (radius <= previousRadius) return undefined;
  const tileKeys: string[] = [];
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) <= previousRadius) continue;
      const x = (((next.x + dx) % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH;
      const y = (((next.y + dy) % WORLD_HEIGHT) + WORLD_HEIGHT) % WORLD_HEIGHT;
      tileKeys.push(simulationTileKey(x, y));
    }
  }
  return { ownerId, tileKeys };
};
