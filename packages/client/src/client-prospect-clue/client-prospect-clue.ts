// One home for how the worldgen prospect clues read and look on the client:
// the tile-menu line, the 2D and true-3D map props, and the tech panel's
// "likely nearby" signal all pull from here so they cannot drift apart.
// A clue marks land within a few tiles of a strategic-resource cluster
// (prospectSignatureAt in game-domain's server-worldgen-clusters.ts); it never
// marks the deposit tile itself.
import { prospectSignatureLabel, prospectSignatureResource, type ProspectSignature } from "@border-empires/shared";
import type { Tile } from "../client-types.js";

const RESOURCE_DISPLAY: Record<ReturnType<typeof prospectSignatureResource>, string> = {
  TITANIUM: "Titanium",
  UMBRITE: "Umbrite",
  GEMS: "Crystal"
};

export const prospectClueResourceLabel = (signature: ProspectSignature): string => RESOURCE_DISPLAY[prospectSignatureResource(signature)];

/** A clue prop would clutter a tile that already draws its own feature (town, dock, structure, resource). */
export const prospectCluePropsAllowed = (tile: Tile | undefined): boolean =>
  Boolean(tile) && !tile?.town && !tile?.dockId && !tile?.fort && !tile?.observatory && !tile?.siegeBattery && !tile?.economicStructure && !tile?.resource;

/**
 * Whether the map actually shows this tile's clue: its props, or (blackwood)
 * its own trees darkened. There is no ground tint, so a clue tile showing
 * neither looks ordinary and must not get a tile-menu line either.
 * `treesOnTile`: the tile draws forest or sapling trees.
 */
export const prospectClueShownOnTile = (tile: Tile, treesOnTile: boolean): boolean =>
  Boolean(tile.prospectSignature) && tile.terrain === "LAND" && (prospectCluePropsAllowed(tile) || (tile.prospectSignature === "BLACKWOOD_CANOPY" && treesOnTile));

export const prospectClueOverviewLine = (tile: Tile, treesOnTile: boolean): string | undefined => {
  const signature = tile.prospectSignature;
  if (!signature || !prospectClueShownOnTile(tile, treesOnTile)) return undefined;
  return `${prospectSignatureLabel(signature)}: ${prospectClueResourceLabel(signature)} deposits are likely within a few tiles.`;
};

// Props per clue tile, shared by the 2D (client-prospect-signature-overlay.ts)
// and true-3D (client-map-3d-prospect-clue-props.ts) renderers so a tile shows
// the same number of trees/flecks/shards at the same spots in both.
const PROP_COUNT_RANGE: Record<ProspectSignature, { min: number; max: number }> = {
  BLACKWOOD_CANOPY: { min: 2, max: 3 },
  FERROUS_DUST: { min: 4, max: 6 },
  REFRACTIVE_GROUND: { min: 2, max: 3 }
};

export const prospectCluePropMax = (signature: ProspectSignature): number => PROP_COUNT_RANGE[signature].max;

// Hashed on the world tile so props never reshuffle as the camera pans.
const clueHash = (wx: number, wy: number, salt: number, mod: number): number =>
  (((wx * 73856093) ^ (wy * 19349663) ^ (salt * 83492791)) >>> 0) % mod;

export const prospectCluePropCount = (signature: ProspectSignature, wx: number, wy: number): number => {
  const { min, max } = PROP_COUNT_RANGE[signature];
  return min + clueHash(wx, wy, 53, max - min + 1);
};

/** Deterministic -0.5..0.5 per (tile, salt): prop offsets, sizes and spins. */
export const prospectClueJitter = (wx: number, wy: number, salt: number): number => clueHash(wx, wy, salt, 1000) / 1000 - 0.5;

// Keeps props inside the tile so neighbouring clue tiles don't merge into one blob.
const PROP_SPREAD = 0.72;

/** Tile-local prop centre (-0.36..0.36 from the tile centre) for prop `index`. */
export const prospectCluePropOffset = (wx: number, wy: number, index: number): { ox: number; oy: number } => ({
  ox: prospectClueJitter(wx, wy, 61 + index * 7) * PROP_SPREAD,
  oy: prospectClueJitter(wx, wy, 67 + index * 7) * PROP_SPREAD
});
