import type { PersonalActivityCombatCard, PersonalActivityCombatGroupCard } from "@border-empires/game-domain";

import type { CombatManpowerLoss } from "../combat-manpower-log/combat-manpower-log.js";
import { combatCardsForPlayer } from "./personal-activity-combat-cards.js";
import { NO_COMBAT_TILE_FEATURES, viewerFeatureCounts, type CombatTileFeatures } from "./personal-activity-features.js";

// Attacks between the player and one rival with no lull longer than this,
// within this many tiles of a fight already in the group, read as one push
// rather than separate fights. Proximity rather than fixed map squares, so
// two neighbouring tiles never land in different groups.
export const COMBAT_GROUP_MAX_GAP_MS = 10 * 60_000;
export const COMBAT_GROUP_MAX_DISTANCE_TILES = 6;

const groupCard = (playerId: string, role: PersonalActivityCombatGroupCard["role"], losses: readonly CombatManpowerLoss[], originSeized: ReadonlySet<CombatManpowerLoss>, tileFeatures: CombatTileFeatures): PersonalActivityCombatGroupCard => {
  const first = losses[0]!;
  const last = losses[losses.length - 1]!;
  const counterpartyPlayerId = role === "ATTACKER" ? first.defenderId : first.attackerId;
  const captured = viewerFeatureCounts(losses.flatMap((loss) => tileFeatures.captured.get(loss) ?? []), role === "ATTACKER");
  const seized = viewerFeatureCounts(losses.flatMap((loss) => tileFeatures.seizedOrigin.get(loss) ?? []), role === "DEFENDER");
  return {
    kind: "COMBAT_GROUP",
    id: `combat-group:${role}:${counterpartyPlayerId ?? "unowned"}:${first.at}:${first.x}:${first.y}`,
    occurredAt: last.at,
    role,
    counterpartyPlayerId,
    attempts: losses.length,
    captures: losses.filter((loss) => loss.attackerWon).length,
    originsSeized: losses.filter((loss) => originSeized.has(loss)).length,
    manpowerLoss: losses.reduce((sum, loss) => sum + loss.manpowerLoss, 0),
    pillagedGold: losses.reduce((sum, loss) => sum + loss.pillagedGold, 0),
    defenderGoldLoss: losses.reduce((sum, loss) => sum + loss.defenderGoldLoss, 0),
    x: last.x,
    y: last.y,
    ...(captured ? { capturedFeatures: captured } : {}),
    ...(seized ? { seizedOriginFeatures: seized } : {})
  };
};

// Folds the player's remaining (non-siege) fights into one card per push:
// same side, same rival, nearby tiles, no long lull. A lone fight stays a
// COMBAT card so its detail (defense, gold) isn't lost.
export const combatCardsWithGroups = (
  playerId: string,
  combat: readonly CombatManpowerLoss[],
  originSeized: ReadonlySet<CombatManpowerLoss>,
  tileFeatures: CombatTileFeatures = NO_COMBAT_TILE_FEATURES
): Array<PersonalActivityCombatCard | PersonalActivityCombatGroupCard> => {
  const cards: Array<PersonalActivityCombatCard | PersonalActivityCombatGroupCard> = [];
  const runs: Array<{ key: string; role: PersonalActivityCombatGroupCard["role"]; losses: CombatManpowerLoss[] }> = [];
  for (const loss of [...combat].sort((a, b) => a.at - b.at)) {
    const role = loss.attackerId === playerId ? "ATTACKER" : loss.defenderId === playerId ? "DEFENDER" : undefined;
    if (!role) continue;
    const key = `${role}:${role === "ATTACKER" ? loss.defenderId ?? "unowned" : loss.attackerId}`;
    const run = runs.find((candidate) =>
      candidate.key === key &&
      loss.at - candidate.losses[candidate.losses.length - 1]!.at <= COMBAT_GROUP_MAX_GAP_MS &&
      candidate.losses.some((other) => Math.max(Math.abs(other.x - loss.x), Math.abs(other.y - loss.y)) <= COMBAT_GROUP_MAX_DISTANCE_TILES));
    if (run) run.losses.push(loss);
    else runs.push({ key, role, losses: [loss] });
  }
  for (const run of runs) {
    if (run.losses.length === 1) cards.push(...combatCardsForPlayer(playerId, run.losses, originSeized, tileFeatures));
    else cards.push(groupCard(playerId, run.role, run.losses, originSeized, tileFeatures));
  }
  return cards;
};
