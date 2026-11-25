import type { DomainTileState } from "@border-empires/game-domain";
import type { ScoutDroneTileClass, ScoutDroneWorld } from "@border-empires/shared";

// The two maps a scout drone is planned and flown on (docs/explore-scout-plan.md §13).
//
// `truth` is the live map: the drone meets a rival border only when it actually reaches it.
// `known` is what the player knows now: rival land is a wall only where they can see it, or where
// this flight's drone has already met it (`seen`, filled by noteBordersAround). Anything else is
// open ground: land in unexplored fog, and remembered fog too, whose owner may have changed out of
// sight (the client keeps the last-seen owner; the server keeps only that a tile was explored, so
// reading the current owner there would leak a claim the player never saw). Routes are planned on
// `known`, so the plan sent at launch carries nothing about borders the player cannot see: stops
// past a hidden border are kept, and the drone turns back when it gets there. Planning on `truth`
// sent the cut-short route, the rival's id and the border tile the moment the player pressed Go
// (player report 2026-11-24).

const wrap = (v: number, size: number): number => ((v % size) + size) % size;
const keyOf = (x: number, y: number): string => `${x},${y}`;
export const isPlanetaryDefenseId = (playerId: string): boolean => playerId.startsWith("barbarian-");

export type ScoutDroneWorldDeps = {
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly tiles: () => ReadonlyMap<string, DomainTileState>;
  readonly reachOwnerAt: (x: number, y: number) => string | undefined;
  readonly isOwnOrAllied: (actorId: string, ownerId: string) => boolean;
  /** Whether the player can see the tile now (VisibilityCoverageTracker.isVisible), drone included. */
  readonly isVisible: (playerId: string, x: number, y: number) => boolean;
};

export type ScoutDroneWorlds = {
  readonly truth: (actorId: string) => ScoutDroneWorld;
  /** `seen`: rival tiles ("x,y") this flight's drone has met, so a reroute never forgets them once out of sight. */
  readonly known: (actorId: string, seen?: ReadonlySet<string>) => ScoutDroneWorld;
  /** Adds the rival tiles the player can see within `radius` of (x, y) to `into`. */
  readonly noteBordersAround: (actorId: string, x: number, y: number, radius: number, into: Set<string>) => void;
};

export const createScoutDroneWorlds = (deps: ScoutDroneWorldDeps): ScoutDroneWorlds => {
  // Read live each time, so a border that appears, an alliance that ends or reach that grows mid-flight counts.
  const classify = (actorId: string, x: number, y: number, seen: ReadonlySet<string> | "all"): { kind: ScoutDroneTileClass; ownerId?: string } => {
    const wx = wrap(x, deps.worldWidth);
    const wy = wrap(y, deps.worldHeight);
    const ownerId = deps.tiles().get(keyOf(wx, wy))?.ownerId;
    // Planetary Defense land stays open even inside reach: the drone still scouts it.
    if (ownerId && isPlanetaryDefenseId(ownerId)) return { kind: "OPEN" };
    if (ownerId && deps.isOwnOrAllied(actorId, ownerId)) return { kind: "HOME" };
    if (ownerId) return seen === "all" || seen.has(keyOf(wx, wy)) || deps.isVisible(actorId, wx, wy) ? { kind: "BLOCKED", ownerId } : { kind: "OPEN" };
    // Unclaimed ground inside the player's (or an ally's) reach is already in sight: fly it at home pace.
    const reachOwnerId = deps.reachOwnerAt(wx, wy);
    return reachOwnerId && deps.isOwnOrAllied(actorId, reachOwnerId) ? { kind: "HOME" } : { kind: "OPEN" };
  };
  const world = (actorId: string, seen: ReadonlySet<string> | "all"): ScoutDroneWorld => ({
    width: deps.worldWidth,
    height: deps.worldHeight,
    classify: (x, y) => classify(actorId, x, y, seen)
  });
  const none: ReadonlySet<string> = new Set();
  return {
    truth: (actorId) => world(actorId, "all"),
    known: (actorId, seen = none) => world(actorId, seen),
    noteBordersAround: (actorId, x, y, radius, into) => {
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const wx = wrap(x + dx, deps.worldWidth);
          const wy = wrap(y + dy, deps.worldHeight);
          if (classify(actorId, wx, wy, "all").kind === "BLOCKED" && deps.isVisible(actorId, wx, wy)) into.add(keyOf(wx, wy));
        }
      }
    }
  };
};
