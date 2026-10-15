import { buildRuntimePlannerPlayerViews } from "../runtime-state-export.js";
import { buildPlannerTileSlice, toPlannerTileView } from "./planner-world-view-slice.js";
import type { PlannerWorldView } from "./planner-world-view.js";

export function buildRuntimePlannerWorldView(input: Parameters<typeof buildRuntimePlannerPlayerViews>[0]): PlannerWorldView {
  const players = buildRuntimePlannerPlayerViews(input);
  const tiles = new Map(buildPlannerTileSlice({ playerIds: input.playerIds, tiles: input.tiles,
    docks: input.docks, summaryForPlayer: input.summaryForPlayer }).map(tile => [`${tile.x},${tile.y}`, tile]));
  for (const player of players) for (const key of player.tacticalView?.visibleTileKeys ?? []) {
    const tile = input.tiles.get(key);
    if (tile && !tiles.has(key)) tiles.set(key, toPlannerTileView(tile));
  }
  return { players, tiles: [...tiles.values()], docks: input.docks.map(dock => ({ ...dock,
    ...(dock.connectedDockIds?.length ? { connectedDockIds: [...dock.connectedDockIds] } : {}) })) };
}
