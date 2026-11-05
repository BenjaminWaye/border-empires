import type { ClientState } from "../client-state/client-state.js";
import { isFriendlyOwner } from "../client-hostile-muster-alerts/client-hostile-muster-alerts.js";
import { musterWarOpponents } from "../client-war-music-signal/client-war-music-hostility.js";

// Who we are at war with, for the Alliances tab's "War" / "Met" label. It is
// the per-player version of the war-music signals (client-war-music-signal.ts):
// a player is at war with us while a battle between us is live, a muster flag
// of ours is engaged against their land, either side's flag has the other's
// land in reach, or their flag is staged at our border. Allies and truce
// partners never count.

export type WarStatusState = Pick<ClientState, "me" | "tiles" | "activeBattles"> &
  Partial<Pick<ClientState, "allies" | "activeTruces" | "playerNames">>;

// A conflict keeps showing as war this long after its last live signal, so a
// skirmish that resolves in seconds doesn't flip the label back and forth.
// Same hold as the combat music.
export const WAR_STATUS_HOLD_MS = 2 * 60 * 1000;

// Latest time each opponent's war label holds until, per client state. A
// WeakMap keeps it off ClientState; it holds at most one entry per other
// player and entries are pruned as they expire.
const holdUntilByState = new WeakMap<object, Map<string, number>>();

const liveOpponents = (state: WarStatusState, nowMs: number): Set<string> => {
  const opponents = new Set<string>();
  if (!state.me) return opponents;
  for (const tile of state.tiles.values()) {
    if (!tile.muster) continue;
    for (const id of musterWarOpponents(state, tile, tile.muster, nowMs)) opponents.add(id);
  }
  for (const battle of state.activeBattles.values()) {
    const other = battle.attackerOwnerId === state.me ? battle.defenderOwnerId : battle.defenderOwnerId === state.me ? battle.attackerOwnerId : undefined;
    if (other && !isFriendlyOwner(state, other, nowMs)) opponents.add(other);
  }
  return opponents;
};

/** The ids of the players currently at war with us (a live conflict, or one that ended under WAR_STATUS_HOLD_MS ago). */
export const warOpponentIds = (state: WarStatusState, nowMs: number): ReadonlySet<string> => {
  let holds = holdUntilByState.get(state);
  if (!holds) {
    holds = new Map();
    holdUntilByState.set(state, holds);
  }
  for (const id of liveOpponents(state, nowMs)) holds.set(id, nowMs + WAR_STATUS_HOLD_MS);
  const atWar = new Set<string>();
  for (const [id, until] of holds) {
    if (until <= nowMs) holds.delete(id);
    else if (!isFriendlyOwner(state, id, nowMs)) atWar.add(id);
  }
  return atWar;
};
