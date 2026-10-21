import { PERSONAL_ACTIVITY_RIVAL_CAP, type PersonalActivityRival } from "@border-empires/game-domain";

import { BARBARIAN_PLAYER_ID } from "../ai/system-job-barbarian-planner.js";
import type { CombatManpowerLoss } from "../combat-manpower-log/combat-manpower-log.js";
import type { TerritoryFlip } from "../territory-flip-log/territory-flip-log.js";

const activity = (rival: PersonalActivityRival): number => rival.tilesTaken + rival.tilesLost + rival.attacksRepelled + rival.attacksFailed;

// Head-to-head tallies against each opponent, from the same windowed logs as
// the timeline. Barbarians are background hazard, not a rival, so they are
// left out; neutral land has no counterparty to tally.
export const rivalsForPlayer = (playerId: string, flips: readonly TerritoryFlip[], combat: readonly CombatManpowerLoss[]): PersonalActivityRival[] => {
  const rivals = new Map<string, PersonalActivityRival>();
  const rival = (id: string | undefined): PersonalActivityRival | undefined => {
    if (!id || id === playerId || id === BARBARIAN_PLAYER_ID) return undefined;
    let entry = rivals.get(id);
    if (!entry) {
      entry = { playerId: id, tilesTaken: 0, tilesLost: 0, attacksRepelled: 0, attacksFailed: 0 };
      rivals.set(id, entry);
    }
    return entry;
  };
  for (const flip of flips) {
    if (flip.toOwner === playerId && flip.fromOwner !== playerId) {
      const entry = rival(flip.fromOwner);
      if (entry) entry.tilesTaken += 1;
    } else if (flip.fromOwner === playerId && flip.toOwner !== playerId) {
      const entry = rival(flip.toOwner);
      if (entry) entry.tilesLost += 1;
    }
  }
  for (const loss of combat) {
    if (loss.attackerWon) continue;
    if (loss.defenderId === playerId) {
      const entry = rival(loss.attackerId);
      if (entry) entry.attacksRepelled += 1;
    } else if (loss.attackerId === playerId) {
      const entry = rival(loss.defenderId);
      if (entry) entry.attacksFailed += 1;
    }
  }
  return [...rivals.values()]
    .sort((a, b) => activity(b) - activity(a) || a.playerId.localeCompare(b.playerId))
    .slice(0, PERSONAL_ACTIVITY_RIVAL_CAP);
};
