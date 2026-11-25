// Bumps the per-player achievement counters (DomainPlayer.achievements) at the
// moments they happen. Shared achievements.ts decides what the counts earn.
import type { PlayerAchievementState } from "@border-empires/game-domain";

type CountedPlayer = { achievements?: PlayerAchievementState };
type CounterKey = "campsCleared" | "tilesTakenInBattle" | "structuresBuilt";

const bump = (player: CountedPlayer, key: CounterKey): void => {
  const state = player.achievements ?? {};
  state[key] = (state[key] ?? 0) + 1;
  player.achievements = state;
};

const isPlanetaryDefenseId = (ownerId: string): boolean => ownerId.startsWith("barbarian-");

/**
 * A won ATTACK counts toward Pacifier when it takes a garrisoned Planetary
 * Defense camp tile (the same rule that pays the camp bounty), and toward
 * Warlord when it takes another House's tile.
 */
export const countWonAttack = (
  attacker: CountedPlayer | undefined,
  input: { attackerId: string; attackerWon: boolean; actionType: string; previousOwnerId: string | undefined; previousOwnershipState: string | undefined }
): void => {
  if (!attacker || !input.attackerWon || input.actionType !== "ATTACK" || !input.previousOwnerId || input.previousOwnerId === input.attackerId) return;
  if (isPlanetaryDefenseId(input.previousOwnerId)) {
    if (input.previousOwnershipState === "SETTLED") bump(attacker, "campsCleared");
    return;
  }
  bump(attacker, "tilesTakenInBattle");
};

/** A structure finished building (runtime-structure-build-completion.ts). */
export const countStructureBuilt = (owner: CountedPlayer | undefined): void => {
  if (owner) bump(owner, "structuresBuilt");
};
