// The tracker's Relay Beacon rows start beacon placement, the same overlay the tile
// menu's Build Relay Beacon opens (client-structure-build-trigger.ts): the player can move it, then confirm.
// The starting tile is the best-scoring site placement accepts (relayBeaconStartTile), else any tile it accepts.

import { relayBeaconStartTile } from "../client-relay-beacon-toward/client-relay-beacon-toward.js";
import { measuredCompactFocusRowOffset } from "./client-hud-v2-compact-camera.js";
import { focusCamera, screenCentre, type HudV2Deps } from "./client-hud-v2-context.js";

type At = { x: number; y: number };

export { relayBeaconStartTile };

/** Starts Relay Beacon placement and centres the map on it; false when no tile can take a beacon. */
export const startRelayBeaconPlacement = (deps: HudV2Deps, toward?: At): boolean => {
  const at = relayBeaconStartTile(deps.state, toward);
  if (!at) return false;
  deps.state.buildingPlacement = { active: true, structureType: "RELAY_BEACON", x: at.x, y: at.y };
  // No map tap started this, so anchor the confirm prompt on the tile the camera is about to centre (camY is
  // shifted down by the same row offset, in tiles of `zoom` px, in both renderers) rather than the last tap.
  const rowOffset = measuredCompactFocusRowOffset(deps.state.zoom);
  focusCamera(deps, at.x, at.y);
  const centre = screenCentre();
  deps.actionFlow.renderPlacementOverlay?.({ x: centre.x, y: centre.y - rowOffset * deps.state.zoom });
  deps.renderHud();
  return true;
};
