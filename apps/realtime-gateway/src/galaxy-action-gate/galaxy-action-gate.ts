// §26.5: the one weekly limit left on a Duke is a single Petition (Move Against
// the Court) per Cycle. Builds and orders are limited by each system's own slot
// and ships instead. Pure logic.
export const ACTION_CYCLE_MS = 7 * 24 * 60 * 60 * 1000;

export type ActionGateState = { lastGatedActionAt: number | null };

export type ActionGateResult =
  | { ok: true; state: ActionGateState }
  | { ok: false; code: "ACTION_ALREADY_TAKEN_THIS_CYCLE"; availableAt: number };

export const nextActionAvailableAt = (state: ActionGateState): number =>
  state.lastGatedActionAt === null ? 0 : state.lastGatedActionAt + ACTION_CYCLE_MS;

export const tryTakeAction = (state: ActionGateState, now: number): ActionGateResult => {
  const availableAt = nextActionAvailableAt(state);
  if (now < availableAt) return { ok: false, code: "ACTION_ALREADY_TAKEN_THIS_CYCLE", availableAt };
  return { ok: true, state: { lastGatedActionAt: now } };
};
