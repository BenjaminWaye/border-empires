// Relay Beacon placement covers every tile the tile menu offers Build Relay
// Beacon on, not only settled ones. A beacon on owned FRONTIER land garrisons
// first, and one on neutral land in reach expands, garrisons and then builds.
// Those two used to spend from the menu button at once, with no look at the
// reach the beacon would add (2026-11-17 playtest). Now every beacon goes
// through the placement overlay: the 2D and true-3D previews show the new
// reach on the chosen tile, the label shows the cost, and nothing is spent
// until the player presses Confirm.

import { FRONTIER_CLAIM_COST, SETTLE_COST, frontierBuildBlockedByReach, tileKey } from "@border-empires/shared";
import { canAffordCost } from "../client-constants.js";
import { enqueueRelayBeaconFrontierWaypoint, relayBeaconFrontierBlockMessage } from "../client-adjacent-expand-claim/client-adjacent-expand-claim.js";
import { resolveMyReachCached } from "../client-reach-authoritative/client-reach-authoritative.js";
import { missingRelayBeaconSlotReason } from "../client-relay-beacon-food-slot/client-relay-beacon-food-slot.js";
import { relayBeaconManpowerCostForState } from "../client-relay-beacon-build-time/client-relay-beacon-build-time.js";
import { isRelayBeaconPlacementTile, isRelayBeaconSiteCandidate } from "../client-relay-beacon-site/client-relay-beacon-site.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";

/**
 * Can the player confirm a Relay Beacon placement here? Any tile the tile
 * menu offers Build Relay Beacon on: settled land, owned FRONTIER land in
 * reach, or visible neutral land in reach (isRelayBeaconSiteCandidate). Unlike
 * the onboarding hint, an owned FRONTIER town or dock is allowed: the menu
 * offers the beacon there too.
 */
export const isRelayBeaconPlacementTarget = (state: ClientState, tile: Tile | undefined): boolean => {
  if (isRelayBeaconPlacementTile(tile, state.me)) return true;
  if (!tile) return false;
  const reach = resolveMyReachCached(state);
  if (tile.ownerId === state.me && tile.ownershipState === "FRONTIER") {
    const clear = tile.terrain === "LAND" && !tile.optimisticPending && !tile.economicStructure && !tile.siegeBattery && !tile.observatory;
    const inOwnReach = reach.has(tileKey(tile.x, tile.y));
    // Same shared rule as the menu: towns, docks and captured buildings garrison (and so build) outside reach too.
    return clear && !frontierBuildBlockedByReach(tile, "RELAY_BEACON", { inOwnReach, inAnyReach: inOwnReach || Boolean(tile.reachOwnerId) });
  }
  return isRelayBeaconSiteCandidate(tile, state.me, reach);
};

/** A tap on the tile a Relay Beacon placement is already previewing confirms it (select first, then confirm). */
export const isRelayBeaconPlacementRetap = (state: Pick<ClientState, "buildingPlacement">, x: number, y: number): boolean =>
  state.buildingPlacement.active && state.buildingPlacement.structureType === "RELAY_BEACON" && state.buildingPlacement.x === x && state.buildingPlacement.y === y;

type BeaconChainStep = "build" | "garrison" | "expand";

const chainStepFor = (state: ClientState, tile: Tile): BeaconChainStep =>
  tile.ownerId === state.me ? (tile.ownershipState === "SETTLED" ? "build" : "garrison") : "expand";

/** What confirming here costs: the whole expand + garrison + build chain the tile needs. */
export const relayBeaconPlacementCost = (state: ClientState, tile: Tile): { manpower: number; gold: number } => {
  const step = chainStepFor(state, tile);
  const build = relayBeaconManpowerCostForState(state);
  if (step === "build") return { manpower: build, gold: 0 };
  if (step === "garrison") return { manpower: state.settleManpowerCost + build, gold: SETTLE_COST };
  return { manpower: state.expandManpowerCost + state.settleManpowerCost + build, gold: FRONTIER_CLAIM_COST + SETTLE_COST };
};

/** Short cost line for the placement bar, e.g. "36 m.p., 2 coin". */
export const relayBeaconPlacementCostLabel = (state: ClientState, tile: Tile | undefined): string => {
  if (!tile || !isRelayBeaconPlacementTarget(state, tile)) return "pick a highlighted tile";
  const { manpower, gold } = relayBeaconPlacementCost(state, tile);
  return gold > 0 ? `${manpower} m.p., ${gold} coin` : `${manpower} m.p.`;
};

export type RelayBeaconChainDeps = {
  keyFor: (x: number, y: number) => string;
  sendGameMessage: (payload: unknown, message?: string) => boolean;
  processActionQueue: () => boolean;
  /** Garrison an owned FRONTIER tile, then build the beacon (the action flow's handleBuildAction, placement already confirmed). */
  garrisonThenBuild: (tile: Tile) => void;
  warn: (title: string, detail: string) => void;
};

/**
 * Runs a confirmed beacon placement on a tile that is not settled yet:
 * garrison-then-build for owned FRONTIER, expand-garrison-build for neutral.
 * A settled tile is built directly by the placement flow itself.
 */
export const startRelayBeaconChain = (state: ClientState, tile: Tile, deps: RelayBeaconChainDeps): void => {
  const step = chainStepFor(state, tile);
  if (step === "build") return;
  const { manpower, gold } = relayBeaconPlacementCost(state, tile);
  if (state.manpower < manpower || !canAffordCost(state.gold, gold)) {
    deps.warn("Relay Beacon unaffordable", state.manpower < manpower ? `Need ${manpower} manpower` : `Need ${gold} coin`);
    return;
  }
  const slotReason = missingRelayBeaconSlotReason(state);
  if (slotReason) {
    deps.warn("Relay Beacon blocked", slotReason);
    return;
  }
  if (step === "garrison") {
    deps.garrisonThenBuild(tile);
    return;
  }
  const blockReason = enqueueRelayBeaconFrontierWaypoint(state, tile.x, tile.y, deps.keyFor, deps.sendGameMessage, deps.processActionQueue);
  if (!blockReason) return;
  const { title, detail } = relayBeaconFrontierBlockMessage(blockReason);
  deps.warn(title, detail);
};
