import type { Tile, TileVisibilityState } from "./client-types.js";
import type { ProspectSignature } from "@border-empires/shared";
import { Color } from "three";
import type { OwnershipOverlay } from "./client-map-3d-ownership-overlay.js";
import { hillNeighborFlagsAt } from "./client-map-3d-hill-shape.js";
import { isHillsTile } from "./client-constants.js";
import type { RoadDirections } from "./client-road-network/client-road-network.js";

type ProspectTileArgs = {
  overlay: OwnershipOverlay;
  tile: Tile | undefined;
  terrain: Tile["terrain"];
  visibility: TileVisibilityState;
  x: number;
  z: number;
  wx: number;
  wy: number;
  wxNext: number;
  wyNext: number;
  cornerYAt: (x: number, y: number) => number;
  wrapX: (x: number) => number;
  wrapY: (y: number) => number;
  roadDirsAt: (x: number, y: number) => RoadDirections | undefined;
};

const prospectColor = (signature: ProspectSignature): string =>
  signature === "BLACKWOOD_CANOPY" ? "#3b2550" : signature === "FERROUS_DUST" ? "#806f66" : "#8edce8";

export const addProspectTile = (args: ProspectTileArgs): void => {
  const signature = (args.tile as (Tile & { prospectSignature?: ProspectSignature }) | undefined)?.prospectSignature;
  if (!signature || args.terrain !== "LAND" || args.visibility !== "visible") return;
  const corner00Y = args.cornerYAt(args.wx, args.wy) + 0.012;
  const corner10Y = args.cornerYAt(args.wxNext, args.wy) + 0.012;
  const corner01Y = args.cornerYAt(args.wx, args.wyNext) + 0.012;
  const corner11Y = args.cornerYAt(args.wxNext, args.wyNext) + 0.012;
  const x0 = args.x - 0.5;
  const x1 = args.x + 0.5;
  const z0 = args.z - 0.5;
  const z1 = args.z + 0.5;
  const threeColor = new Color(prospectColor(signature));
  if (isHillsTile(args.wx, args.wy)) {
    args.overlay.addHillTile(x0, x1, z0, z1, corner00Y, corner10Y, corner01Y, corner11Y, threeColor, false, hillNeighborFlagsAt(args.wx, args.wy, isHillsTile, args.wrapX, args.wrapY), args.wx, args.wy, args.roadDirsAt(args.wx, args.wy));
  } else {
    args.overlay.addTile(x0, corner00Y, z0, x1, corner10Y, z0, x0, corner01Y, z1, x1, corner11Y, z1, threeColor, false);
  }
};
