import { buildDockLinksByDockTileKey } from "./dock-network.js";
import { frontierNeighborKeys } from "./frontier-topology.js";
import type { PlannerWorldView } from "./planner-world-view.js";
import { WORLD_HEIGHT, WORLD_WIDTH, wrapX, wrapY } from "@border-empires/shared";

export const DEFAULT_PLANNER_SYNC_RADIUS = 2;

const parseTileKey = (tileKey: string): { x: number; y: number } | undefined => {
  const [rawX, rawY] = tileKey.split(",");
  const x = Number(rawX);
  const y = Number(rawY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
  return { x, y };
};

const addScopedKey = (target: Set<string>, tileKey: string, radius: number): void => {
  target.add(tileKey);
  const coords = parseTileKey(tileKey);
  if (!coords) return;
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      target.add(`${wrapX(coords.x + dx, WORLD_WIDTH)},${wrapY(coords.y + dy, WORLD_HEIGHT)}`);
    }
  }
};

export const buildPlannerRelevantTileKeys = (
  worldView: Pick<PlannerWorldView, "players" | "tiles" | "docks">,
  radius = DEFAULT_PLANNER_SYNC_RADIUS
): Set<string> => {
  const safeRadius = Math.max(0, Math.floor(radius));
  const scopedKeys = new Set<string>();
  const tilesByKey = new Map<string, (typeof worldView.tiles)[number]>(
    worldView.tiles.map((tile) => [`${tile.x},${tile.y}`, tile] as const)
  );
  const dockLinksByDockTileKey = buildDockLinksByDockTileKey(worldView.docks ?? []);
  for (const player of worldView.players) {
    for (const tileKey of player.territoryTileKeys) addScopedKey(scopedKeys, tileKey, safeRadius);
    for (const tileKey of player.frontierTileKeys) addScopedKey(scopedKeys, tileKey, safeRadius);
    for (const tileKey of player.pendingSettlementTileKeys) addScopedKey(scopedKeys, tileKey, safeRadius);
    for (const tileKey of player.territoryTileKeys) {
      if (!tilesByKey.get(tileKey)?.dockId) continue;
      for (const linkedDockTileKey of dockLinksByDockTileKey.get(tileKey) ?? []) {
        addScopedKey(scopedKeys, linkedDockTileKey, safeRadius);
        const coords = parseTileKey(linkedDockTileKey);
        if (!coords) continue;
        for (const neighborKey of frontierNeighborKeys(coords.x, coords.y)) {
          scopedKeys.add(neighborKey);
        }
      }
    }
  }
  return scopedKeys;
};
