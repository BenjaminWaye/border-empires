// The one-tap FOOD fix shared by the HUD and the map's town nameplates (first-15 playtest 2026-11-28: "Short 1
// FOOD" and "City growth paused (town is unfed)" said what was wrong but not what to do; owner: offer "Garrison
// a farm" or "Build a farm plot" right on the warning). The HUD works out the fix from its cached food scan
// (client-hud-v2-food-fix.ts) and publishes its button label here once a second; the nameplates, which have no
// HUD deps, read the label and hand taps back through the runner the HUD installs.

let label: string | undefined;
let runner: (() => void) | undefined;

/** The fix's button label ("Garrison grain"), or undefined when FOOD isn't short or nothing in reach fixes it. */
export const foodFixLabel = (): string | undefined => label;

export const setFoodFixLabel = (next: string | undefined): void => {
  label = next;
};

/** Installed once by the HUD: performs the current fix. */
export const setFoodFixRunner = (next: (() => void) | undefined): void => {
  runner = next;
};

/** A tap on a fix button outside the HUD (a town nameplate); false when no HUD is installed. */
export const requestFoodFix = (): boolean => {
  if (!runner) return false;
  runner();
  return true;
};
