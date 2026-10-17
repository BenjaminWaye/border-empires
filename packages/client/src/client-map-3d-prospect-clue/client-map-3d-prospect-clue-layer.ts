import type { Color, Scene } from "three";
import type { Tile, TileVisibilityState } from "../client-types.js";
import { prospectCluePropsAllowed } from "../client-prospect-clue/client-prospect-clue.js";
import { isHillsTile } from "../client-constants.js";
import { BLACKWOOD_FOREST_TINT, createProspectClueProps, type GroundYAt } from "./client-map-3d-prospect-clue-props.js";

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
  wxNext: number;
  wyNext: number;
  /** Highest rendered point of the tile (blackwood trees stand on it, like createForest's). */
  surfaceY: number;
  /** Follows a hill tile's dome (client-map-3d-tile-surface-y.ts). */
  flatOverlayY: number;
  cornerYAt: (x: number, y: number) => number;
  /** The tile draws its own forest trees this frame (a light-grass sapling doesn't count: blackwood still plants a grove beside it). */
  treesOnTile: boolean;
};

// Flecks and shards hug the ground: on a hill, the dome height; elsewhere the
// heightfield's four corners interpolated at the prop's offset, so they don't
// float on slopes at the tile's highest corner.
const groundYAtFor = (args: ProspectTileArgs): GroundYAt => {
  if (isHillsTile(args.wx, args.wy)) return () => args.flatOverlayY;
  const c00 = args.cornerYAt(args.wx, args.wy);
  const c10 = args.cornerYAt(args.wxNext, args.wy);
  const c01 = args.cornerYAt(args.wx, args.wyNext);
  const c11 = args.cornerYAt(args.wxNext, args.wyNext);
  return (ox, oz) => {
    const u = ox + 0.5;
    const v = oz + 0.5;
    return (c00 + (c10 - c00) * u) * (1 - v) + (c01 + (c11 - c01) * u) * v;
  };
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
    props.addTile(args.x, args.z, args.surfaceY, groundYAtFor(args), args.wx, args.wy, signature, args.treesOnTile);
  };

  return { clear: props.clear, addTile, commit: props.commit, dispose: props.dispose };
};
