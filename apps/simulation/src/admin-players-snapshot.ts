import type { AdminPlayerRow } from "@border-empires/sim-protocol";
import type { SimulationRuntime } from "./runtime/runtime.js";

/**
 * Builds the /admin/players row set from the runtime's player debug
 * snapshot. Extracted out of simulation-service.ts's GetAdminPlayers handler
 * (which is over the 500-line file budget and may not grow further — see
 * AGENTS.md's file-and-type-discipline rule) so that handler stays a
 * one-line call.
 */
export const buildAdminPlayerRows = (runtime: SimulationRuntime): AdminPlayerRow[] => {
  const playerSnapshot = runtime.exportPlayerDebugSnapshot();
  // One combined union across every barbarian-* player (see
  // exportBarbActivationVisibleUnion — it doesn't split the result out per
  // barbarian id), computed once (memoised on the visibility signature) and
  // stamped onto every barbarian-* row below. Skipped entirely when there's
  // no barbarian player to report on.
  const barbActivationVisibleTileCount = playerSnapshot.some((player) => player.id.startsWith("barbarian-"))
    ? runtime.exportBarbActivationVisibleUnion().keys.length
    : undefined;
  return playerSnapshot.map((player) => {
    const isBarbarian = player.id.startsWith("barbarian-");
    return {
      id: player.id,
      name: player.name ?? player.id,
      isAi: player.isAi,
      gold: player.points,
      settledTiles: player.settledTileCount,
      ownedTiles: player.ownedTileCount,
      incomePerMinute: player.incomePerMinute,
      techs: player.techIds.length,
      manpower: player.manpower,
      resourceSlotSupply: player.resourceSlotSupply,
      resourceSlotDemand: player.resourceSlotDemand,
      shardStockpile: player.shardStockpile,
      reachTiles: runtime.reachTileCountForPlayer(player.id),
      frontierTiles: Math.max(0, player.ownedTileCount - player.settledTileCount),
      // barbActivationVisibleTileCount is only ever undefined when no
      // barbarian-* player exists at all, in which case isBarbarian is
      // false here too — so this never spreads an explicit `undefined`.
      ...(isBarbarian && barbActivationVisibleTileCount !== undefined
        ? { barbActivationVisibleTiles: barbActivationVisibleTileCount }
        : {})
    };
  });
};
