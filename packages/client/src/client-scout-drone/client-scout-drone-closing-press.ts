// A map press that closed an open tile menu (client-map-input.ts closes it on mousedown, before the tap's click
// reaches the map handler). The click then knows it was a closing tap, and must not also start a scout plan
// (player report 2026-11-21: taps meant to close a card started drone routes and added stops).

/** How long after its press a closing tap still counts: a slow tap, well short of a second one. */
const CLOSING_PRESS_WINDOW_MS = 1_500;

let closingPressAt: number | undefined;

/** Call when a press closes an open tile menu. */
export const noteMenuClosingPress = (nowMs: number = Date.now()): void => {
  closingPressAt = nowMs;
};

/** True (once) when the tap now being handled ended a press that closed a menu. */
export const takeMenuClosingPress = (nowMs: number = Date.now()): boolean => {
  const at = closingPressAt;
  closingPressAt = undefined;
  return at !== undefined && nowMs - at <= CLOSING_PRESS_WINDOW_MS;
};
