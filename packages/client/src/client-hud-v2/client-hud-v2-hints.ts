// One-line explanations for HUD v2 labels that playtesters could not decode (2026-11-18): shown as
// hover titles / aria labels, never as paragraphs on the HUD itself. Keep each to one short line and
// true to the rules in docs/core-loop.md and docs/game-mechanics.md.

export const MANPOWER_HINT = "Manpower: spent to expand, garrison, build and attack. Refills every 4h.";

export const DEV_SLOTS_HINT = "Dev slots: garrisons and builds that can run at once.";

export const INTEGRITY_HINT = "Empire Integrity: how compact your garrisoned land is. Compact earns coin and growth; sprawl costs them.";

export const REACH_HINT = "Reach: where you can garrison and build. Towns, docks and Relay Beacons extend it.";

export const HOUSE_CHARGES_HINT = "Secret objectives near your landing. Hold them when the winner is crowned.";

/** Hover line per nav bubble: what the screen is for. */
export const NAV_HINTS: Readonly<Record<string, string>> = {
  manifest: "Manifest: research, paid in coin",
  towns: "Towns: food, growth and buildings",
  afc: "AFC: campaign upgrades, paid in coin",
  diplomacy: "Diplomacy: alliances and truces",
  ranks: "Ranks: standings and victory race",
  chronicle: "Chronicle: what happened and game updates"
};

export const CREST_HINT = "Profile · House Charges";
