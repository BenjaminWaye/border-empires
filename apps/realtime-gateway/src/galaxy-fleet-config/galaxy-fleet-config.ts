// Fleets (§6/§12 v2a) — pure config: hull class stat table, and the budget
// math a composition reduces to. No network/store code here, same
// separation as galaxy-senate-tick.ts vs galaxy-senate-scheduler.ts.
//
// JUDGMENT CALL — travel time with no real spatial model: the doc's hull
// table (§6) gives each class a *relative* travel speed (1-5, Scout
// fastest), but nothing in the backend today models galactic distances
// between Sectors (Space View's own planet positions are a deterministic
// hash purely for visual layout, not a real coordinate space — see
// client-space-view-state.ts's galaxyLayoutPosition). Rather than invent a
// distance model, this reduces travel time to BASE_TRAVEL_TIME_MS divided
// by the composition's slowest hull's relative speed (a fleet moves at its
// slowest ship's pace, same convoy-speed convention as most 4X/strategy
// games) — same target seasonId, same travel time, regardless of who's
// sending it. This keeps the doc's core promise (a Dreadnought's raid is
// slow enough to telegraph and react to; a Scout's is fast) without
// pretending to model real distances that don't exist in this game.
export type FleetHullClassId = "SCOUT" | "RAIDER" | "BATTLELINE" | "DREADNOUGHT" | "TANKER";

export type FleetHullClassConfig = {
  id: FleetHullClassId;
  // Prod cost per hull (§13's cost/damage table).
  prodCost: number;
  // Damage this hull delivers in a raid, 1:1 with committed Production
  // (§13) — 0 for Scout (reveal-only) and Tanker (range-extension only,
  // and range/fuel logistics are out of scope for this v1 slice, so a
  // Tanker currently just costs Production for no mechanical effect other
  // than being a valid composition member; see the PR description).
  damage: number;
  // Relative travel speed, 1 (slowest) to 5 (fastest) — §6's table.
  relativeSpeed: number;
  // Scout-only: this hull is a pure reveal fleet, no raid damage/Stability
  // effect at all, even in a mixed composition (a raid with a Scout mixed
  // in still deals damage; a Scout-only composition just reveals instead).
  revealsGarrison: boolean;
};

export const FLEET_HULL_CLASSES: Record<FleetHullClassId, FleetHullClassConfig> = {
  SCOUT: { id: "SCOUT", prodCost: 25, damage: 0, relativeSpeed: 5, revealsGarrison: true },
  RAIDER: { id: "RAIDER", prodCost: 80, damage: 50, relativeSpeed: 4, revealsGarrison: false },
  BATTLELINE: { id: "BATTLELINE", prodCost: 200, damage: 200, relativeSpeed: 3, revealsGarrison: false },
  DREADNOUGHT: { id: "DREADNOUGHT", prodCost: 500, damage: 600, relativeSpeed: 1, revealsGarrison: false },
  TANKER: { id: "TANKER", prodCost: 60, damage: 0, relativeSpeed: 2, revealsGarrison: false }
};

export const FLEET_HULL_CLASS_IDS = Object.keys(FLEET_HULL_CLASSES) as FleetHullClassId[];

export type FleetWeaponEmphasis = "KINETIC" | "ENERGY" | "MISSILE";

// Hull id -> count. A composition with every count at 0 (or empty) is
// invalid — enforced where compositions are accepted, not here.
export type FleetComposition = Partial<Record<FleetHullClassId, number>>;

// 2 days at the slowest relative speed (1, Dreadnought) -- see the
// module-level comment for why this is a stand-in for a real distance
// model, not a literal transit time.
export const FLEET_BASE_TRAVEL_TIME_MS = 2 * 24 * 60 * 60 * 1000;

export const isValidFleetComposition = (composition: FleetComposition): boolean =>
  Object.entries(composition).every(([hullId, count]) => FLEET_HULL_CLASS_IDS.includes(hullId as FleetHullClassId) && Number.isInteger(count) && count! >= 0) &&
  Object.values(composition).some((count) => (count ?? 0) > 0);

export const computeFleetProductionCost = (composition: FleetComposition): number =>
  Object.entries(composition).reduce((sum, [hullId, count]) => sum + FLEET_HULL_CLASSES[hullId as FleetHullClassId].prodCost * (count ?? 0), 0);

export const computeFleetDamage = (composition: FleetComposition): number =>
  Object.entries(composition).reduce((sum, [hullId, count]) => sum + FLEET_HULL_CLASSES[hullId as FleetHullClassId].damage * (count ?? 0), 0);

// A fleet is a pure recon mission only if it deals zero damage AND
// includes at least one hull that actually reveals the target's Garrison
// (today, only Scout). An all-Tanker composition also deals zero damage,
// but a Tanker doesn't set revealsGarrison -- it's a true no-op trip
// (costs Production, does nothing), not a free reveal, and this
// deliberately keys off the hull table's own revealsGarrison flag rather
// than "zero damage" so that distinction can't silently drift.
export const isReconOnlyComposition = (composition: FleetComposition): boolean =>
  computeFleetDamage(composition) === 0 &&
  Object.entries(composition).some(([hullId, count]) => (count ?? 0) > 0 && FLEET_HULL_CLASSES[hullId as FleetHullClassId].revealsGarrison);

export const computeFleetTravelTimeMs = (composition: FleetComposition): number => {
  const speeds = Object.entries(composition)
    .filter(([, count]) => (count ?? 0) > 0)
    .map(([hullId]) => FLEET_HULL_CLASSES[hullId as FleetHullClassId].relativeSpeed);
  const slowestSpeed = Math.min(...speeds);
  return Math.round(FLEET_BASE_TRAVEL_TIME_MS / slowestSpeed);
};
