import { Color, type Scene } from "three";
import type { Tile, TileVisibilityState } from "../client-types.js";
import { prospectClueColor, prospectCluePropsAllowed } from "../client-prospect-clue/client-prospect-clue.js";
import { createOwnershipOverlay } from "../client-map-3d-ownership-overlay.js";
import { hillNeighborFlagsAt } from "../client-map-3d-hill-shape.js";
import { isHillsTile } from "../client-constants.js";
import type { RoadDirections } from "../client-road-network/client-road-network.js";
import { BLACKWOOD_FOREST_TINT, createProspectClueProps } from "./client-map-3d-prospect-clue-props.js";

// The true-3D prospect clue: a light ground tint (so a clue region is still
// spottable zoomed out) under per-clue props (client-map-3d-prospect-clue-props.ts)
// that show what the clue actually is. The 2D twin is client-prospect-signature-overlay.ts.

type ProspectTileArgs = {
  tile: Tile | undefined;
  terrain: Tile["terrain"];
  visibility: TileVisibilityState;
  x: number;
  z: number;
  wx: number;
  wy: number;
  wxNext: number;
  wyNext: number;
  /** Highest rendered point of the tile (props stand on it). */
  surfaceY: number;
  /** The tile draws its own forest or sapling trees this frame. */
  treesOnTile: boolean;
  cornerYAt: (x: number, y: number) => number;
  wrapX: (x: number) => number;
  wrapY: (y: number) => number;
  roadDirsAt: (x: number, y: number) => RoadDirections | undefined;
};

// Was 0.4 when the tint was the whole clue; the props carry it now, so the
// ground wash only needs to hint at the region's edge without reading as a
// flat colour block.
export const PROSPECT_CLUE_OPACITY = 0.22;

export type ProspectClueLayer = {
  readonly clear: () => void;
  readonly addTile: (args: ProspectTileArgs) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

const isLiveClueTile = (tile: Tile | undefined, terrain: Tile["terrain"], visibility: TileVisibilityState): boolean =>
  Boolean(tile?.prospectSignature) && terrain === "LAND" && visibility === "visible";

/** Tint for a live tile's own forest/sapling trees: blackwood turns the canopy itself black. */
export const prospectClueTreeTint = (tile: Tile | undefined, terrain: Tile["terrain"], visibility: TileVisibilityState): Color | undefined =>
  tile?.prospectSignature === "BLACKWOOD_CANOPY" && isLiveClueTile(tile, terrain, visibility) ? BLACKWOOD_FOREST_TINT : undefined;

export const createProspectClueLayer = (scene: Scene, maxTiles: number): ProspectClueLayer => {
  const overlay = createOwnershipOverlay(scene, maxTiles, { settled: PROSPECT_CLUE_OPACITY, frontier: PROSPECT_CLUE_OPACITY });
  const props = createProspectClueProps(scene, maxTiles);
  const tint = new Color();

  const addTile = (args: ProspectTileArgs): void => {
    const signature = args.tile?.prospectSignature;
    if (!signature || !isLiveClueTile(args.tile, args.terrain, args.visibility)) return;
    const corner00Y = args.cornerYAt(args.wx, args.wy) + 0.012;
    const corner10Y = args.cornerYAt(args.wxNext, args.wy) + 0.012;
    const corner01Y = args.cornerYAt(args.wx, args.wyNext) + 0.012;
    const corner11Y = args.cornerYAt(args.wxNext, args.wyNext) + 0.012;
    const x0 = args.x - 0.5;
    const x1 = args.x + 0.5;
    const z0 = args.z - 0.5;
    const z1 = args.z + 0.5;
    tint.set(prospectClueColor(signature));
    if (isHillsTile(args.wx, args.wy)) {
      overlay.addHillTile(x0, x1, z0, z1, corner00Y, corner10Y, corner01Y, corner11Y, tint, false, hillNeighborFlagsAt(args.wx, args.wy, isHillsTile, args.wrapX, args.wrapY), args.wx, args.wy, args.roadDirsAt(args.wx, args.wy));
    } else {
      overlay.addTile(x0, corner00Y, z0, x1, corner10Y, z0, x0, corner01Y, z1, x1, corner11Y, z1, tint, false);
    }
    if (prospectCluePropsAllowed(args.tile)) props.addTile(args.x, args.z, args.surfaceY, args.wx, args.wy, signature, args.treesOnTile);
  };

  return {
    clear: () => {
      overlay.clear();
      props.clear();
    },
    addTile,
    commit: () => {
      overlay.commit();
      props.commit();
    },
    dispose: () => {
      overlay.dispose();
      props.dispose();
    }
  };
};
