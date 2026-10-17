import type { Color, Scene } from "three";
import type { Tile, TileVisibilityState } from "../client-types.js";
import { prospectCluePropsAllowed } from "../client-prospect-clue/client-prospect-clue.js";
import { BLACKWOOD_FOREST_TINT, createProspectClueProps } from "./client-map-3d-prospect-clue-props.js";

// The true-3D prospect clue: per-clue props (client-map-3d-prospect-clue-props.ts)
// that show what the clue actually is. No ground tint -- a coloured wash read
// as territory and confused players. The 2D twin is client-prospect-signature-overlay.ts.

type ProspectTileArgs = {
  tile: Tile | undefined;
  terrain: Tile["terrain"];
  visibility: TileVisibilityState;
  x: number;
  z: number;
  wx: number;
  wy: number;
  /** Highest rendered point of the tile (props stand on it). */
  surfaceY: number;
  /** The tile draws its own forest or sapling trees this frame. */
  treesOnTile: boolean;
};

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
  const props = createProspectClueProps(scene, maxTiles);

  const addTile = (args: ProspectTileArgs): void => {
    const signature = args.tile?.prospectSignature;
    if (!signature || !isLiveClueTile(args.tile, args.terrain, args.visibility) || !prospectCluePropsAllowed(args.tile)) return;
    props.addTile(args.x, args.z, args.surfaceY, args.wx, args.wy, signature, args.treesOnTile);
  };

  return { clear: props.clear, addTile, commit: props.commit, dispose: props.dispose };
};
