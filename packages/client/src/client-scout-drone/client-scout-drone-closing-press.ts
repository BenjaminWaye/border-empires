// Whether the map press now being committed closed an open tile menu. The map closes the menu when a press
// starts (mousedown, client-map-input.ts), before the tap reaches the map handler, so the handler can't see it
// was open. A closing tap must not also start a scout plan (player report 2026-11-21: taps meant to close a card
// started drone routes and added stops). Every press overwrites this, so a press that never became a tap (a
// pan, a release off the map) can't leave it set for a later tap (review 2026-11-21).

let pressClosedMenu = false;

/** Call when a primary press starts: true when it found a tile menu open (and so closes it). */
export const noteMapPress = (closesMenu: boolean): void => {
  pressClosedMenu = closesMenu;
};

/** True (once) when the tap being handled began with a press that closed a menu. */
export const takeMenuClosingPress = (): boolean => {
  const closed = pressClosedMenu;
  pressClosedMenu = false;
  return closed;
};
