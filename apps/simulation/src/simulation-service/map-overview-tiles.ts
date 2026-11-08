import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

// The overview carries geography/territory for both map renderers and minimap.
// Town economy, yields, economic structures and combat detail belong to viewport
// queries. In particular, never parse town/structure JSON or compute an economy
// for each of the 204800 overview tiles.
export const buildMapOverviewTiles = (
  tiles: PlayerSubscriptionSnapshot["tiles"]
): PlayerSubscriptionSnapshot["tiles"] => tiles.map((tile) => ({
  x: tile.x,
  y: tile.y,
  ...(tile.terrain ? { terrain: tile.terrain } : {}),
  ...(tile.resource ? { resource: tile.resource } : {}),
  ...(tile.prospectSignature ? { prospectSignature: tile.prospectSignature } : {}),
  ...(tile.ownerId ? { ownerId: tile.ownerId } : {}),
  ...(tile.reachOwnerId ? { reachOwnerId: tile.reachOwnerId } : {}),
  ...(tile.ownershipState ? { ownershipState: tile.ownershipState } : {}),
  ...(tile.dockId ? { dockId: tile.dockId } : {}),
  // Sparse world landmarks are needed by the minimap even offscreen. These
  // strings are already exported; forwarding them does not rebuild economies.
  ...(tile.watchtowerJson ? { watchtowerJson: tile.watchtowerJson } : {}),
  ...(tile.waystationJson ? { waystationJson: tile.waystationJson } : {}),
  ...(tile.naturalWonderJson ? { naturalWonderJson: tile.naturalWonderJson } : {}),
  ...(tile.townType ? { townType: tile.townType } : {}),
  ...(tile.townName ? { townName: tile.townName } : {}),
  ...(tile.townPopulationTier ? { townPopulationTier: tile.townPopulationTier } : {})
})).sort((a, b) => (a.x - b.x) || (a.y - b.y));
