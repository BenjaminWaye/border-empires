import { defendingFortVariant, isFortDefending, OUTPOST_AURA_RADIUS } from "@border-empires/shared";
import type { Tile } from "../client-types.js";

export type FortificationOverlayKind = "FORT" | "TITANIUM_BASTION" | "THUNDER_BASTION" | "SIEGE_BATTERY" | "PALISADE" | "RELAY_BEACON";
export type FortificationSide = "NORTH" | "EAST" | "SOUTH" | "WEST";
const FORTIFICATION_SIDES: ReadonlyArray<FortificationSide> = ["NORTH", "EAST", "SOUTH", "WEST"];

// Every combination of open sides, named by its open sides in N/E/S/W order
// joined with "_" ("NORTH_EAST", "EAST_WEST", ...). A fort opens every wall
// that touches another fort of the same owner, so a block of forts reads as
// one continuous fortification.
export const FORTIFICATION_OPENINGS = [
  "CLOSED", "NORTH", "EAST", "NORTH_EAST", "SOUTH", "NORTH_SOUTH", "EAST_SOUTH", "NORTH_EAST_SOUTH",
  "WEST", "NORTH_WEST", "EAST_WEST", "NORTH_EAST_WEST", "SOUTH_WEST", "NORTH_SOUTH_WEST", "EAST_SOUTH_WEST", "NORTH_EAST_SOUTH_WEST"
] as const;
export type FortificationOpening = (typeof FORTIFICATION_OPENINGS)[number];

export const fortificationOpeningSides = (opening: FortificationOpening): FortificationSide[] =>
  opening === "CLOSED" ? [] : FORTIFICATION_SIDES.filter((side) => opening.split("_").includes(side));

export const recordForEachFortificationOpening = <T>(valueFor: (opening: FortificationOpening) => T): Record<FortificationOpening, T> => {
  const record: Partial<Record<FortificationOpening, T>> = {};
  for (const opening of FORTIFICATION_OPENINGS) record[opening] = valueFor(opening);
  return record as Record<FortificationOpening, T>;
};

export const fortificationOpeningFromSides = (sides: Iterable<FortificationSide>): FortificationOpening => {
  const open = new Set(sides);
  // FORTIFICATION_OPENINGS is indexed by the N=1/E=2/S=4/W=8 bitmask of open sides.
  const mask = FORTIFICATION_SIDES.reduce((acc, side, bit) => (open.has(side) ? acc | (1 << bit) : acc), 0);
  return FORTIFICATION_OPENINGS[mask] ?? "CLOSED";
};

export type FortificationOverlayDeps = {
  tiles: Map<string, Tile>;
  keyFor: (x: number, y: number) => string;
  wrapX: (x: number) => number;
  wrapY: (y: number) => number;
};

const CARDINAL_STEPS: Array<{ dx: number; dy: number; opening: FortificationSide }> = [
  { dx: 0, dy: -1, opening: "NORTH" },
  { dx: 1, dy: 0, opening: "EAST" },
  { dx: 0, dy: 1, opening: "SOUTH" },
  { dx: -1, dy: 0, opening: "WEST" }
];

const fortOverlayKind = (fort: NonNullable<Tile["fort"]>): FortificationOverlayKind => {
  // Mid-upgrade, the tier being upgraded from is what's standing on the tile.
  const variant = defendingFortVariant(fort) ?? fort.variant;
  if (variant === "TITANIUM_BASTION" || variant === "THUNDER_BASTION" || variant === "PALISADE") return variant;
  return "FORT";
};

// The tile's fortification-layer overlay. A Relay Beacon sharing the tile with
// a fort isn't reported here -- see stackedRelayBeaconForTile.
export const fortificationOverlayKindForTile = (tile: Tile | undefined): FortificationOverlayKind | undefined => {
  if (!tile) return undefined;
  if (tile.fort) return fortOverlayKind(tile.fort);
  if (tile.siegeBattery) return "SIEGE_BATTERY";
  if (tile.economicStructure?.type === "RELAY_BEACON") return "RELAY_BEACON";
  return undefined;
};

// A Relay Beacon stacked under a Palisade/Fort: renderers draw it as a second
// overlay on top of the fortification one, so the fort doesn't hide it.
export const stackedRelayBeaconForTile = (tile: Tile | undefined): boolean =>
  Boolean(tile?.fort && tile.economicStructure?.type === "RELAY_BEACON");

export const isFortificationOverlayTile = (tile: Tile | undefined): boolean => Boolean(fortificationOverlayKindForTile(tile));

export const fortificationOwnerIdForTile = (tile: Tile | undefined): string | undefined =>
  tile?.fort?.ownerId ?? tile?.siegeBattery?.ownerId ?? tile?.economicStructure?.ownerId ?? tile?.ownerId;

export const fortificationOverlayAlphaForTile = (tile: Tile | undefined, kind?: FortificationOverlayKind): number => {
  if (!tile) return 1;
  const status = kind === "RELAY_BEACON"
    ? tile.economicStructure?.status
    : isFortDefending(tile.fort) ? "active" : tile.fort?.status ?? tile.siegeBattery?.status ?? tile.economicStructure?.status;
  if (status === "active") return 1;
  if (status === "under_construction") return 0.82;
  if (status === "inactive") return 0.78;
  if (status === "removing") return 0.64;
  return 1;
};

export const fortificationOpeningForTile = (
  tile: Tile | undefined,
  deps: FortificationOverlayDeps
): FortificationOpening => {
  if (!tile) return "CLOSED";
  const kind = fortificationOverlayKindForTile(tile);
  if (!kind || kind === "RELAY_BEACON" || kind === "SIEGE_BATTERY") return "CLOSED";
  const ownerId = fortificationOwnerIdForTile(tile);
  if (!ownerId) return "CLOSED";
  // Walls only join between standing forts: a fresh site (or one being torn
  // down) would otherwise gut a finished neighbour's walls while it is still
  // a bare plot. A fort mid-upgrade still stands, see isFortDefending.
  if (!isFortDefending(tile.fort)) return "CLOSED";
  const open: FortificationSide[] = [];
  for (const step of CARDINAL_STEPS) {
    const neighbor = deps.tiles.get(deps.keyFor(deps.wrapX(tile.x + step.dx), deps.wrapY(tile.y + step.dy)));
    if (!isFortificationOverlayTile(neighbor)) continue;
    if (fortificationOverlayKindForTile(neighbor) === "RELAY_BEACON" || fortificationOverlayKindForTile(neighbor) === "SIEGE_BATTERY") {
      continue;
    }
    if (fortificationOwnerIdForTile(neighbor) !== ownerId) continue;
    if (!isFortDefending(neighbor?.fort)) continue;
    open.push(step.opening);
  }
  return fortificationOpeningFromSides(open);
};

// Search radius (in tiles) for the Siege Battery's aim heuristic below.
// Client-visual only: bounded so the scan stays cheap (168 lookups worst
// case) regardless of map size, and because a battery aiming at a target
// this far outside its own reach ring would not read as "aiming at the
// threat" anyway.
const FACING_SEARCH_RADIUS = 6;

// All (dx, dy) offsets in the search box, excluding the origin, sorted by
// ascending distance so the loop below finds the *nearest* rival tile.
// Precomputed once at module load rather than per call.
const FACING_SEARCH_OFFSETS: ReadonlyArray<{ dx: number; dy: number }> = (() => {
  const offsets: Array<{ dx: number; dy: number }> = [];
  for (let dy = -FACING_SEARCH_RADIUS; dy <= FACING_SEARCH_RADIUS; dy += 1) {
    for (let dx = -FACING_SEARCH_RADIUS; dx <= FACING_SEARCH_RADIUS; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      offsets.push({ dx, dy });
    }
  }
  offsets.sort((a, b) => a.dx * a.dx + a.dy * a.dy - (b.dx * b.dx + b.dy * b.dy));
  return offsets;
})();

// The same nearest-first offsets cut to the sim's siege range (a Chebyshev
// square of OUTPOST_AURA_RADIUS), for nearestSiegeBatteryTileForBattle below.
const SIEGE_RANGE_OFFSETS = FACING_SEARCH_OFFSETS.filter(({ dx, dy }) => Math.max(Math.abs(dx), Math.abs(dy)) <= OUTPOST_AURA_RADIUS);

/**
 * Yaw (radians, matching the 3D model's rotationY convention where 0 already
 * faces tile-local +z/"south") for a Siege Battery to visually aim itself at
 * the nearest rival-owned tile within FACING_SEARCH_RADIUS. Purely cosmetic:
 * it only reorients the model/sprite, it does not change targeting, range,
 * or combat math. Falls back to the model's default south-facing pose (0)
 * when the tile isn't a battery, has no owner, or no rival tile is known
 * within range (including simply being out of this player's vision).
 */
export const siegeBatteryFacingRadiansForTile = (
  tile: Tile | undefined,
  deps: FortificationOverlayDeps
): number => {
  if (!tile || fortificationOverlayKindForTile(tile) !== "SIEGE_BATTERY") return 0;
  const ownerId = fortificationOwnerIdForTile(tile);
  if (!ownerId) return 0;
  for (const { dx, dy } of FACING_SEARCH_OFFSETS) {
    const neighbor = deps.tiles.get(deps.keyFor(deps.wrapX(tile.x + dx), deps.wrapY(tile.y + dy)));
    const neighborOwnerId = neighbor?.ownerId;
    if (neighborOwnerId && neighborOwnerId !== ownerId) return Math.atan2(dx, dy);
  }
  return 0;
};

/**
 * Finds the nearest tile within FACING_SEARCH_RADIUS of (battleX, battleY)
 * whose siegeBattery is owned by `attackerOwnerId`. Used to pick which of
 * the attacker's Siege Battery/Tower/Dread Tower structures should turn to
 * aim at a battle that just started (see triggerSiegeBombardmentForNewBattle
 * in client-battle-overlay/client-siege-bombardment.ts). Client-visual only,
 * same framing as siegeBatteryFacingRadiansForTile above: it never affects
 * targeting, range, or combat math, only which structure plays the FX.
 *
 * Only structures that actually boost this battle count, mirroring the sim's
 * attackerOutpostMult (apps/simulation/src/runtime-combat-support.ts): the
 * battery must be active (not still under construction or being removed),
 * stand on a tile the attacker still owns, and be within
 * OUTPOST_AURA_RADIUS (Chebyshev) of the battle tile. Without these gates a
 * half-built battery, or one up to a tile past siege range, fired the
 * bombardment for a battle it had no part in.
 */
export const siegeStructureBoostsAttacker = (tile: Tile | undefined, attackerOwnerId: string): boolean =>
  tile?.ownerId === attackerOwnerId && tile.siegeBattery?.ownerId === attackerOwnerId && tile.siegeBattery.status === "active";

export const nearestSiegeBatteryTileForBattle = (
  deps: FortificationOverlayDeps,
  battleX: number,
  battleY: number,
  attackerOwnerId: string
): { x: number; y: number } | undefined => {
  const boostsBattle = (tile: Tile | undefined): boolean => siegeStructureBoostsAttacker(tile, attackerOwnerId);
  if (boostsBattle(deps.tiles.get(deps.keyFor(battleX, battleY)))) return { x: battleX, y: battleY };
  for (const { dx, dy } of SIEGE_RANGE_OFFSETS) {
    const x = deps.wrapX(battleX + dx);
    const y = deps.wrapY(battleY + dy);
    if (boostsBattle(deps.tiles.get(deps.keyFor(x, y)))) return { x, y };
  }
  return undefined;
};

/**
 * Overrides the cosmetic facing computed by siegeBatteryFacingRadiansForTile
 * while a battery is actively aiming at a battle it just triggered a
 * bombardment for (see client-siege-bombardment.ts). Falls back to the
 * normal nearest-rival-tile heuristic once the override has expired or none
 * is recorded for this tile.
 */
export const siegeAimAwareFacingRadiansForTile = (
  tile: Tile | undefined,
  deps: FortificationOverlayDeps,
  aimOverrides: Map<string, { targetX: number; targetY: number; expiresAt: number }>,
  nowMs: number
): number => {
  if (!tile) return 0;
  const override = aimOverrides.get(deps.keyFor(tile.x, tile.y));
  if (override && override.expiresAt > nowMs) {
    return Math.atan2(override.targetX - tile.x, override.targetY - tile.y);
  }
  return siegeBatteryFacingRadiansForTile(tile, deps);
};
