import { applyAetherShieldsMessage } from "../client-aether-tower-protection/client-aether-shield-state.js";
import { applyIslandNamesMessage } from "../client-map-name-labels/client-island-names-state.js";
import { applyServerReachUpdate } from "../client-reach-authoritative/client-reach-authoritative.js";
import type { ClientState } from "../client-state/client-state.js";

// The simulation's change-driven map pushes, each a full replacement of one
// piece of map state (extracted from client-network.ts, 500-line budget).
// Returns true when `msg` was one of them.
export const applyMapPushMessage = (state: ClientState, msg: Record<string, unknown>, renderHud: () => void): boolean => {
  // Authoritative reach (client-reach-authoritative.ts) — replaces the old client-side approximation.
  if (msg.type === "REACH_UPDATE") {
    if (applyServerReachUpdate(state, msg)) renderHud();
    return true;
  }
  // Other players' Aether Tower shields (client-aether-shield-state.ts); the map reads it on its next frame.
  if (msg.type === "AETHER_SHIELDS") {
    applyAetherShieldsMessage(state, msg);
    return true;
  }
  // Island names and their held / contested / fading state (client-map-name-labels/); drawn on the next frame.
  if (msg.type === "ISLAND_NAMES") {
    applyIslandNamesMessage(state, msg);
    return true;
  }
  return false;
};
