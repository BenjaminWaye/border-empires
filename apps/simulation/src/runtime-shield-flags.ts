import type { DomainTileState } from "@border-empires/game-domain";
import { SHIELD_RADIUS_TILES } from "@border-empires/shared";
import { chebyshevDistanceToroidal } from "./territory-automation/territory-automation.js";

export type ShieldMatch = { tileKey: string; amount: number };

/**
 * Finds the muster flag that shields a defending tile from an attacker's
 * commitment, per docs/muster-fronts-proposal.md §4: a HOLD-mode flag shields
 * every tile within SHIELD_RADIUS_TILES of itself; any flag (any mode)
 * shields its own tile regardless of mode, so an attacking (ADVANCE/MARCH)
 * flag isn't a free target just because it isn't in HOLD. When more than one
 * of the defender's flags could shield the same tile, only the largest (by
 * staged amount) counts -- shields don't stack.
 */
export const findShieldForDefender = (
  musterTilesByOwner: ReadonlyMap<string, ReadonlySet<string>>,
  tiles: ReadonlyMap<string, DomainTileState>,
  defenderOwnerId: string,
  targetKey: string,
  targetX: number,
  targetY: number
): ShieldMatch | undefined => {
  const ownerFlags = musterTilesByOwner.get(defenderOwnerId);
  if (!ownerFlags || ownerFlags.size === 0) return undefined;
  let best: ShieldMatch | undefined;
  for (const flagKey of ownerFlags) {
    const flagTile = tiles.get(flagKey);
    if (!flagTile?.muster || flagTile.muster.ownerId !== defenderOwnerId) continue;
    const amount = flagTile.muster.amount;
    if (amount <= 0) continue;
    const isSelfShield = flagKey === targetKey;
    const isAreaShield =
      flagTile.muster.mode === "HOLD" &&
      chebyshevDistanceToroidal(flagTile.x, flagTile.y, targetX, targetY) <= SHIELD_RADIUS_TILES;
    if (!isSelfShield && !isAreaShield) continue;
    if (!best || amount > best.amount) best = { tileKey: flagKey, amount };
  }
  return best;
};

/**
 * The shield spends up to what it holds, never more than the attacker
 * committed -- "matching is enough" (§4). The actual deduction from the
 * shield tile's staged amount happens at resolve time via the existing
 * consumeOriginMuster (runtime-combat-resolution.ts) -- it's a generic
 * "spend mustered manpower from a tile you own" helper, equally correct for
 * the defender's shield tile as for the attacker's own origin.
 */
export const shieldMatchAmount = (shieldAvailable: number, attackerCommit: number): number =>
  Math.max(0, Math.min(shieldAvailable, attackerCommit));
