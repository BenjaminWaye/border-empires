// A Duke's Planets as systems (§26): creation, per-system Production rate, the
// development upkeep rule, and keeping the list in step with what is held.
import { galaxySystemBodies, type GalaxyBodyKind } from "@border-empires/shared";
import type { GalaxySpecialization } from "@border-empires/sim-protocol";

import { initialCourtOffer, presentCourtOffer } from "../galaxy-court-offer/galaxy-court-offer.js";
import { dailyProductionRate } from "../galaxy-production-queue/galaxy-production-queue.js";
import {
  CYCLE_DAYS,
  DEVELOPMENTS,
  DEVELOPMENT_UPKEEP_INFLUENCE,
  FIRST_CONTACT_WARNING_MS,
  FREE_DEVELOPMENTS_PER_SYSTEM
} from "./galaxy-duke-config.js";
import { pushDigest } from "./galaxy-duke-digest.js";
import type { DukeState, SystemState } from "./galaxy-duke-types.js";

export type HeldSector = { seasonId: string; tier: "PLANET" | "OUTPOST"; specialization: GalaxySpecialization };

export const planetsOf = (holdings: ReadonlyArray<HeldSector>): HeldSector[] => holdings.filter((h) => h.tier === "PLANET");

// Production per day for one system: its Planet's own rate plus its Harvesters
// and Mining Stations (§26.8). Outposts have no slot and yield nothing here.
export const systemDailyRate = (system: SystemState): number =>
  dailyProductionRate(system.specialization, "PLANET") +
  system.developments.reduce((sum, d) => sum + DEVELOPMENTS[d.kind].productionPerCycle / CYCLE_DAYS, 0);

export const systemBodyKinds = (seasonId: string): GalaxyBodyKind[] => galaxySystemBodies(seasonId);

export const newSystemState = (planet: HeldSector, now: number, arrivesAt: number | null = null): SystemState => ({
  seasonId: planet.seasonId,
  specialization: planet.specialization,
  slot: null,
  idleBank: 0,
  fighters: [],
  probeStock: 0,
  developments: [],
  incursion: { credit: 0, arrivesAt, count: 0, lastCreditAt: now }
});

// First contact (§21.10): a new Duke's first system is announced an incursion
// three days out, and the Court makes its one-time offer.
export const createDukeState = (authUid: string, planets: ReadonlyArray<HeldSector>, now: number, cycleIndex = 0): DukeState => {
  const [first, ...rest] = planets;
  const base: DukeState = {
    authUid,
    createdAt: now,
    lastAdvancedAt: now,
    systems: [
      ...(first ? [newSystemState(first, now, now + FIRST_CONTACT_WARNING_MS)] : []),
      ...rest.map((p) => newSystemState(p, now))
    ],
    orbiting: [],
    intel: [],
    flights: [],
    petitionGate: { lastGatedActionAt: null },
    courtOffer: presentCourtOffer(initialCourtOffer),
    lastCycleApplied: cycleIndex,
    digest: []
  };
  return pushDigest(
    base,
    now,
    "COMBAT",
    "Unidentified craft detected on approach. Arrival in 3 days. Build a Fighter to defend, or your Sector will take a hit."
  ).state;
};

// Keeps the system list equal to the Planets actually held: a Planet won since
// the last tick gets a fresh system; a Planet lost (e.g. in a Defense Campaign)
// drops its system and everything stationed there.
export const syncSystems = (state: DukeState, planets: ReadonlyArray<HeldSector>, now: number): DukeState => {
  const held = new Map(planets.map((p) => [p.seasonId, p]));
  const kept = state.systems.filter((s) => held.has(s.seasonId));
  const known = new Set(kept.map((s) => s.seasonId));
  const added = planets.filter((p) => !known.has(p.seasonId)).map((p) => newSystemState(p, now));
  if (kept.length === state.systems.length && added.length === 0) return state;
  return { ...state, systems: [...kept, ...added] };
};

export const findSystem = (state: DukeState, seasonId: string): SystemState | undefined => state.systems.find((s) => s.seasonId === seasonId);

export const replaceSystem = (state: DukeState, system: SystemState): DukeState => ({
  ...state,
  systems: state.systems.map((s) => (s.seasonId === system.seasonId ? system : s))
});

// Each system's first development is free; every further one costs 1 Influence
// per Cycle (§26.8). Influence is the currency that also funds Petitions, so
// growing a system competes with wagering against the Court.
export const developmentUpkeepPerCycle = (state: DukeState): number =>
  state.systems.reduce((sum, s) => sum + Math.max(0, s.developments.length - FREE_DEVELOPMENTS_PER_SYSTEM) * DEVELOPMENT_UPKEEP_INFLUENCE, 0);

