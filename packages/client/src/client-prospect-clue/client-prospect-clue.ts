// One home for how the worldgen prospect clues read and look on the client:
// the tile-menu line, the 2D and true-3D map props, and the tech panel's
// "likely nearby" signal all pull from here so they cannot drift apart.
// A clue marks land within a few tiles of a strategic-resource cluster
// (prospectSignatureAt in game-domain's server-worldgen-clusters.ts); it never
// marks the deposit tile itself.
import { prospectSignatureLabel, prospectSignatureResource, type ProspectSignature } from "@border-empires/shared";
import type { TechInfo, Tile } from "../client-types.js";
import { isForestTile } from "../client-constants.js";
import { shouldDrawForestInstance } from "../client-map-3d-forest-structure-gate.js";
import { resourceRevealedByTechs } from "@border-empires/game-domain";

const RESOURCE_DISPLAY: Record<ReturnType<typeof prospectSignatureResource>, string> = {
  TITANIUM: "Titanium",
  UMBRITE: "Umbrite",
  GEMS: "Crystal"
};

export const prospectClueResourceLabel = (signature: ProspectSignature): string => RESOURCE_DISPLAY[prospectSignatureResource(signature)];

/** A clue prop would clutter a tile that already draws its own feature (town, dock, structure, resource, site, wonder). */
export const prospectCluePropsAllowed = (tile: Tile | undefined): boolean =>
  Boolean(tile) &&
  !tile?.town && !tile?.dockId && !tile?.fort && !tile?.observatory && !tile?.siegeBattery && !tile?.economicStructure && !tile?.resource &&
  !tile?.watchtower && !tile?.waystation && !tile?.naturalWonder && !tile?.shardSite;

const ALL_SIGNATURES: readonly ProspectSignature[] = ["FERROUS_DUST", "BLACKWOOD_CANOPY", "REFRACTIVE_GROUND"];
const NO_RETIRED_CLUES: ReadonlySet<ProspectSignature> = new Set();

/**
 * Clues whose resource the player has already revealed by tech: the deposits
 * themselves now show on the map, so the hint has done its job and is hidden.
 * Uses game-domain's reveal rule (resourceRevealedByTechs), the same one the
 * server applies when it starts sending those deposits.
 */
export const retiredProspectClues = (techIds: readonly string[], techCatalog: readonly TechInfo[]): ReadonlySet<ProspectSignature> => {
  const revealCategoryByTech = new Map<string, string>();
  for (const tech of techCatalog) {
    const reveal = tech.effects?.revealResource;
    if (typeof reveal === "string") revealCategoryByTech.set(tech.id, reveal.toLowerCase());
  }
  return new Set(ALL_SIGNATURES.filter((signature) => resourceRevealedByTechs(prospectSignatureResource(signature), techIds, (id) => revealCategoryByTech.get(id))));
};

/** retiredProspectClues memoised on the tech arrays, for per-tile / per-frame callers (the client replaces them, never mutates them). */
export const createRetiredProspectCluesLookup = (): ((techIds: readonly string[], techCatalog: readonly TechInfo[]) => ReadonlySet<ProspectSignature>) => {
  let lastIds: readonly string[] | undefined;
  let lastCatalog: readonly TechInfo[] | undefined;
  let cached = NO_RETIRED_CLUES;
  return (techIds, techCatalog) => {
    if (techIds !== lastIds || techCatalog !== lastCatalog) {
      cached = retiredProspectClues(techIds, techCatalog);
      lastIds = techIds;
      lastCatalog = techCatalog;
    }
    return cached;
  };
};

/**
 * Whether the map actually shows this tile's clue. There is no ground tint,
 * so a clue tile without its decoration -- a fogged one, a feature tile, a
 * retired clue, or blackwood off forest (its swirl only rises from trees) --
 * looks ordinary and must not get a tile-menu line or count as a nearby clue.
 * `forestOnTile`: the tile draws its forest trees.
 */
export const prospectClueShownOnTile = (tile: Tile, forestOnTile: boolean, retired: ReadonlySet<ProspectSignature> = NO_RETIRED_CLUES): boolean =>
  Boolean(tile.prospectSignature) && tile.terrain === "LAND" && !tile.fogged && prospectCluePropsAllowed(tile) &&
  !retired.has(tile.prospectSignature!) && (tile.prospectSignature !== "BLACKWOOD_CANOPY" || forestOnTile);

/** prospectClueShownOnTile with the renderers' own forest gate (client-map-3d-forest-structure-gate.ts). */
export const prospectClueShownAt = (tile: Tile, retired?: ReadonlySet<ProspectSignature>): boolean =>
  prospectClueShownOnTile(tile, shouldDrawForestInstance(isForestTile(tile.x, tile.y), tile), retired);

export const prospectClueOverviewLine = (tile: Tile, retired?: ReadonlySet<ProspectSignature>): string | undefined => {
  const signature = tile.prospectSignature;
  if (!signature || !prospectClueShownAt(tile, retired)) return undefined;
  return `${prospectSignatureLabel(signature)}: ${prospectClueResourceLabel(signature)} deposits are likely within a few tiles.`;
};

// Ground props per clue tile, shared by the 2D (client-prospect-signature-overlay.ts)
// and true-3D (client-map-3d-prospect-clue-props.ts) renderers so a tile shows
// the same number of flecks/shards at the same spots in both. Blackwood has no
// ground props: it is a swirl over the forest (see BLACKWOOD_SWIRL_* below).
type GroundClue = Exclude<ProspectSignature, "BLACKWOOD_CANOPY">;
const PROP_COUNT_RANGE: Record<GroundClue, { min: number; max: number }> = {
  FERROUS_DUST: { min: 4, max: 6 },
  REFRACTIVE_GROUND: { min: 1, max: 2 }
};

export const prospectCluePropMax = (signature: GroundClue): number => PROP_COUNT_RANGE[signature].max;

// Hashed on the world tile so props never reshuffle as the camera pans. The
// avalanche step matters: without it, `% 2` of the multiply-xor reduces to
// (wx ^ wy) parity and prop counts formed a strict checkerboard.
const clueHash = (wx: number, wy: number, salt: number, mod: number): number => {
  let h = (Math.imul(wx, 73856093) ^ Math.imul(wy, 19349663) ^ Math.imul(salt, 83492791)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) % mod;
};

export const prospectCluePropCount = (signature: GroundClue, wx: number, wy: number): number => {
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

// Blackwood canopy: every BLACKWOOD_SWIRL_PERIOD_S seconds a purple swirl
// rises out of the tile's forest and fades over BLACKWOOD_SWIRL_ACTIVE_S.
// Each tile gets its own phase so a blackwood wood flickers rather than
// pulsing in unison. Shared by both renderers so a tile swirls at the same
// moment in 2D and 3D.
export const BLACKWOOD_SWIRL_PERIOD_S = 5;
export const BLACKWOOD_SWIRL_ACTIVE_S = 1.8;

export const blackwoodSwirlPhaseS = (wx: number, wy: number): number => (prospectClueJitter(wx, wy, 151) + 0.5) * BLACKWOOD_SWIRL_PERIOD_S;

/** 0..1 through this tile's current swirl, or undefined between swirls. */
export const blackwoodSwirlProgress = (wx: number, wy: number, nowS: number): number | undefined => {
  const t = (nowS + blackwoodSwirlPhaseS(wx, wy)) % BLACKWOOD_SWIRL_PERIOD_S;
  return t < BLACKWOOD_SWIRL_ACTIVE_S ? t / BLACKWOOD_SWIRL_ACTIVE_S : undefined;
};
