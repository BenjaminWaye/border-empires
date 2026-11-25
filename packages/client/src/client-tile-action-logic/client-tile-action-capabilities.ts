import { hasAbilityAccess } from "../client-afc-module-access/client-afc-module-access.js";
import type { ClientState } from "../client-state/client-state.js";

// Ability capabilities count a module installed on an active AFC the player
// owns, researched or captured (hasAbilityAccess), like the server's cast gates.
export const hasRevealCapability = (state: ClientState): boolean =>
  state.techIds.includes("beacon-towers") || state.activeRevealTargets.length > 0;
export const hasAetherBridgeCapability = (state: ClientState): boolean => hasAbilityAccess(state, "aether_bridge");
export const hasLocalDevAetherWallOverride = (state: ClientState): boolean => state.localhostDevAetherWall === true;
export const hasAetherWallCapability = (state: ClientState): boolean =>
  hasAbilityAccess(state, "aether_wall") || hasLocalDevAetherWallOverride(state);
export const hasSiphonCapability = (state: ClientState): boolean => hasAbilityAccess(state, "siphon");
export const hasRetortRecastingCapability = (state: ClientState): boolean => hasAbilityAccess(state, "retort_recast");
export const hasTerrainShapingCapability = (state: ClientState): boolean => hasAbilityAccess(state, "create_mountain");
