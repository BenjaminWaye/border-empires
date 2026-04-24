import type { DomainTileState } from "@border-empires/game-domain";

import type { PlannerTileView } from "./planner-world-view.js";

export const DEFAULT_PLANNER_TILE_RADIUS = 2;

type PlannerSummarySlice = {
  territoryTileKeys: ReadonlySet<string>;
};

type PlannerTileSliceOptions = {
  playerIds: readonly string[];
  tiles: ReadonlyMap<string, DomainTileState>;
  summaryForPlayer: (playerId: string) => PlannerSummarySlice;
  radius?: number;
};

const parseTileKey = (tileKey: string): { x: number; y: number } | undefined => {
  const [rawX, rawY] = tileKey.split(",");
  const x = Number(rawX);
  const y = Number(rawY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
  return { x, y };
};

const toPlannerTileView = (tile: DomainTileState): PlannerTileView => ({
  x: tile.x,
  y: tile.y,
  terrain: tile.terrain,
  ...(tile.resource ? { resource: tile.resource } : {}),
  ...(tile.dockId ? { dockId: tile.dockId } : {}),
  ...(tile.ownerId ? { ownerId: tile.ownerId } : {}),
  ...(tile.ownershipState ? { ownershipState: tile.ownershipState } : {}),
  ...(tile.town
    ? {
        town: {
          ...(typeof tile.town.supportMax === "number" ? { supportMax: tile.town.supportMax } : {}),
          ...(typeof tile.town.supportCurrent === "number" ? { supportCurrent: tile.town.supportCurrent } : {})
        }
      }
    : {})
});

export const buildPlannerTileSlice = ({
  playerIds,
  tiles,
  summaryForPlayer,
  radius = DEFAULT_PLANNER_TILE_RADIUS
}: PlannerTileSliceOptions): PlannerTileView[] => {
  const safeRadius = Math.max(0, Math.floor(radius));
  const tileKeysInScope = new Set<string>();

  for (const playerId of playerIds) {
    const summary = summaryForPlayer(playerId);
    for (const tileKey of summary.territoryTileKeys) {
      tileKeysInScope.add(tileKey);
      const coords = parseTileKey(tileKey);
      if (!coords) continue;
      for (let dy = -safeRadius; dy <= safeRadius; dy += 1) {
        for (let dx = -safeRadius; dx <= safeRadius; dx += 1) {
          tileKeysInScope.add(`${coords.x + dx},${coords.y + dy}`);
        }
      }
    }
  }

  const scopedTiles: PlannerTileView[] = [];
  for (const tileKey of tileKeysInScope) {
    const tile = tiles.get(tileKey);
    if (!tile) continue;
    scopedTiles.push(toPlannerTileView(tile));
  }

  scopedTiles.sort((left, right) => (left.x - right.x) || (left.y - right.y));
  return scopedTiles;
};
