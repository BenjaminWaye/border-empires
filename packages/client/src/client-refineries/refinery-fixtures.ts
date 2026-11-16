// A small client map for refinery tests and Storybook stories, one character
// per tile (origin (95, 95), so the town sits at (100, 100) like the district
// fixtures):
//   .  your SETTLED land     f  your FRONTIER land     _  unowned land
//   ~  sea                   e  rival SETTLED land     T  your City
//   t  your SETTLED titanium r  your FRONTIER titanium x  unowned titanium
//   g  your SETTLED gems     m  your SETTLED umbrite
import type { RefineryType } from "@border-empires/shared";
import type { Tile } from "../client-types.js";
import { districtTownFixture } from "../client-town-district/district-fixtures.js";

export const REFINERY_FIXTURE_ME = "p1";
export const REFINERY_FIXTURE_RIVAL = "p2";
export const REFINERY_FIXTURE_ORIGIN = 95;

/**
 * The default scene: a City at (100, 100); a linked 3-tile Titanium field at
 * (106, 99), (107, 99), (106, 100); an unlinked Titanium deposit at
 * (110, 100) behind unowned land, still within 10 land tiles; a Gems deposit
 * at (100, 104).
 */
export const REFINERY_FIXTURE_ROWS: readonly string[] = [
  "__________________",
  "_.............____",
  "_.............____",
  "_.............____",
  "_..........tt.____",
  "_....T.....t.._x__",
  "_.............____",
  "_.............____",
  "_.............____",
  "_....g........____",
  "__________________"
];

export const refineryFixtureGrid = (rows: readonly string[] = REFINERY_FIXTURE_ROWS, origin = REFINERY_FIXTURE_ORIGIN): Map<string, Tile> => {
  const tiles = new Map<string, Tile>();
  rows.forEach((row, dy) => [...row].forEach((char, dx) => {
    const x = origin + dx, y = origin + dy;
    if (char === "T") {
      tiles.set(`${x},${y}`, districtTownFixture(x, y, "CITY"));
      return;
    }
    const tile: Tile = { x, y, terrain: char === "~" ? "SEA" : "LAND" };
    if (".tgm".includes(char)) Object.assign(tile, { ownerId: REFINERY_FIXTURE_ME, ownershipState: "SETTLED" });
    if ("fr".includes(char)) Object.assign(tile, { ownerId: REFINERY_FIXTURE_ME, ownershipState: "FRONTIER" });
    if (char === "e") Object.assign(tile, { ownerId: REFINERY_FIXTURE_RIVAL, ownershipState: "SETTLED" });
    if ("trx".includes(char)) tile.resource = "TITANIUM";
    if (char === "g") tile.resource = "GEMS";
    if (char === "m") tile.resource = "UMBRITE";
    tiles.set(`${x},${y}`, tile);
  }));
  return tiles;
};

/** Puts a refinery (or booster) on a ring tile, anchored to the town, with an optional field and wire status. */
export const placeRefineryFixture = (
  tiles: Map<string, Tile>, x: number, y: number, type: RefineryType | "TITANIUM_SMELTER" | "UMBRITE_DISTILLERY" | "CRYSTAL_CUTTER",
  options: { field?: { x: number; y: number }; assignedAt?: number; town?: { x: number; y: number }; status?: "active" | "under_construction" | "inactive" | "removing";
    wire?: NonNullable<Tile["economicStructure"]>["refinery"]; ownerId?: string } = {}
): Tile => {
  const tile = tiles.get(`${x},${y}`);
  if (!tile) throw new Error(`no fixture tile at ${x},${y}`);
  tile.economicStructure = {
    type, ownerId: options.ownerId ?? REFINERY_FIXTURE_ME, status: options.status ?? "active", supportAnchor: options.town ?? { x: 100, y: 100 },
    ...(options.field ? { refineryField: { ...options.field, assignedAt: options.assignedAt ?? 1 } } : {}),
    ...(options.wire ? { refinery: options.wire } : {})
  };
  return tile;
};
