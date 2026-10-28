import type { DomainTileState } from "@border-empires/game-domain";
import { chebyshevDistanceToroidal, coordsInChebyshevRadius } from "../territory-automation/territory-automation.js";
import { isAlliedOrTruced } from "../runtime-player-factory.js";

/**
 * How much longer than the straightest flag -> target route a MARCH may walk
 * or fight. Both the owned-territory walk and the candidates it fires on are
 * held inside this corridor, so a march stays a spear pointed at its target.
 * Without it, a flag whose front was busy (or out of search range) took any
 * tile a single step closer to the target than the flag itself, and a long
 * march spread sideways over everything between the flag and the target
 * instead of heading for it.
 */
export const MARCH_ROUTE_CORRIDOR_SLACK = 3;

/**
 * How many of our own tiles must touch a hostile town/structure target before
 * a march stops widening its foothold and throws everything at the target
 * itself. More than one so losing a single border tile doesn't strand the
 * attack; the flag still attacks with fewer once no other neighbouring tile
 * can be taken.
 */
export const MARCH_SIEGE_ATTACK_VECTORS = 2;

/**
 * True when a march target is an enemy town or structure: something the
 * player picked to take, not just ground to cross. Those marches set up
 * attack vectors next to the target and then focus on capturing it.
 */
export const isMarchSiegeTarget = (
  target: DomainTileState | undefined,
  playerId: string,
  actor: Parameters<typeof isAlliedOrTruced>[0] | undefined
): target is DomainTileState => {
  if (!target || target.terrain !== "LAND" || !target.ownerId || target.ownerId === playerId) return false;
  if (actor && isAlliedOrTruced(actor, target.ownerId)) return false;
  return Boolean(target.town || target.fort || target.observatory || target.siegeBattery || target.afc || target.economicStructure);
};

/** Tiles we own next to the target: each is a front an attack on it can launch from. */
export const countSiegeAttackVectors = (
  target: DomainTileState,
  playerId: string,
  getTile: (x: number, y: number) => DomainTileState | undefined
): number => {
  let vectors = 0;
  for (const { x, y } of coordsInChebyshevRadius(target.x, target.y, 1)) {
    const tile = getTile(x, y);
    if (tile?.terrain === "LAND" && tile.ownerId === playerId) vectors += 1;
  }
  return vectors;
};

/** True for the eight tiles around the target (not the target itself). */
export const touchesSiegeTarget = (tile: Pick<DomainTileState, "x" | "y">, target: Pick<DomainTileState, "x" | "y">): boolean =>
  chebyshevDistanceToroidal(tile.x, tile.y, target.x, target.y) === 1;
