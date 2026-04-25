import type { PlannerPlayerView } from "./planner-world-view.js";

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
      target.add(`${coords.x + dx},${coords.y + dy}`);
    }
  }
};

export const buildPlannerRelevantTileKeys = (
  players: readonly PlannerPlayerView[],
  radius = DEFAULT_PLANNER_SYNC_RADIUS
): Set<string> => {
  const safeRadius = Math.max(0, Math.floor(radius));
  const scopedKeys = new Set<string>();
  for (const player of players) {
    for (const tileKey of player.territoryTileKeys) addScopedKey(scopedKeys, tileKey, safeRadius);
    for (const tileKey of player.frontierTileKeys) addScopedKey(scopedKeys, tileKey, safeRadius);
    for (const tileKey of player.pendingSettlementTileKeys) addScopedKey(scopedKeys, tileKey, safeRadius);
  }
  return scopedKeys;
};
