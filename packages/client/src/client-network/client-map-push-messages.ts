import { applyAetherShieldsMessage } from "../client-aether-tower-protection/client-aether-shield-state.js";
import { applyIslandNamesMessage } from "../client-map-name-labels/client-island-names-state.js";
import { applyHouseChargesMessage } from "../client-house-charges/client-house-charges-state.js";
import { announceHouseChargeLosses } from "../client-house-charges/client-house-charges-alerts.js";
import { applyServerReachUpdate } from "../client-reach-authoritative/client-reach-authoritative.js";
import type { ClientState } from "../client-state/client-state.js";
import { houseChargesWithLiveNames } from "../client-house-charges/client-house-charges-live-names.js";
import { celebrateNewlyHeldCharges } from "../client-unlock-celebration/client-unlock-celebration-triggers.js";
import { applyLongestRoadMessage } from "../client-achievements/client-achievements-state.js";
import { applyWelcomeBackMessage } from "../client-welcome-back/client-welcome-back.js";

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
  // This House's charges (client-house-charges/); the Charges panel reads it on the next HUD render.
  if (msg.type === "HOUSE_CHARGES") {
    const prevCharges = state.houseCharges;
    if (applyHouseChargesMessage(state, msg)) {
      const live = houseChargesWithLiveNames(state.houseCharges, state.playerNames);
      // The open keep choice is shown by the sealed-charges bubble (client-house-charges-bubble.ts), not an alert.
      announceHouseChargeLosses(state, live);
      // A kept charge that just became held gets its celebration card (client-unlock-celebration/).
      celebrateNewlyHeldCharges(prevCharges, live);
      renderHud();
    }
    return true;
  }
  // Who holds Longest Road now (client-achievements/); shown on the Ranks screen.
  if (msg.type === "LONGEST_ROAD") {
    if (applyLongestRoadMessage(state, msg)) renderHud();
    return true;
  }
  // What the empire did while the player was away (client-welcome-back/); the Chronicle's headline shows it.
  if (msg.type === "WELCOME_BACK") {
    if (applyWelcomeBackMessage(msg)) renderHud();
    return true;
  }
  return false;
};
