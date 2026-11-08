// The daily rhythm (design doc §30): every system has one order and every Duke
// one decree, each usable once and recharging a day after it is used. Nothing
// banks, so the screen can always say "ready" or "next in Xh". Pure logic.
export const ACTION_PERIOD_MS = 24 * 60 * 60 * 1000;

export type ActionGateState = { lastGatedActionAt: number | null };

export type ActionGateResult =
  | { ok: true; state: ActionGateState }
  | { ok: false; code: "ACTION_NOT_READY"; availableAt: number };

export const nextActionAvailableAt = (state: ActionGateState | undefined): number =>
  !state || state.lastGatedActionAt === null ? 0 : state.lastGatedActionAt + ACTION_PERIOD_MS;

export const isActionReady = (state: ActionGateState | undefined, now: number): boolean => now >= nextActionAvailableAt(state);

export const tryTakeAction = (state: ActionGateState | undefined, now: number): ActionGateResult => {
  const availableAt = nextActionAvailableAt(state);
  if (now < availableAt) return { ok: false, code: "ACTION_NOT_READY", availableAt };
  return { ok: true, state: { lastGatedActionAt: now } };
};
