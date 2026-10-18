import type { Scene } from "three";
import type { TechInfo, Tile, TileVisibilityState } from "../client-types.js";
import { createRetiredProspectCluesLookup, prospectClueShownOnTile } from "../client-prospect-clue/client-prospect-clue.js";
import { isHillsTile } from "../client-constants.js";
import { createProspectClueProps, type GroundYAt } from "./client-map-3d-prospect-clue-props.js";

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
  /** Highest rendered point of the tile (its forest stands there; blackwood's swirl rises above it). */
  surfaceY: number;
  /** Follows a hill tile's dome (client-map-3d-tile-surface-y.ts). */
  flatOverlayY: number;
  cornerYAt: (x: number, y: number) => number;
  /** The tile draws its forest this frame. */
  forestOnTile: boolean;
  /** The player's researched techs: a clue retires once its resource is revealed. */
  techState: { readonly techIds: readonly string[]; readonly techCatalog: readonly TechInfo[] };
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

export const createProspectClueLayer = (scene: Scene, maxTiles: number): ProspectClueLayer => {
  const props = createProspectClueProps(scene, maxTiles);
  const retiredClues = createRetiredProspectCluesLookup();

  const addTile = (args: ProspectTileArgs): void => {
    const signature = args.tile?.prospectSignature;
    if (!signature || !args.tile || args.terrain !== "LAND" || args.visibility !== "visible") return;
    // Same rule as the tile menu, so a clue line never appears without its decoration.
    if (!prospectClueShownOnTile(args.tile, args.forestOnTile, retiredClues(args.techState.techIds, args.techState.techCatalog))) return;
    props.addTile(args.x, args.z, args.surfaceY, groundYAtFor(args), args.wx, args.wy, signature, args.forestOnTile);
  };

  return { clear: props.clear, addTile, commit: props.commit, dispose: props.dispose };
};
