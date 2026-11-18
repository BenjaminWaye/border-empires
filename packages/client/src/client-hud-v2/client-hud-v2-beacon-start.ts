// The tracker's "Build a Relay Beacon" next step starts beacon placement, the same overlay the tile
// menu's Build Relay Beacon opens (client-structure-build-trigger.ts): the player can move it, then confirm.
// The starting tile is the best-scoring site the build path accepts, else any tile it accepts.

import type { ClientState } from "../client-state/client-state.js";
import { resolveMyReach } from "../client-reach-authoritative/client-reach-authoritative.js";
import { bestRelayBeaconSites, isRelayBeaconBuildTile } from "../client-relay-beacon-site/client-relay-beacon-site.js";
import { measuredCompactFocusRowOffset } from "./client-hud-v2-compact-camera.js";
import { focusCamera, screenCentre, type HudV2Deps } from "./client-hud-v2-context.js";

/** Where placement starts: a buildable tile, preferring the site that adds the most new reach. */
export const relayBeaconStartTile = (state: Parameters<typeof resolveMyReach>[0] & Pick<ClientState, "tiles" | "me">): { x: number; y: number } | undefined => {
  const buildable = (x: number, y: number): boolean => isRelayBeaconBuildTile(state.tiles, state.tiles.get(`${x},${y}`), state.me);
  const best = bestRelayBeaconSites(state.tiles, state.me, { reach: resolveMyReach(state), limit: 5 }).find((site) => buildable(site.x, site.y));
  if (best) return { x: best.x, y: best.y };
  for (const tile of state.tiles.values()) if (isRelayBeaconBuildTile(state.tiles, tile, state.me)) return { x: tile.x, y: tile.y };
  return undefined;
};

/** Starts Relay Beacon placement and centres the map on it; false when no tile can take a beacon. */
export const startRelayBeaconPlacement = (deps: HudV2Deps): boolean => {
  const at = relayBeaconStartTile(deps.state);
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
