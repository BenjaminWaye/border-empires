// The Relay Beacon pick plus a lazy "is a beacon waiting on one FOOD slot?"
// check for FOOD relief (food-slot-relief.ts). At exactly-full FOOD the beacon
// planner drops every site as unaffordable, so relief can't otherwise tell a
// beacon is blocked only by FOOD. The check counts only a site the AI would
// actually build: worth more than RELAY_BEACON_SITE_VALUE_FLOOR (lower scores
// 0) and not vetoed by a core threat. Otherwise relief would switch off a
// working building and the freed slot would just go to the next FOOD user.
import type { ReachLookup } from "./frontier-command-planner.js";
import { withOneSpareFoodSlot } from "./food-slot-relief-surplus.js";
import { chooseBestRelayBeaconBuild } from "./relay-beacon-command-planner.js";
import type { RelayBeaconSiteSkips } from "./relay-beacon-site-rules.js";
import type { StructurePlannerPlayer, StructurePlannerTile, TileLookup } from "./structure-command-planner.js";
import { beaconBlockedByEnemy, RELAY_BEACON_SITE_VALUE_FLOOR, type DecisionInputs } from "./utility/decisions.js";

export type BeaconPosture = Pick<DecisionInputs, "frontPosture" | "pressureThreatensCore">;

export const planRelayBeaconWithFoodWait = (
  player: StructurePlannerPlayer,
  ownedTiles: readonly StructurePlannerTile[],
  tilesByKey: TileLookup,
  candidates: readonly StructurePlannerTile[],
  reachLookup: ReachLookup | undefined,
  skips: RelayBeaconSiteSkips
): { build: ReturnType<typeof chooseBestRelayBeaconBuild>; waitingOnFood: (posture: BeaconPosture) => boolean } => {
  const build = chooseBestRelayBeaconBuild(player, ownedTiles, tilesByKey, candidates, reachLookup, skips);
  const waitingOnFood = (posture: BeaconPosture): boolean => {
    if (build || beaconBlockedByEnemy(posture)) return false;
    const site = chooseBestRelayBeaconBuild(withOneSpareFoodSlot(player), ownedTiles, tilesByKey, candidates, reachLookup);
    return site !== undefined && site.siteValue > RELAY_BEACON_SITE_VALUE_FLOOR;
  };
  return { build, waitingOnFood };
};
