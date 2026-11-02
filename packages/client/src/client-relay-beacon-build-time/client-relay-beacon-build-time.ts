// Relay Beacon build time for the build menu. The first RELAY_BEACON_FIRST_TIER_COUNT
// beacons a player owns are placed instantly; the rest take the flat STRUCTURE_BUILD_MS.
import {
  relayBeaconBuildDurationMs,
  relayBeaconManpowerCost,
  structureBuildDurationMs,
  structureBuildManpowerCost,
  type BuildableStructureType
} from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import { formatCooldownShort } from "../client-app-runtime-utils.js";
import { buildMsWithSpeedForState } from "../client-build-speed/client-build-speed.js";
import { ownedRelayBeaconCount } from "../client-relay-beacon-food-slot/client-relay-beacon-food-slot.js";
import { structureManpowerCostForState } from "../client-structure-manpower-cost/client-structure-manpower-cost.js";

export const relayBeaconBuildDurationMsForState = (state: ClientState): number => relayBeaconBuildDurationMs(ownedRelayBeaconCount(state));

export const relayBeaconManpowerCostForState = (state: ClientState): number =>
  structureManpowerCostForState(state, "RELAY_BEACON", relayBeaconManpowerCost(ownedRelayBeaconCount(state)));

// Build/removal times in menus: builds run under a minute once speed effects
// apply, so whole-minute rounding would show "0m" -- show "30s".
export const buildTimeLabel = (ms: number): string => (ms <= 0 ? "instant" : formatCooldownShort(ms));

export const relayBeaconBuildTimeLabel = (state: ClientState): string => buildTimeLabel(relayBeaconBuildDurationMsForState(state));

// Settle-then-build chain pricing for any structure: only Relay Beacon's manpower
// and build time depend on how many the player already owns.
export const buildManpowerCostForState = (state: ClientState, type: BuildableStructureType): number =>
  type === "RELAY_BEACON" ? relayBeaconManpowerCostForState(state) : structureManpowerCostForState(state, type, structureBuildManpowerCost(type));

export const buildDurationMsForState = (state: ClientState, type: BuildableStructureType): number =>
  type === "RELAY_BEACON" ? relayBeaconBuildDurationMsForState(state) : buildMsWithSpeedForState(state, type, structureBuildDurationMs(type));
