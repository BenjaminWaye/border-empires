// Extracted from client-network.ts (500-line source budget, see AGENTS.md)
// to make room for new tile-overlay wire fields without growing that file
// further.

import type { ClientState } from "../client-state/client-state.js";
import { tileHasTownIdentity } from "../client-town-identity.js";

export const maybeRequestTileDetail = (
  tile: any,
  args: {
    state: Pick<ClientState, "me" | "tileDetailReceivedAt">;
    keyFor: (x: number, y: number) => string;
    requestTileDetailIfNeeded?: (tile: any) => void;
  }
): void => {
  const { state, keyFor, requestTileDetailIfNeeded } = args;
  if (typeof requestTileDetailIfNeeded !== "function") return;
  if (!tile || tile.fogged || tile.detailLevel === "full") return;
  const ownedByMe = tile.ownerId === state.me;
  // Unowned resource/dock tiles carry no server-side economy data — the
  // snapshot already has everything visible. Self-stamp to avoid a round-trip.
  if (
    !ownedByMe &&
    (tile.resource || tile.dockId) &&
    !tileHasTownIdentity(tile) &&
    !tile.fort &&
    !tile.observatory &&
    !tile.siegeOutpost &&
    !tile.economicStructure &&
    !tile.afc
  ) {
    // Stamp tileDetailReceivedAt so the 60s gate in requestTileDetailIfNeeded
    // suppresses the round-trip. We deliberately do NOT write detailLevel:"full"
    // into state.tiles — if this tile later changes ownership or gets a
    // structure built on it, the gate naturally expires and a real request fires.
    state.tileDetailReceivedAt.set(keyFor(tile.x, tile.y), Date.now());
    return;
  }
  if (
    ownedByMe ||
    tile.resource ||
    tile.dockId ||
    tileHasTownIdentity(tile) ||
    tile.fort ||
    tile.observatory ||
    tile.siegeOutpost ||
    tile.economicStructure ||
    tile.afc
  ) {
    requestTileDetailIfNeeded(tile);
  }
};
