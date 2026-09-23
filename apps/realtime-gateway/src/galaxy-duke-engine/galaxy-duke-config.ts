// §26 MVP constants for the Duke layer. Every number here is first-pass and
// lives in one place so a balance pass can retune it without touching logic.
import { FLEET_HULL_CLASSES, STABILITY_HIT_CAP, computeFleetTravelTimeMs } from "../galaxy-fleet-config/galaxy-fleet-config.js";

const DAY_MS = 24 * 60 * 60 * 1000;
export const CYCLE_DAYS = 7;

// Ships (§26.2). The Fighter is the shipped RAIDER hull; the Probe is the
// shipped SCOUT hull (ids stay RAIDER/SCOUT in code).
export const FIGHTER_COST = FLEET_HULL_CLASSES.RAIDER.prodCost;
export const PROBE_COST = FLEET_HULL_CLASSES.SCOUT.prodCost;
export const FIGHTER_WEAPONS = 3;
export const FIGHTER_ARMOR = 2;
export const HULL_MAX = 100;
export const PROBE_TRAVEL_MS = computeFleetTravelTimeMs({ SCOUT: 1 });
export const FIGHTER_TRAVEL_MS = computeFleetTravelTimeMs({ RAIDER: 1 });

// Combat (§21.7, §23): one simultaneous exchange, damage = W*20 - A*10.
export const DAMAGE_PER_WEAPON = 20;
export const ARMOR_ABSORB = 10;
export const exchangeDamage = (weapons: number, armor: number): number =>
  Math.max(0, weapons * DAMAGE_PER_WEAPON - armor * ARMOR_ABSORB);
export { STABILITY_HIT_CAP };

// Warden relic (§26.2): Weapons 2, Armor 1, Hull 50.
export const WARDEN_WEAPONS = 2;
export const WARDEN_ARMOR = 1;
export const WARDEN_HULL = 50;

// Repairs (§23).
export const FORTIFY_COST_PER_POINT = 2;
export const refitCost = (missingHullPercent: number): number => Math.ceil((FIGHTER_COST / 100) * missingHullPercent);

// Hard bounds on everything that grows (state-and-persistence-discipline.md).
export const MAX_FIGHTERS = 5;
export const MAX_PROBE_STOCK = 3;
export const MAX_ORBITING_PROBES = 3;
export const MAX_INTEL = 100;
export const MAX_DIGEST = 40;

// An empty build slot banks at most one Cycle of Production (§26.2).
export const IDLE_BANK_CYCLES = 1;

// Wardens (§21.10): one incursion per Cycle per region, split among Dukes.
export const INCURSION_WARNING_MS = 3 * DAY_MS;

// Probe derelicts (§17.4, §26.7).
export const DERELICT_CHANCE_PERCENT = 8;
export const DERELICT_INFLUENCE = 15;
export const DERELICT_PRODUCTION = 40;

// Court Strength (§21.2, §23).
export const COURT_STRENGTH_PER_SECTOR = 10;
export const SECTOR_CAPTURE_REDUCTION = 10;
export const MOVE_AGAINST_COURT_DIVISOR = 5;
export const MIN_MOVE_AGAINST_COURT_WAGER = 5;
export const DEFAULT_TOTAL_SECTORS = 30;
