import type { Tile } from "./client-types.js";

type StructureStatus = "under_construction" | "active" | "inactive" | "removing";

type StructureStatusLike = { status?: string };

type TileStructureLike = {
  fort?: StructureStatusLike;
  observatory?: StructureStatusLike;
  siegeOutpost?: StructureStatusLike;
  economicStructure?: StructureStatusLike;
};

const structureStatusesForTile = (tile: TileStructureLike): Array<StructureStatus | undefined> => [
  tile.fort?.status as StructureStatus | undefined,
  tile.observatory?.status as StructureStatus | undefined,
  tile.siegeOutpost?.status as StructureStatus | undefined,
  tile.economicStructure?.status as StructureStatus | undefined
];

export const tileHasAnyStructure = (tile: TileStructureLike): boolean =>
  Boolean(tile.fort || tile.observatory || tile.siegeOutpost || tile.economicStructure);

export const tileHasPendingStructureWork = (tile: TileStructureLike): boolean =>
  structureStatusesForTile(tile).some((status) => status === "under_construction" || status === "removing");
