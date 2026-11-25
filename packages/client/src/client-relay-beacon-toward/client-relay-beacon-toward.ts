// "Relay Beacon toward here": on land outside your reach, where Expand To can take a tile but Garrison and
// Build Relay Beacon are refused, the menu offers a beacon on your garrisoned land whose reach covers this
// tile, else the site nearest it, so a chain of beacons walks reach out to it. Tapping it opens beacon
// placement there (the same preview and Confirm as Build Relay Beacon). Playtest Run 5: a player sent to
// grain outside his reach found no beacon he could build toward it.

import { settleIgnoresReach } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile, TileActionDef } from "../client-types.js";
import { resolveMyReach } from "../client-reach-authoritative/client-reach-authoritative.js";
import { bestRelayBeaconSites, isRelayBeaconBuildTile } from "../client-relay-beacon-site/client-relay-beacon-site.js";
import { hasFreeResourceSlotsForRelayBeacon, missingRelayBeaconSlotReason } from "../client-relay-beacon-food-slot/client-relay-beacon-food-slot.js";
import { tileActionAvailability } from "../client-tile-action-logic/client-tile-action-availability.js";

type At = { x: number; y: number };
type ReachState = Parameters<typeof resolveMyReach>[0] & Pick<ClientState, "tiles" | "me">;

export const RELAY_BEACON_TOWARD_ACTION_ID = "relay_beacon_toward" as const;
export const NO_BEACON_SITE_REASON = "No garrisoned land for a beacon";

/**
 * Where placement starts: a buildable tile, preferring the site that adds the most new reach -- or, with
 * `toward`, a site whose reach covers it, else the site nearest it.
 */
export const relayBeaconStartTile = (state: ReachState, toward?: At): At | undefined => {
  const buildable = (x: number, y: number): boolean => isRelayBeaconBuildTile(state.tiles, state.tiles.get(`${x},${y}`), state.me);
  // With `toward`, the site scorer ranks sites whose reach covers it first, then the nearest (wrap-aware).
  const best = bestRelayBeaconSites(state.tiles, state.me, { reach: resolveMyReach(state), limit: 5, ...(toward ? { targets: [toward] } : {}) })
    .find((site) => buildable(site.x, site.y));
  if (best) return { x: best.x, y: best.y };
  for (const tile of state.tiles.values()) if (isRelayBeaconBuildTile(state.tiles, tile, state.me)) return { x: tile.x, y: tile.y };
  return undefined;
};

/**
 * The action on a land tile outside reach that a beacon could bring in: neutral land (live or fogged), or
 * your own frontier there that Garrison refuses. Undefined anywhere else, including towns and docks, which
 * may be garrisoned out of reach.
 */
export const relayBeaconTowardAction = (state: ReachState & ClientState, tile: Tile): TileActionDef | undefined => {
  if (tile.terrain !== "LAND") return undefined;
  const ownFrontier = tile.ownerId === state.me && tile.ownershipState === "FRONTIER";
  if (tile.ownerId && !ownFrontier) return undefined;
  if (settleIgnoresReach(tile) || resolveMyReach(state).has(`${tile.x},${tile.y}`)) return undefined;
  const site = relayBeaconStartTile(state, tile);
  const slotsFree = hasFreeResourceSlotsForRelayBeacon(state);
  return {
    id: RELAY_BEACON_TOWARD_ACTION_ID,
    label: "Relay Beacon toward here",
    detail: "Widens your reach toward this tile",
    ...tileActionAvailability(Boolean(site) && slotsFree, !site ? NO_BEACON_SITE_REASON : missingRelayBeaconSlotReason(state) ?? NO_BEACON_SITE_REASON)
  };
};

/** Starts beacon placement toward `toward`; false when no tile can take a beacon. The HUD also centres the camera. */
export const startRelayBeaconTowardPlacement = (state: ReachState & Pick<ClientState, "buildingPlacement">, toward: At): At | undefined => {
  const at = relayBeaconStartTile(state, toward);
  if (at) state.buildingPlacement = { active: true, structureType: "RELAY_BEACON", x: at.x, y: at.y };
  return at;
};
