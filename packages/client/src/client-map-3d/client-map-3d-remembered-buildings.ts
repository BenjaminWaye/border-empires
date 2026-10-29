// Buildings on a tile remembered under fog: seen before, out of sight now.
// The client keeps the tile as it was the last time it was witnessed (the
// FOG delta freezes it), so its town, structures, fort, dock, watchtower and
// waystation are drawn where they stood -- but standing still: no spinning
// parts, no smoke or steam, no build in progress, no owner-only badges. They
// sit under the fogged mist, which hazes every building material above the
// sheet (client-map-3d-fogged-mist-haze.ts). The 2D counterpart is
// drawRememberedStructures2D.
import type { Tile } from "../client-types.js";
import type { TownOverlay } from "../client-map-3d-town-overlay.js";
import type { DockOverlay } from "../client-map-3d-dock-overlay.js";
import type { WatchtowerOverlay } from "../client-map-3d-watchtower-overlay.js";
import type { WaystationOverlay } from "../client-map-3d-waystation-overlay.js";
import { townIdentityForTile } from "../client-town-identity.js";
import { dockRotationAt } from "../client-map-3d-dock-rotation/client-map-3d-dock-rotation.js";
import { DEFAULT_CONTACT_SHADOW_RADIUS_TILES, LARGE_CONTACT_SHADOW_RADIUS_TILES } from "../client-map-3d-contact-shadow/client-map-3d-contact-shadow.js";
import { addBuildingInstancesForTile, type BuildingOverlays, type BuildingState } from "./client-map-3d-building-instances.js";
import {
  addFortificationInstancesForTile,
  type FortificationInstanceDeps,
  type FortificationInstanceOverlays
} from "../client-map-3d-fortification-instances.js";

export type RememberedBuildingLayers = {
  readonly townOverlay: Pick<TownOverlay, "addInstance">;
  readonly dockOverlay: Pick<DockOverlay, "addInstance">;
  readonly watchtowerOverlay: Pick<WatchtowerOverlay, "addInstance">;
  readonly waystationOverlay: Pick<WaystationOverlay, "addInstance">;
  /** Economic structures, district buildings and Aether Towers; its contact shadows serve every layer here. */
  readonly buildings: BuildingOverlays;
  readonly fortifications: FortificationInstanceOverlays;
};

export type RememberedBuildingContext = FortificationInstanceDeps & {
  readonly state: FortificationInstanceDeps["state"] & BuildingState;
  readonly terrainAt: (wx: number, wy: number) => Tile["terrain"];
  /** Heightfield elevation at a world tile, for the dock deck. */
  readonly elevationAt: (wx: number, wy: number) => number;
  readonly dockEndpointKeys: ReadonlySet<string>;
  readonly rebuildStartAt: number;
};

export type RememberedBuildingSite = {
  readonly x: number;
  readonly z: number;
  readonly surfaceY: number;
  readonly wx: number;
  readonly wy: number;
  readonly tileKey: string;
};

export const addRememberedBuildingsForTile = (
  tile: Tile,
  site: RememberedBuildingSite,
  layers: RememberedBuildingLayers,
  context: RememberedBuildingContext
): void => {
  if (tile.terrain !== "LAND") return;
  const { x, z, surfaceY, wx, wy } = site;
  const shadows = layers.buildings.contactShadowOverlay;
  if (tile.dockId || context.dockEndpointKeys.has(site.tileKey)) {
    const dockSurfaceY = Math.max(context.elevationAt(wx, wy), -0.04) + 0.02;
    layers.dockOverlay.addInstance(x, z, dockSurfaceY, dockRotationAt(wx, wy, context.terrainAt, context.wrapX, context.wrapY), wx, wy);
    shadows.addShadow(x, z, dockSurfaceY, DEFAULT_CONTACT_SHADOW_RADIUS_TILES);
  }
  const townTier = townIdentityForTile(tile)?.populationTier;
  if (townTier) {
    layers.townOverlay.addInstance(x, z, surfaceY, townTier, wx, wy, true);
    shadows.addShadow(x, z, surfaceY, LARGE_CONTACT_SHADOW_RADIUS_TILES);
  }
  if (tile.watchtower) {
    layers.watchtowerOverlay.addInstance(x, z, surfaceY, wx, wy, tile.watchtower, true);
    shadows.addShadow(x, z, surfaceY, DEFAULT_CONTACT_SHADOW_RADIUS_TILES);
  }
  if (tile.waystation) {
    layers.waystationOverlay.addInstance(x, z, surfaceY, wx, wy, tile.waystation, true);
    shadows.addShadow(x, z, surfaceY, DEFAULT_CONTACT_SHADOW_RADIUS_TILES);
  }
  addBuildingInstancesForTile(tile, site, layers.buildings, context.state, context.rebuildStartAt, tile.resource, true);
  addFortificationInstancesForTile(tile, site, layers.fortifications, context, context.rebuildStartAt, true);
};
