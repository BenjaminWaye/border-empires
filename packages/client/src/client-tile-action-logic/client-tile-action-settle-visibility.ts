// Split out of client-tile-action-logic.ts (file-line-cap task): Garrison /
// Garrison Many are pushed last (bottom of the actions list). They always show
// on your own FRONTIER tile -- the "Your frontier" help tells you to garrison
// it and region House Charges ask for exactly that -- disabled with the reason
// when the sim would refuse. Payoff tiles (towns, docks, resources, a grown
// town's support tiles) are highlighted as recommended; plain tiles are not.
// (Until Playtest Run 5 plain tiles hid Garrison entirely before a garrisoned
// town + food tile existed, with no reason shown.)
import { OUT_OF_REACH_LABEL, SETTLE_COST, garrisonBlockedByReach } from "@border-empires/shared";
import { autoSettleOptionForTile, settleOutcomeText } from "../client-auto-settle-prompt/client-auto-settle-tile-option.js";
import { canAffordCost, isForestTile, isHillsTile } from "../client-constants.js";
import { settleDurationMsForState } from "../client-queue-logic/client-queue-logic.js";
import { authoritativeIsInReach } from "../client-reach-authoritative/client-reach-authoritative.js";
import { relayBeaconTowardAction } from "../client-relay-beacon-toward/client-relay-beacon-toward.js";
import { assignedTownForSupportTile } from "../client-support-structures/client-support-structures.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile, TileActionDef } from "../client-types.js";
import { queuedDevelopmentActionExists } from "../client-development-queue/client-development-queue.js";
import { garrisonCostText, townRingGarrisonTiles } from "../client-town-ring-garrison/client-town-ring-garrison.js";
import { tileActionAvailability, type TileActionLogicDeps } from "./client-tile-action-logic.js";

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
  // Towns, docks, resource tiles and a grown town's support tiles have a real payoff (and carry the
  // "auto-settle these" checkbox, which new players need most), so they are highlighted as recommended.
  const hasPayoff = Boolean(
    tile.town || tile.dockId || tile.resource || tile.naturalWonder || assignedTownForSupportTile(state.tiles, tile, state.me)
  );
  // Fixed-border reach: SETTLE is still reach-gated server-side even though EXPAND
  // itself is not -- see runtime-structure-command-handlers.ts. On a FRONTIER tile
  // outside reach, show these actions disabled with the reason instead of hiding them.
  // Mirrors the server's exemption (settleIgnoresReach): towns, docks and captured
  // buildings may be garrisoned out of reach, exactly as the sim does automatically.
  const frontierOutOfReach = garrisonBlockedByReach(tile, authoritativeIsInReach(state, deps.keyFor)(tile.x, tile.y));
  // Garrison refused here: offer the beacon that would bring this tile into reach (Playtest Run 5). With no
  // beacon row to point at, the reason itself names the way out.
  const toward = frontierOutOfReach ? relayBeaconTowardAction(state, tile) : undefined;
  const outOfReachReason = toward ? OUT_OF_REACH_LABEL : `${OUT_OF_REACH_LABEL} · Relay Beacon extends reach`;
  const withReachGate = ([eligible, reason, cost]: [boolean, string, string]): [boolean, string, string] =>
    frontierOutOfReach ? [false, outOfReachReason, cost] : [eligible, reason, cost];

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

  out.push({
    id: "settle_many",
    label: "Garrison Many…",
    detail: "Select or deselect your frontier tiles on the map, then confirm the total cost.",
    disabled: false,
    cost: `${state.settleManpowerCost} manpower per tile • choose on map`
  });
  if (toward) out.push(toward);
  return out;
};
