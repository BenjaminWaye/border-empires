// Relay Beacon build time for the build menu. The first RELAY_BEACON_FIRST_TIER_COUNT
// beacons a player owns are placed instantly; the rest follow D9 (manpower cost x 1s,
// so 100 MP = 100s). Reading the old flat RELAY_BEACON_BUILD_MS (60s) here advertised
// "1m" for a beacon that actually takes longer.
import {
  relayBeaconBuildDurationMs,
  relayBeaconManpowerCost,
  structureBuildDurationMs,
  structureBuildManpowerCost,
  type BuildableStructureType
} from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import { formatCooldownShort } from "../client-app-runtime-utils.js";
import { ownedRelayBeaconCount } from "../client-relay-beacon-food-slot/client-relay-beacon-food-slot.js";

export const relayBeaconBuildDurationMsForState = (state: ClientState): number => relayBeaconBuildDurationMs(ownedRelayBeaconCount(state));

export const relayBeaconManpowerCostForState = (state: ClientState): number => relayBeaconManpowerCost(ownedRelayBeaconCount(state));

// Build/removal times in menus: builds now run seconds to minutes (1s per
// manpower point), so whole-minute rounding showed "0m"/"1m" -- show "1m 40s".
export const buildTimeLabel = (ms: number): string => (ms <= 0 ? "instant" : formatCooldownShort(ms));

export const relayBeaconBuildTimeLabel = (state: ClientState): string => buildTimeLabel(relayBeaconBuildDurationMsForState(state));

// Settle-then-build chain pricing for any structure: only Relay Beacon's manpower
// and build time depend on how many the player already owns.
export const buildManpowerCostForState = (state: ClientState, type: BuildableStructureType): number =>
  type === "RELAY_BEACON" ? relayBeaconManpowerCostForState(state) : structureBuildManpowerCost(type);

export const buildDurationMsForState = (state: ClientState, type: BuildableStructureType): number =>
  type === "RELAY_BEACON" ? relayBeaconBuildDurationMsForState(state) : structureBuildDurationMs(type);
