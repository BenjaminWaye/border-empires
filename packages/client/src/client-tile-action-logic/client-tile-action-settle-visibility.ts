// Split out of client-tile-action-logic.ts (file-line-cap task): Settle Land /
// Settle Connected are pushed last (bottom of the actions list) and hidden
// until the player has an established economy (a settled town + a settled
// food tile, farm or fish) -- players kept manually settling exposed frontier
// tiles in the opening minutes expecting some benefit, when in the early game
// there's nothing to gain from it. Once shown, manual settling is really only
// for cheap defense, connecting towns, or consolidating territory.
import { SETTLE_COST, settleIgnoresReach } from "@border-empires/shared";
import { autoSettleOptionForTile, settleOutcomeText } from "../client-auto-settle-prompt/client-auto-settle-tile-option.js";
import { canAffordCost, isForestTile, isHillsTile } from "../client-constants.js";
import { settleDurationMsForState } from "../client-queue-logic/client-queue-logic.js";
import { authoritativeIsInReach } from "../client-reach-authoritative/client-reach-authoritative.js";
import { assignedTownForSupportTile } from "../client-support-structures/client-support-structures.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile, TileActionDef } from "../client-types.js";
import { queuedDevelopmentActionExists } from "../client-development-queue/client-development-queue.js";
import { garrisonCostText, townRingGarrisonTiles } from "../client-town-ring-garrison/client-town-ring-garrison.js";
import { tileActionAvailability, type TileActionLogicDeps } from "./client-tile-action-logic.js";

export const hasEstablishedTownAndFoodTile = (state: ClientState): boolean => {
  let hasTown = false;
  let hasFoodTile = false;
  for (const t of state.tiles.values()) {
    if (t.ownerId !== state.me || t.ownershipState !== "SETTLED") continue;
    if (t.town) hasTown = true;
    if (t.resource === "FARM" || t.resource === "FISH") hasFoodTile = true;
    if (hasTown && hasFoodTile) return true;
  }
  return false;
};

/** "Instant (N free left)" during the first lifetime garrisons, else the timer with its terrain note. */
export const settleTimeLabel = (state: ClientState, tile: Tile): string => {
  const ms = settleDurationMsForState(state, tile);
  if (ms === 0) return `Instant (${state.instantGarrisonsRemaining} free left)`;
  const terrain = isForestTile(tile.x, tile.y) ? " (Forest)" : isHillsTile(tile.x, tile.y) ? " (Hills)" : "";
  return `${Math.round(ms / 1000)}s${terrain}`;
};

export const settleActionsForFrontierTile = (
  state: ClientState,
  tile: Tile,
  deps: TileActionLogicDeps,
  queuedSettlement: boolean
): TileActionDef[] => {
  if (tile.ownershipState !== "FRONTIER" || queuedSettlement) return [];
  // Towns, docks, resource tiles and a grown town's support tiles always get the button: settling them has a real
  // payoff (and carries the "auto-settle these" checkbox, which new players need most), and are listed first and
  // highlighted as recommended. Other plain tiles stay hidden until the economy exists.
  const hasPayoff = Boolean(
    tile.town || tile.dockId || tile.resource || tile.naturalWonder || assignedTownForSupportTile(state.tiles, tile, state.me)
  );
  const established = hasEstablishedTownAndFoodTile(state);
  if (!hasPayoff && !established) return [];
  // Fixed-border reach: SETTLE is still reach-gated server-side even though EXPAND
  // itself is not -- see runtime-structure-command-handlers.ts. On a FRONTIER tile
  // outside reach, show these actions disabled with the reason instead of hiding them.
  // Mirrors the server's exemption (settleIgnoresReach): towns, docks and captured
  // buildings may be garrisoned out of reach, exactly as the sim does automatically.
  const frontierOutOfReach = !settleIgnoresReach(tile) && !authoritativeIsInReach(state, deps.keyFor)(tile.x, tile.y);
  const withReachGate = ([eligible, reason, cost]: [boolean, string, string]): [boolean, string, string] =>
    frontierOutOfReach ? [false, "Outside your reach", cost] : [eligible, reason, cost];

  const isSettling = (tileKey: string): boolean => state.settleProgressByTile.has(tileKey) || queuedDevelopmentActionExists(state, tileKey, "SETTLE");
  const ringCount = townRingGarrisonTiles(state, tile, isSettling).length;
  const ringNote = ringCount > 0 ? `Then garrisons the ${ringCount} tile${ringCount === 1 ? "" : "s"} around it; the town's reach claims them, so no Expand is needed.` : "";
  const out: TileActionDef[] = [
    {
      id: "settle_land",
      label: "Garrison",
      detail: [deps.buildDetailTextForAction("settle_land", tile), settleOutcomeText(state, tile), ringNote].filter(Boolean).join(" "),
      autoSettleOption: autoSettleOptionForTile(state, tile),
      ...(hasPayoff ? { recommended: true } : {}),
      ...tileActionAvailability(
        ...withReachGate([
          canAffordCost(state.gold, SETTLE_COST) && state.manpower >= state.settleManpowerCost,
          state.manpower < state.settleManpowerCost ? `Need ${state.settleManpowerCost} manpower` : `Need ${SETTLE_COST} coin`,
          `${garrisonCostText(state, tile, isSettling)} • ${settleTimeLabel(state, tile)}`
        ])
      )
    }
  ];

  if (established) {
    out.push({
      id: "settle_many",
      label: "Garrison Many…",
      detail: "Select or deselect your frontier tiles on the map, then confirm the total cost.",
      disabled: false,
      cost: `${state.settleManpowerCost} manpower per tile • choose on map`
    });
  }
  return out;
};
