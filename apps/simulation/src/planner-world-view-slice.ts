import type { DomainTileState } from "@border-empires/game-domain";
import { WORLD_HEIGHT, WORLD_WIDTH, wrapX, wrapY } from "@border-empires/shared";

import { buildDockLinksByDockTileKey, type DockRouteDefinition } from "./dock-network.js";
import { frontierNeighborKeys } from "./frontier-topology.js";
import type { PlannerTileView } from "./planner-world-view.js";

export const DEFAULT_PLANNER_TILE_RADIUS = 2;

type PlannerSummarySlice = {
  territoryTileKeys: ReadonlySet<string>;
};

type PlannerTileSliceOptions = {
  playerIds: readonly string[];
  tiles: ReadonlyMap<string, DomainTileState>;
  docks: readonly DockRouteDefinition[];
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
  docks,
  summaryForPlayer,
  radius = DEFAULT_PLANNER_TILE_RADIUS
}: PlannerTileSliceOptions): PlannerTileView[] => {
  const safeRadius = Math.max(0, Math.floor(radius));
  const tileKeysInScope = new Set<string>();
  const dockLinksByDockTileKey = buildDockLinksByDockTileKey(docks);

  for (const playerId of playerIds) {
    const summary = summaryForPlayer(playerId);
    for (const tileKey of summary.territoryTileKeys) {
      tileKeysInScope.add(tileKey);
      const coords = parseTileKey(tileKey);
      if (!coords) continue;
      for (let dy = -safeRadius; dy <= safeRadius; dy += 1) {
        for (let dx = -safeRadius; dx <= safeRadius; dx += 1) {
          tileKeysInScope.add(`${wrapX(coords.x + dx, WORLD_WIDTH)},${wrapY(coords.y + dy, WORLD_HEIGHT)}`);
        }
      }
      const tile = tiles.get(tileKey);
      if (!tile?.dockId) continue;
      for (const linkedDockTileKey of dockLinksByDockTileKey.get(tileKey) ?? []) {
        tileKeysInScope.add(linkedDockTileKey);
        const linkedDockCoords = parseTileKey(linkedDockTileKey);
        if (!linkedDockCoords) continue;
        for (const neighborKey of frontierNeighborKeys(linkedDockCoords.x, linkedDockCoords.y)) {
          tileKeysInScope.add(neighborKey);
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
