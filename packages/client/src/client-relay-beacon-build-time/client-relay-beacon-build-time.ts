// Relay Beacon build time for the build menu. The first RELAY_BEACON_FIRST_TIER_COUNT
// beacons a player owns are placed instantly; the rest follow D9 (manpower cost x 36s,
// so 100 MP = 1h). Reading the old flat RELAY_BEACON_BUILD_MS (60s, still used for
// removal) here advertised "1m" for a beacon that actually takes an hour.
import {
  relayBeaconBuildDurationMs,
  relayBeaconManpowerCost,
  structureBuildDurationMs,
  structureBuildManpowerCost,
  type BuildableStructureType
} from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import { ownedRelayBeaconCount } from "../client-relay-beacon-food-slot/client-relay-beacon-food-slot.js";

export const relayBeaconBuildDurationMsForState = (state: ClientState): number => relayBeaconBuildDurationMs(ownedRelayBeaconCount(state));

export const relayBeaconManpowerCostForState = (state: ClientState): number => relayBeaconManpowerCost(ownedRelayBeaconCount(state));

export const relayBeaconBuildTimeLabel = (state: ClientState): string => {
  const ms = relayBeaconBuildDurationMsForState(state);
  return ms <= 0 ? "instant" : `${Math.round(ms / 60000)}m`;
};

// Settle-then-build chain pricing for any structure: only Relay Beacon's manpower
// and build time depend on how many the player already owns.
export const buildManpowerCostForState = (state: ClientState, type: BuildableStructureType): number =>
  type === "RELAY_BEACON" ? relayBeaconManpowerCostForState(state) : structureBuildManpowerCost(type);

export const buildDurationMsForState = (state: ClientState, type: BuildableStructureType): number =>
  type === "RELAY_BEACON" ? relayBeaconBuildDurationMsForState(state) : structureBuildDurationMs(type);
