// §26 MVP constants for the Duke layer. Every number here is first-pass and
// lives in one place so a balance pass can retune it without touching logic.
import { FLEET_HULL_CLASSES, STABILITY_HIT_CAP, computeFleetTravelTimeMs } from "../galaxy-fleet-config/galaxy-fleet-config.js";

const DAY_MS = 24 * 60 * 60 * 1000;
export const CYCLE_DAYS = 7;

// Ships (§26.2). The Fighter is the shipped RAIDER hull; the Probe is the
// shipped SCOUT hull (ids stay RAIDER/SCOUT in code).
// Cheaper than the legacy RAIDER hull (80): a Trade/Capital planet making 2 a day
// needed 40 days for its first Fighter, with Wardens arriving in about 3.
export const FIGHTER_COST = 40;
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
export const MAX_FIGHTERS_PER_SYSTEM = 3;
export const MAX_PROBES_PER_SYSTEM = 3;
export const MAX_FLIGHTS = 6;
export const MAX_ORBITING_PROBES = 3;
export const MAX_INTEL = 100;
export const MAX_DIGEST = 40;

// An empty build slot banks at most one Cycle of Production (§26.2).
export const IDLE_BANK_CYCLES = 1;

// Wardens (§21.10): a finite pool per region, split across every Planet in it.
// They are hardest at the start, when few Planets share the pool: 1 Planet takes
// 3 incursions a Cycle (more than a lone Duke can defend), 2 Planets 1.5 each,
// 4 Planets 0.75 each (about what Stability healing covers).
export const WARDEN_POOL_PER_CYCLE = 3;
// The scripted first incursion gives a new Duke three days; later ones one day.
export const FIRST_CONTACT_WARNING_MS = 3 * DAY_MS;
export const INCURSION_WARNING_MS = DAY_MS;
export const MAX_INCURSION_CREDIT = 2;

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

// System developments (§18, §26): one per orbiting body. The first development
// in each system carries no Influence upkeep; each further one costs 1 per Cycle.
export type DevelopmentKind = "HARVESTER" | "MINING" | "CRYO";
export type DevelopmentSpec = {
  kind: DevelopmentKind;
  body: import("@border-empires/shared").GalaxyBodyKind;
  label: string;
  cost: number;
  // Production added to this system's daily rate, expressed per Cycle.
  productionPerCycle: number;
  // Stability restored to this system each Cycle.
  stabilityPerCycle: number;
  summary: string;
};
export const DEVELOPMENTS: Record<DevelopmentKind, DevelopmentSpec> = {
  HARVESTER: { kind: "HARVESTER", body: "GAS_GIANT", label: "Gas Harvester", cost: 80, productionPerCycle: 8, stabilityPerCycle: 0, summary: "+8 Production per Cycle" },
  MINING: { kind: "MINING", body: "ASTEROID_BELT", label: "Mining Station", cost: 50, productionPerCycle: 5, stabilityPerCycle: 0, summary: "+5 Production per Cycle" },
  CRYO: { kind: "CRYO", body: "ICE_MOON", label: "Cryo Refinery", cost: 70, productionPerCycle: 0, stabilityPerCycle: 6, summary: "+6 Stability per Cycle here" }
};
export const DEVELOPMENT_FOR_BODY: Record<import("@border-empires/shared").GalaxyBodyKind, DevelopmentKind> = {
  GAS_GIANT: "HARVESTER",
  ASTEROID_BELT: "MINING",
  ICE_MOON: "CRYO"
};
export const FREE_DEVELOPMENTS_PER_SYSTEM = 1;
export const DEVELOPMENT_UPKEEP_INFLUENCE = 1;
