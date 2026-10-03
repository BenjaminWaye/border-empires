import { playerHasAbilityTech } from "@border-empires/game-domain";
import type { ClientState } from "../client-state/client-state.js";

export const hasRevealCapability = (state: ClientState): boolean =>
  state.techIds.includes("beacon-towers") || state.activeRevealTargets.length > 0;
export const hasAetherBridgeCapability = (state: ClientState): boolean => playerHasAbilityTech(state.techIds, "aether_bridge");
export const hasLocalDevAetherWallOverride = (state: ClientState): boolean => state.localhostDevAetherWall === true;
export const hasAetherWallCapability = (state: ClientState): boolean =>
  playerHasAbilityTech(state.techIds, "aether_wall") || hasLocalDevAetherWallOverride(state);
export const hasSiphonCapability = (state: ClientState): boolean => playerHasAbilityTech(state.techIds, "siphon");
