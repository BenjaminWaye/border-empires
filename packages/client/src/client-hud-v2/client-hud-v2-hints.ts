// One-line explanations for HUD v2 labels that playtesters could not decode (2026-11-18). Each one is shown
// as visible text at the top of what the element opens (hover titles don't exist on a phone, where most
// play happens); titles repeat them as a desktop extra. Keep each a short label-style line, true to the
// rules in docs/core-loop.md and docs/game-mechanics.md.

export const MANPOWER_HINT = "Spent to expand, garrison, build and attack · refills every 4h";

export const DEV_SLOTS_HINT = "Garrisons and builds running at once";

export const INTEGRITY_HINT = "Compact garrisoned land earns coin and growth; sprawl costs them";

export const REACH_HINT = "Reach: where you can garrison and build";

export const HOUSE_CHARGES_HINT = "Secret objectives near your landing · hold them at the crowning";

/** Line under each screen's title: what the screen is for. `profile` is your own profile (the crest). */
export const SCREEN_HINTS: Readonly<Record<string, string>> = {
  manifest: "Research · paid in coin",
  towns: "Food, growth and buildings",
  afc: "Paid in coin",
  diplomacy: "Alliances and truces",
  ranks: "Victory race",
  chronicle: "What happened · game updates",
  profile: "Stats · House Charges"
};

/** Line at the top of each side panel a HUD element opens. */
export const PANEL_HINTS: Readonly<Record<string, string>> = {
  manpower: MANPOWER_HINT,
  defensibility: INTEGRITY_HINT,
  charges: HOUSE_CHARGES_HINT
};

/** Desktop hover title per nav bubble: its label plus the screen's line. */
export const navHint = (open: string, label: string): string => {
  const hint = SCREEN_HINTS[open];
  return hint ? `${label}: ${hint}` : label;
};

export const CREST_HINT = "Profile · House Charges";
