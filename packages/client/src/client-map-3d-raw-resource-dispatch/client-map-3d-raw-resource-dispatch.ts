import type { ResourceType } from "@border-empires/shared";
import type { Tile } from "../client-types.js";
import type { ResourceKind } from "../client-map-3d-resource-overlay.js";
import { structureReplacesFarmlandPlot } from "../client-map-3d-farmland/client-map-3d-farmland.js";
import type { WaterDirection } from "../client-food-tile-placement.js";
import { shouldRenderRawResource } from "../client-resource-networks/network-resource-3d.js";

type TileOverlay = {
  readonly addInstance: (sceneX: number, sceneZ: number, surfaceY: number, worldTileX: number, worldTileY: number) => void;
};

export type RawResourceOverlays = {
  readonly farmland: TileOverlay;
  readonly fishing: {
    readonly addInstance: (sceneX: number, sceneZ: number, surfaceY: number, worldTileX: number, worldTileY: number, water?: WaterDirection) => void;
  };
  readonly titaniumDeposit: TileOverlay;
  readonly umbriteDeposit: TileOverlay;
  readonly generic: {
    readonly addInstance: (sceneX: number, sceneZ: number, surfaceY: number, resource: ResourceKind, worldTileX: number, worldTileY: number) => void;
  };
};

export type RawResourcePlacement = {
  readonly sceneX: number;
  readonly sceneZ: number;
  readonly surfaceY: number;
  readonly worldTileX: number;
  readonly worldTileY: number;
};

// Routes a tile's raw resource to the overlay that draws it in the true-3D
// map, skipping the raw site when the improvement built on the tile already
// stands in for it (a HYDROGARDEN on FARM, a MINE on TITANIUM/GEMS, an
// UMBRITE_RIG on UMBRITE, a network building on its deposit). The 2D map
// makes the same swap via builtResourceOverlayForTile.
export const addRawResourceInstance = (
  overlays: RawResourceOverlays,
  resource: ResourceType,
  tile: Tile | undefined,
  at: RawResourcePlacement,
  fishingWater: () => WaterDirection | undefined
): void => {
  const { sceneX, sceneZ, surfaceY, worldTileX, worldTileY } = at;
  if (resource === "FARM") {
    if (!structureReplacesFarmlandPlot(tile?.economicStructure?.type)) overlays.farmland.addInstance(sceneX, sceneZ, surfaceY, worldTileX, worldTileY);
    return;
  }
  if (resource === "FISH") {
    overlays.fishing.addInstance(sceneX, sceneZ, surfaceY, worldTileX, worldTileY, fishingWater());
    return;
  }
  if (!shouldRenderRawResource(resource, tile)) return;
  if (resource === "TITANIUM") overlays.titaniumDeposit.addInstance(sceneX, sceneZ, surfaceY, worldTileX, worldTileY);
  else if (resource === "UMBRITE") overlays.umbriteDeposit.addInstance(sceneX, sceneZ, surfaceY, worldTileX, worldTileY);
  else overlays.generic.addInstance(sceneX, sceneZ, surfaceY, resource, worldTileX, worldTileY);
};
