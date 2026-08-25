// Neutral-tile ("!tile.ownerId") action list, extracted verbatim out of
// menuActionsForSingleTile (client-tile-action-logic.ts) purely to keep that
// file's line count from growing past the repo's 500-line new-growth cap
// (AGENTS.md) -- no logic changes here, just a code move.
import {
  EXPAND_MANPOWER_COST,
  FRONTIER_CLAIM_COST,
  RELAY_BEACON_BUILD_MS,
  RELAY_BEACON_VISION_BONUS,
  SETTLE_COST,
  SETTLE_MANPOWER_COST,
  structureBuildManpowerCost
} from "@border-empires/shared";
import { canAffordCost, frontierClaimCostLabelForTile } from "../client-constants.js";
import { economicStructureBuildMs } from "../client-map-display.js";
import { settleDurationMsForState } from "../client-queue-logic/client-queue-logic.js";
import { hasFreeResourceSlotsForRelayBeacon, missingRelayBeaconSlotReason } from "../client-relay-beacon-food-slot/client-relay-beacon-food-slot.js";
import { authoritativeIsInReach } from "../client-reach-authoritative/client-reach-authoritative.js";
import { planWaypoint } from "../client-waypoint-planner/client-waypoint-planner.js";
import { formatWaypointSummary } from "../client-waypoint-menu-actions/client-waypoint-menu-actions.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile, TileActionDef } from "../client-types.js";
import {
  tileActionAvailability,
  tileActionAvailabilityWithDevelopmentSlot,
  type TileActionLogicDeps
} from "./client-tile-action-logic.js";

export const neutralTileActions = (
  state: ClientState,
  tile: Tile,
  deps: TileActionLogicDeps,
  helpers: {
    retortRecastActions: () => TileActionDef[];
    crystalCoreActions: () => TileActionDef[];
    createMountainAction: () => TileActionDef;
  }
): TileActionDef[] => {
  const reachable = Boolean(deps.pickOriginForTarget(tile.x, tile.y, false));
  const isInReach = authoritativeIsInReach(state, deps.keyFor);
  const targetInReach = isInReach(tile.x, tile.y);

  const out: TileActionDef[] = [];
  // "Expand To" claims any tile in the world -- if it's already adjacent
  // that's a direct EXPAND; otherwise it walks there first via the exact
  // same multi-step waypoint chain Add Waypoint used to offer as a SEPARATE
  // button for this case (client-action-flow.ts dispatches "settle_land" on
  // a non-adjacent target straight into handleWaypointAction). One button
  // that does the right thing regardless of distance, instead of two
  // buttons the player has to separately notice for near vs. far reach
  // ground. EXPAND is no longer reach-gated server-side, so this now always
  // shows -- an out-of-reach target still shows, using the same
  // waypoint-plan path as an in-reach one, and stays disabled only for the
  // usual cost/affordability reasons.
  // Labeled "Expand To" rather than "Settle Land" -- this claims neutral
  // ground (an EXPAND, possibly via a waypoint chain), it doesn't settle
  // it; "Settle Land" is reserved for the real settle action on a tile
  // already owned as FRONTIER (further below), which is a genuinely
  // different action (pays SETTLE_COST, converts FRONTIER -> SETTLED).
  if (reachable && targetInReach) {
    out.push({
      id: "settle_land",
      label: "Expand To",
      ...tileActionAvailability(
        state.gold >= FRONTIER_CLAIM_COST && state.manpower >= EXPAND_MANPOWER_COST,
        state.manpower < EXPAND_MANPOWER_COST ? `Need ${EXPAND_MANPOWER_COST} manpower` : `Need ${FRONTIER_CLAIM_COST} gold`,
        frontierClaimCostLabelForTile(tile.x, tile.y)
      )
    });
  } else {
    const plan = planWaypoint({ x: tile.x, y: tile.y }, { state, keyFor: deps.keyFor, isInReach });
    if (plan.reachable) {
      out.push({
        id: "settle_land",
        label: "Expand To",
        ...tileActionAvailability(
          canAffordCost(state.gold, plan.totalGold) && state.manpower >= plan.totalManpower,
          state.manpower < plan.totalManpower ? `Need ${plan.totalManpower} manpower` : `Need ${plan.totalGold} gold`,
          formatWaypointSummary(plan)
        )
      });
    }
  }
  // Build Relay Beacon does NOT require adjacency: its handler
  // (client-action-flow.ts, actionId === "build_relay_beacon_frontier")
  // already drives a non-adjacent target over via the same waypoint
  // mechanism "Expand Here" uses, then auto-settles and auto-builds once
  // ownership lands (state.autoSettleTargets/autoBuildTargets) -- that's
  // pre-existing, unrelated to reach, and was never broken. The only real
  // gate here is reach itself (an EXPAND landing outside it is rejected
  // server-side regardless of path); "just don't show it" outside reach,
  // same policy as everything below.
  if (targetInReach) {
    const totalExploreGold = FRONTIER_CLAIM_COST + SETTLE_COST; // build cost is 0
    const totalExploreManpower = EXPAND_MANPOWER_COST + SETTLE_MANPOWER_COST + structureBuildManpowerCost("RELAY_BEACON");
    const totalExploreMs = settleDurationMsForState(state, tile) + RELAY_BEACON_BUILD_MS;
    const exploreEnabled =
      canAffordCost(state.gold, totalExploreGold) &&
      state.manpower >= totalExploreManpower &&
      hasFreeResourceSlotsForRelayBeacon(state);
    out.push({
      id: "build_relay_beacon_frontier" as TileActionDef["id"],
      label: "Build Relay Beacon",
      detail: `Expand your borders • +${RELAY_BEACON_VISION_BONUS} vision`,
      ...tileActionAvailability(
        exploreEnabled,
        state.manpower < totalExploreManpower
          ? `Need ${totalExploreManpower} manpower`
          : !canAffordCost(state.gold, totalExploreGold)
            ? `Need ${totalExploreGold} gold`
            : (missingRelayBeaconSlotReason(state) ?? "Unavailable"),
        `${totalExploreGold > 0 ? `${totalExploreGold} gold, ` : ""}${totalExploreManpower} m.p. • expand + settle + build • ${Math.round(totalExploreMs / 60000)}m total`
      )
    });
  }
  out.push({
    id: "build_foundry",
    label: "Build Foundry",
    detail: deps.buildDetailTextForAction("build_foundry", tile),
    ...tileActionAvailabilityWithDevelopmentSlot(
      reachable &&
        state.techIds.includes("industrial-extraction") &&
        state.gold >= deps.structureGoldCost("FOUNDRY") &&
        state.manpower >= structureBuildManpowerCost("FOUNDRY") &&
        !tile.resource &&
        !tile.town &&
        !tile.dockId,
      !reachable
        ? "Must touch your territory"
        : !state.techIds.includes("industrial-extraction")
          ? "Requires Steam-Driven Extraction"
          : tile.resource || tile.town || tile.dockId
            ? "Needs empty land"
            : state.gold < deps.structureGoldCost("FOUNDRY")
              ? `Need ${deps.structureGoldCost("FOUNDRY")} gold`
              : `Need ${structureBuildManpowerCost("FOUNDRY")} manpower`,
      `${deps.structureCostText("FOUNDRY")} • ${Math.round(economicStructureBuildMs("FOUNDRY") / 60000)}m • doubles mines within 5 tiles; boosted production raises iron/crystal cap`,
      deps.developmentSlotSummary(),
      deps
    )
  });
  out.push(...helpers.retortRecastActions());
  out.push(...helpers.crystalCoreActions());
  out.push(helpers.createMountainAction());
  return out;
};
