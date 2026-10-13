// Empire Integrity tuning, split out of config.ts (500-line cap). Re-exported
// from the package index like config.ts, so callers import these from
// "@border-empires/shared" as before.
declare const process: {
  env: {
    EMPIRE_INTEGRITY_ENABLED?: string;
  };
};

export const EMPIRE_INTEGRITY_ENABLED = process.env["EMPIRE_INTEGRITY_ENABLED"] === "true";
export const INTEGRITY_ECON_MIN_MULT = 0.85;
export const INTEGRITY_ECON_MAX_MULT = 1.15;
export const INTEGRITY_GROWTH_MIN_MULT = 0.9;
export const INTEGRITY_GROWTH_MAX_MULT = 1.1;
// New-empire grace: integrity can't drop below INTEGRITY_GRACE_FLOOR until the
// player has settled INTEGRITY_GRACE_TILES tiles. Past that the floor fades
// linearly to zero over INTEGRITY_GRACE_FADE_TILES more tiles (no cliff).
// Integrity only costs coin/growth below 50% (integrityEconomyMult crosses
// 1.0x there), so with these values the floor keeps every empire, however
// ragged, at no penalty until ~240 settled tiles (150 + 0.44 * 200). Was
// 50/50 -- the floor started sliding before a new player had finished their
// opening, and playtesters read the falling number as being punished for
// expanding.
export const INTEGRITY_GRACE_TILES = 150;
export const INTEGRITY_GRACE_FLOOR = 0.9;
export const INTEGRITY_GRACE_FADE_TILES = 200;
/** Integrity (0-100%) below which the economy/growth multipliers turn into a penalty. */
export const INTEGRITY_PENALTY_PCT = 50;
