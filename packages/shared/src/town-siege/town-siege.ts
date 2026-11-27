import { WORLD_HEIGHT, WORLD_WIDTH } from "../config.js";

// Siege (owner rule 2026-11-27): a town cut off from its own garrisons
// defends worse. A town's coin comes from its inner support ring
// (town-support-coin.ts): with none of those 8 plots garrisoned by its owner
// it earns nothing. When that happens because a House that is not the owner's
// ally has moved onto the ring, the town is besieged and its defense is
// multiplied by TOWN_BESIEGED_DEFENSE_MULT. A ring the owner simply hasn't
// garrisoned yet, with no rival on it, is not a siege; allied plots neither
// besiege nor supply the town (owner rule 2026-11-27).
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
 * include no tile its owner has garrisoned and at least one tile held by a
 * rival: a House `isRival` accepts, i.e. not the owner and not the owner's
 * ally. Allied and unknown neighbours count as neither. The caller checks that
 * the tile actually carries a town, and passes what it knows of the owner's
 * allies (the sim knows them all; a viewer without that knowledge passes only
 * Houses it knows are hostile to the owner, such as itself).
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
      if (tile.ownerId === ownerId) {
        if (tile.ownershipState === "SETTLED") return false;
        continue;
      }
      if (tile.ownerId && isRival(tile.ownerId)) rivalOnRing = true;
    }
  }
  return rivalOnRing;
};

/** Whether a combat breakdown side carries the siege term (gateway preview -> client tags). */
export const combatSideIsBesieged = (side: { battle: readonly { label: string }[] } | undefined): boolean =>
  Boolean(side?.battle.some((entry) => entry.label === TOWN_BESIEGED_LABEL));
