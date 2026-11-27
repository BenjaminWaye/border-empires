import { WORLD_HEIGHT, WORLD_WIDTH } from "../config.js";

// Siege (owner rule 2026-11-27, tightened the same day to "cut off
// completely"): a town is besieged when its owner holds NONE of its 8 ring
// land plots in any state -- no SETTLED and no FRONTIER tile -- and at least
// one ring plot is held by a House that is not the owner's ally. Its defense
// is then multiplied by TOWN_BESIEGED_DEFENSE_MULT. Allied plots are ignored
// entirely: they neither besiege nor relieve the town. A single owner plot of
// any kind, even ungarrisoned frontier, lifts the siege, so a freshly settled
// town whose ring is still its owner's frontier is not besieged just because
// someone attacks it from one adjacent plot.
//
// A besieged town has none of the owner-garrisoned ring plots that
// town-support-coin.ts pays for, but siege and 0 coin are separate: a town
// can earn 0 coin without being besieged (e.g. its ring is still its owner's
// frontier, or no rival is on it), and its coin also depends on things this
// rule ignores (which town a shared ring plot is assigned to, food).
//
// One shared definition for the sim's combat roll, the gateway's attack
// preview and the client's win-chance paint, so displayed and real odds match.

/** Defense multiplier for a besieged town: -25%, a little milder than breach shock (x0.7). */
export const TOWN_BESIEGED_DEFENSE_MULT = 0.75;

/** Breakdown row label for the siege term; the client reads it back to tag the odds. */
export const TOWN_BESIEGED_LABEL = "Besieged";

export type TownSiegeTileFacts = {
  terrain?: string | undefined;
  ownerId?: string | undefined;
  ownershipState?: string | null | undefined;
};

export type TownSiegeTown = TownSiegeTileFacts & { x: number; y: number };

const wrap = (value: number, size: number): number => ((value % size) + size) % size;

/**
 * True when a garrisoned town's land neighbours (Chebyshev 1, map-wrapped)
 * include no tile its owner holds in any state (settled or frontier) and at
 * least one tile held by a rival: a House `isRival` accepts, i.e. not the
 * owner and not the owner's ally. Allied and unknown neighbours count as
 * neither. The caller checks that the tile actually carries a town, and passes
 * what it knows of the owner's allies (the sim knows them all; a viewer without
 * that knowledge passes only Houses it knows are hostile to the owner, such as
 * itself).
 */
export const isTownBesieged = (
  town: TownSiegeTown,
  getTile: (x: number, y: number) => TownSiegeTileFacts | undefined,
  isRival: (playerId: string) => boolean
): boolean => {
  const ownerId = town.ownerId;
  if (!ownerId || town.ownershipState !== "SETTLED") return false;
  let rivalOnRing = false;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const tile = getTile(wrap(town.x + dx, WORLD_WIDTH), wrap(town.y + dy, WORLD_HEIGHT));
      if (!tile || tile.terrain !== "LAND") continue;
      // Any owner plot, settled or frontier, means the town is not cut off.
      if (tile.ownerId === ownerId) return false;
      if (tile.ownerId && isRival(tile.ownerId)) rivalOnRing = true;
    }
  }
  return rivalOnRing;
};

/** Whether a combat breakdown side carries the siege term (gateway preview -> client tags). */
export const combatSideIsBesieged = (side: { battle: readonly { label: string }[] } | undefined): boolean =>
  Boolean(side?.battle.some((entry) => entry.label === TOWN_BESIEGED_LABEL));
