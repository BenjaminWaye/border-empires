import { isMeetablePlayerId } from "../client-alliance/client-met-players.js";
import { warOpponentIds, type WarStatusState } from "../client-alliance/client-war-status.js";
import { isFriendlyOwner } from "../client-hostile-muster-alerts/client-hostile-muster-alerts.js";

// The attack confirm's "Starts war with House X" line (playtest run 5: attacking a House with no pact
// started a war without a word). War is implicit (game-mechanics.md, War declarations): attacking any
// House you have no truce or alliance with is war, and the Diplomacy list reads WAR while the fighting
// is live (client-war-status.ts). The line names only Houses not already at war with you; barbarians
// and Planetary Defense are not Houses, and allies and truce partners can't be attacked from here.

/** "Starts war with House Ashhaven", "Starts war with A and B", or "" when no attack here starts one. */
export const attackWarWarning = (state: WarStatusState, targetOwnerIds: ReadonlyArray<string | undefined>, nowMs: number): string => {
  const atWar = warOpponentIds(state, nowMs);
  const starts = [...new Set(targetOwnerIds)].filter(
    (id): id is string => isMeetablePlayerId(id, state.me) && !isFriendlyOwner(state, id, nowMs) && !atWar.has(id)
  );
  if (starts.length === 0) return "";
  const names = starts.map((id) => state.playerNames?.get(id) || "a House");
  const listed = names.length <= 2 ? names.join(" and ") : `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
  return `Starts war with ${listed}`;
};
