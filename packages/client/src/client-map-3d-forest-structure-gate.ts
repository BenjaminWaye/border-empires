import { isNetworkResource, type ResourceType } from "@border-empires/shared";
import { standingTreeFilter } from "./client-forest-war/forest-war.js";
import { umbriteDepositDrawnOnTile } from "./client-map-3d-raw-resource-dispatch/client-map-3d-raw-resource-dispatch.js";
import { umbriteDepositForestKeepSlot } from "./client-map-3d-umbrite-deposit.js";
// A built economic structure replaces a forest tile's trees, both in the
// true-3D renderer (this gate) and the 2D canvas renderer (the structure
// sprite simply paints over the tile). Pulled out as a pure function so the
// rule is unit-testable without spinning up the full 3D render loop.
import type { Tile } from "./client-types.js";

export const shouldDrawForestInstance = (forestTile: boolean, tile: Tile | undefined): boolean =>
  forestTile && !tile?.economicStructure && !isNetworkResource(tile?.resource);

// War in a forest thins a tile's trees as well (see client-forest-war/forest-war.ts).
export { standingTreeFilter } from "./client-forest-war/forest-war.js";

// Which of a drawn forest tile's tree slots stand: war thinning, plus the
// clearing an Umbrite deposit on the tile needs (client-map-3d-umbrite-deposit.ts).
export const forestTreeKeepSlot = (
  tile: Tile | undefined, resource: ResourceType | undefined, worldX: number, worldZ: number
): ((slot: number) => boolean) | undefined => {
  const keep = standingTreeFilter(tile, worldX, worldZ);
  return umbriteDepositDrawnOnTile(resource, tile, worldX, worldZ) ? umbriteDepositForestKeepSlot(worldX, worldZ, keep) : keep;
};
