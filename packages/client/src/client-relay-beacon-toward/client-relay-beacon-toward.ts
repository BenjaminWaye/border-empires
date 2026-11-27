// "Relay Beacon toward here": on land outside your reach, where Expand To can take a tile but Garrison and
// Build Relay Beacon are refused, the menu offers a beacon site inside your reach whose reach covers this tile,
// else the site nearest it, so a chain of beacons walks reach out to it. A site can be garrisoned land or, as
// with any beacon, frontier or neutral land in reach that the beacon chain claims and garrisons first.
// Tapping it opens beacon placement there (the same preview and Confirm as Build Relay Beacon).
// Playtest Run 5: a player sent to grain outside his reach found no beacon he could build toward it.

import { chebyshevWithWrap, landmarkConstructionBlocker, settleIgnoresReach } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile, TileActionDef } from "../client-types.js";
import { resolveMyReachCached } from "../client-reach-authoritative/client-reach-authoritative.js";
import { bestRelayBeaconSites } from "../client-relay-beacon-site/client-relay-beacon-site.js";
import { isRelayBeaconPlacementTarget } from "../client-relay-beacon-placement/client-relay-beacon-placement.js";
import { hasFreeResourceSlotsForRelayBeacon, missingRelayBeaconSlotReason } from "../client-relay-beacon-food-slot/client-relay-beacon-food-slot.js";
import { tileActionAvailability } from "../client-tile-action-logic/client-tile-action-availability.js";
import { RELAY_BEACON_TOWARD_LABEL } from "./client-relay-beacon-toward-label.js";

type At = { x: number; y: number };

export const RELAY_BEACON_TOWARD_ACTION_ID = "relay_beacon_toward" as const;
export const NO_BEACON_SITE_REASON = "No beacon site in reach";

/**
 * Where placement starts: a tile placement accepts, never on or beside an AFC or relic center (placement and the
 * server refuse those). The site scorer ranks sites whose reach covers `toward` first, then the nearest (wrap-aware),
 * or with no `toward` the most new reach.
 */
export const relayBeaconStartTile = (state: ClientState, toward?: At): At | undefined => {
  const accepts = (tile: Tile | undefined): tile is Tile =>
    Boolean(tile) && isRelayBeaconPlacementTarget(state, tile) && !landmarkConstructionBlocker(state.tiles, tile!.x, tile!.y);
  const best = bestRelayBeaconSites(state.tiles, state.me, { reach: resolveMyReachCached(state), limit: 5, ...(toward ? { targets: [toward] } : {}) })
    .find((site) => accepts(state.tiles.get(`${site.x},${site.y}`)));
  if (best) return { x: best.x, y: best.y };
  // No site adds reach: any accepted tile, the one nearest `toward` when given.
  let fallback: Tile | undefined;
  for (const tile of state.tiles.values()) {
    if (!accepts(tile)) continue;
    if (!toward) return { x: tile.x, y: tile.y };
    if (!fallback || chebyshevWithWrap(tile.x, tile.y, toward.x, toward.y) < chebyshevWithWrap(fallback.x, fallback.y, toward.x, toward.y)) fallback = tile;
  }
  return fallback ? { x: fallback.x, y: fallback.y } : undefined;
};

/**
 * The action on a land tile outside reach that a beacon could bring in: neutral land (live or fogged), or
 * your own frontier there that Garrison refuses. Undefined anywhere else, including towns and docks, which
 * may be garrisoned out of reach.
 */
export const relayBeaconTowardAction = (state: ClientState, tile: Tile): TileActionDef | undefined => {
  if (tile.terrain !== "LAND") return undefined;
  const ownFrontier = tile.ownerId === state.me && tile.ownershipState === "FRONTIER";
  if (tile.ownerId && !ownFrontier) return undefined;
  if (settleIgnoresReach(tile) || resolveMyReachCached(state).has(`${tile.x},${tile.y}`)) return undefined;
  const site = relayBeaconStartTile(state, tile);
  const slotsFree = hasFreeResourceSlotsForRelayBeacon(state);
  return {
    id: RELAY_BEACON_TOWARD_ACTION_ID,
    label: RELAY_BEACON_TOWARD_LABEL,
    detail: "Widens your reach toward this tile",
    ...tileActionAvailability(Boolean(site) && slotsFree, !site ? NO_BEACON_SITE_REASON : missingRelayBeaconSlotReason(state) ?? NO_BEACON_SITE_REASON)
  };
};

/** Starts beacon placement toward `toward`; false when no tile can take a beacon. The HUD also centres the camera. */
export const startRelayBeaconTowardPlacement = (state: ClientState, toward: At): At | undefined => {
  const at = relayBeaconStartTile(state, toward);
  if (at) state.buildingPlacement = { active: true, structureType: "RELAY_BEACON", x: at.x, y: at.y };
  return at;
};
