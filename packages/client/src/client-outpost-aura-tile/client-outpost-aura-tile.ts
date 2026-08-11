import type { Tile } from "../client-types.js";

/**
 * True when `tile` is an active outpost-family structure (siege outpost /
 * siege tower / dread tower, or a Relay Beacon) owned by `playerId`.
 *
 * Mirrors the ownership contribution rule in
 * `packages/shared/src/outpost-aura/outpost-aura.ts` (`tileOutpostMult`), so
 * any structure that grants the attack aura also qualifies for the
 * selected-tile sweep-range visual.
 */
export const hasActiveOwnedOutpostAura = (tile: Tile, playerId: string): boolean => {
  const hasSiegeOutpost = tile.siegeOutpost?.ownerId === playerId && tile.siegeOutpost.status === "active";
  const hasRelayBeacon =
    tile.economicStructure?.ownerId === playerId &&
    tile.economicStructure.type === "RELAY_BEACON" &&
    tile.economicStructure.status === "active";
  return hasSiegeOutpost || hasRelayBeacon;
};
