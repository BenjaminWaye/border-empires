import type { DomainTileState } from "@border-empires/game-domain";
import type { ScoutDroneTileClass, ScoutDroneWorld } from "@border-empires/shared";

// The two maps a scout drone is planned and flown on (docs/explore-scout-plan.md §13).
//
// `truth` is the live map: the drone meets a rival border only when it actually reaches it.
// `known` is what the player knows: rival land counts as a wall only on tiles the player has
// explored (explored-tiles-store.ts); land still in unexplored fog is open ground. Routes are
// planned on `known`, so the plan sent at launch carries nothing about borders the player has
// never seen: stops past a hidden border are kept, and the drone turns back when it gets there.
// Planning on `truth` sent the cut-short route, the rival's id and the border tile the moment
// the player pressed Go (player report 2026-11-24).

const wrap = (v: number, size: number): number => ((v % size) + size) % size;
const keyOf = (x: number, y: number): string => `${x},${y}`;
export const isPlanetaryDefenseId = (playerId: string): boolean => playerId.startsWith("barbarian-");

export type ScoutDroneWorldDeps = {
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly tiles: () => ReadonlyMap<string, DomainTileState>;
  readonly reachOwnerAt: (x: number, y: number) => string | undefined;
  readonly isOwnOrAllied: (actorId: string, ownerId: string) => boolean;
  /** Whether the tile has ever been in the player's vision this season (explored-tiles-store.ts). */
  readonly isExplored: (playerId: string, x: number, y: number) => boolean;
};

export type ScoutDroneWorlds = {
  readonly truth: (actorId: string) => ScoutDroneWorld;
  readonly known: (actorId: string) => ScoutDroneWorld;
};

export const createScoutDroneWorlds = (deps: ScoutDroneWorldDeps): ScoutDroneWorlds => {
  // Read live each time, so a border that appears, an alliance that ends or reach that grows mid-flight counts.
  const classify = (actorId: string, x: number, y: number, knownOnly: boolean): { kind: ScoutDroneTileClass; ownerId?: string } => {
    const wx = wrap(x, deps.worldWidth);
    const wy = wrap(y, deps.worldHeight);
    const ownerId = deps.tiles().get(keyOf(wx, wy))?.ownerId;
    // Planetary Defense land stays open even inside reach: the drone still scouts it.
    if (ownerId && isPlanetaryDefenseId(ownerId)) return { kind: "OPEN" };
    if (ownerId && deps.isOwnOrAllied(actorId, ownerId)) return { kind: "HOME" };
    if (ownerId) return knownOnly && !deps.isExplored(actorId, wx, wy) ? { kind: "OPEN" } : { kind: "BLOCKED", ownerId };
    // Unclaimed ground inside the player's (or an ally's) reach is already in sight: fly it at home pace.
    const reachOwnerId = deps.reachOwnerAt(wx, wy);
    return reachOwnerId && deps.isOwnOrAllied(actorId, reachOwnerId) ? { kind: "HOME" } : { kind: "OPEN" };
  };
  const world = (actorId: string, knownOnly: boolean): ScoutDroneWorld => ({
    width: deps.worldWidth,
    height: deps.worldHeight,
    classify: (x, y) => classify(actorId, x, y, knownOnly)
  });
  return { truth: (actorId) => world(actorId, false), known: (actorId) => world(actorId, true) };
};
