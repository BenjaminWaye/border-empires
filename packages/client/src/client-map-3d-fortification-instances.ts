// Per-tile fortification-layer meshes for the true-3D renderer (siege tower,
// fort/Palisade/siege battery, Relay Beacon), extracted from client-map-3d.ts's
// terrain rebuild loop. The 2D counterpart is drawTileFortificationOverlays2D.
import type { Tile } from "./client-types.js";
import { constructionSiteForTile } from "./client-construction-phase/client-construction-phase.js";
import type { FortOverlay } from "./client-map-3d-fort-overlay.js";
import type { RelayBeaconOverlay } from "./client-map-3d-relay-beacon-overlay.js";
import type { SiegeTowerOverlay } from "./client-map-3d-siege-tower-overlay.js";
import {
  DEFAULT_CONTACT_SHADOW_RADIUS_TILES,
  LARGE_CONTACT_SHADOW_RADIUS_TILES,
  type ContactShadowOverlay
} from "./client-map-3d-contact-shadow/client-map-3d-contact-shadow.js";
import {
  fortificationOpeningForTile,
  fortificationOverlayKindForTile,
  siegeAimAwareFacingRadiansForTile,
  stackedRelayBeaconForTile
} from "./client-fortification-overlays/client-fortification-overlays.js";

export type FortificationInstanceOverlays = {
  fortOverlay: Pick<FortOverlay, "addInstance">;
  relayBeaconOverlay: Pick<RelayBeaconOverlay, "addInstance">;
  siegeTowerOverlay: Pick<SiegeTowerOverlay, "addInstance">;
  contactShadowOverlay: Pick<ContactShadowOverlay, "addShadow">;
};

export type FortificationInstanceDeps = {
  state: {
    tiles: Map<string, Tile>;
    siegeAimOverrides: Map<string, { targetX: number; targetY: number; expiresAt: number }>;
  };
  keyFor: (x: number, y: number) => string;
  wrapX: (x: number) => number;
  wrapY: (y: number) => number;
};

export type FortificationInstanceSite = { x: number; z: number; surfaceY: number; wx: number; wy: number };

export const addFortificationInstancesForTile = (
  tile: Tile,
  site: FortificationInstanceSite,
  overlays: FortificationInstanceOverlays,
  deps: FortificationInstanceDeps,
  nowMs: number
): void => {
  const { x, z, surfaceY, wx, wy } = site;
  const siegeTowerVariant = tile.siegeOutpost?.variant === "SIEGE_TOWER" || tile.siegeOutpost?.variant === "DREAD_TOWER" ? tile.siegeOutpost.variant : undefined;
  const beaconInactive = tile.economicStructure?.status === "inactive";
  // A beacon being built or removed is laid out in phases. Wall-clock time, not `nowMs`
  // (the rebuild's performance.now()), because the construction window is in epoch ms.
  const beaconSite = tile.economicStructure?.type === "RELAY_BEACON" ? constructionSiteForTile(tile, Date.now(), "economicStructure") : undefined;
  if (siegeTowerVariant) {
    overlays.siegeTowerOverlay.addInstance(x, z, surfaceY, wx, wy, siegeTowerVariant);
    overlays.contactShadowOverlay.addShadow(x, z, surfaceY, LARGE_CONTACT_SHADOW_RADIUS_TILES);
    return;
  }
  const fortKind = fortificationOverlayKindForTile(tile);
  if (fortKind === "RELAY_BEACON") {
    overlays.relayBeaconOverlay.addInstance(x, z, surfaceY, wx, wy, beaconInactive, beaconSite);
    overlays.contactShadowOverlay.addShadow(x, z, surfaceY, DEFAULT_CONTACT_SHADOW_RADIUS_TILES);
    return;
  }
  if (!fortKind) return;
  const fortDeps = { tiles: deps.state.tiles, keyFor: deps.keyFor, wrapX: deps.wrapX, wrapY: deps.wrapY };
  const opening = fortificationOpeningForTile(tile, fortDeps);
  const facingRad = fortKind === "SIEGE_OUTPOST" ? siegeAimAwareFacingRadiansForTile(tile, fortDeps, deps.state.siegeAimOverrides, nowMs) : undefined;
  overlays.fortOverlay.addInstance(x, z, surfaceY, fortKind, opening, wx, wy, facingRad);
  // LARGE: fort walls run WALL_LENGTH = 0.86 tiles (client-map-3d-fort-overlay.ts) — same reasoning as towns.
  overlays.contactShadowOverlay.addShadow(x, z, surfaceY, LARGE_CONTACT_SHADOW_RADIUS_TILES);
  // A beacon stacked under the fort gets its own mesh: the walls ring the tile
  // edge and the beacon stands in the middle, so the fort no longer hides it.
  if (stackedRelayBeaconForTile(tile)) overlays.relayBeaconOverlay.addInstance(x, z, surfaceY, wx, wy, beaconInactive, beaconSite);
};
