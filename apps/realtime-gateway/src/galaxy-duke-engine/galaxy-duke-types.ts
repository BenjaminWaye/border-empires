import type { GalaxySpecialization } from "@border-empires/sim-protocol";

import type { ActionGateState } from "../galaxy-action-gate/galaxy-action-gate.js";
import type { CourtOfferState } from "../galaxy-court-offer/galaxy-court-offer.js";
import type { DevelopmentKind } from "./galaxy-duke-config.js";

// What a system's one build slot can be working on (§26).
export type DukeBuildKind = "FIGHTER" | "PROBE" | "FORTIFY" | "REFIT" | "DEVELOP";

export type DukeBuild = {
  kind: DukeBuildKind;
  label: string;
  cost: number;
  progress: number;
  // FORTIFY: Stability points restored.
  points?: number;
  // DEVELOP: which orbiting body, and what is being built on it.
  bodyIndex?: number;
  development?: DevelopmentKind;
};

export type DukeFighter = { hull: number };

export type SystemDevelopment = { bodyIndex: number; kind: DevelopmentKind };

// Wardens hit one Planet at a time, so each system keeps its own credit.
export type SystemIncursion = {
  // Accrues with time at (pool / Planets in the galaxy) per Cycle; an incursion
  // is announced at 1.
  credit: number;
  arrivesAt: number | null;
  count: number;
  lastCreditAt: number;
};

// One Planet's local state (§26): its own build slot, ships and developments.
export type SystemState = {
  seasonId: string;
  specialization: GalaxySpecialization;
  slot: DukeBuild | null;
  idleBank: number;
  fighters: DukeFighter[];
  probeStock: number;
  developments: SystemDevelopment[];
  incursion: SystemIncursion;
};

export type OrbitingProbe = { seasonId: string; arrivedAt: number };

// Timestamped intel on a Surveyed system (§17.2). `live` is true while a
// Probe orbits it; otherwise it is a dated snapshot.
export type DukeIntel = {
  seasonId: string;
  label: string;
  stability: number;
  // Hull % of the healthiest Defending Fighter, or null when undefended.
  defenderHull: number | null;
  at: number;
  live: boolean;
};

export type InFlightOrder =
  | { kind: "PROBE"; fromSeasonId: string; seasonId: string; launchedAt: number; arrivesAt: number }
  | { kind: "RAID"; fromSeasonId: string; seasonId: string; launchedAt: number; arrivesAt: number; fighterHull: number };

export type DigestKind = "COMBAT" | "ECONOMY" | "INTEL" | "POLITICS" | "COURT";
export type DigestEntry = { at: number; kind: DigestKind; text: string };

export type DukeState = {
  authUid: string;
  createdAt: number;
  lastAdvancedAt: number;
  systems: SystemState[];
  orbiting: OrbitingProbe[];
  intel: DukeIntel[];
  flights: InFlightOrder[];
  // One Petition per Duke per Cycle (the only weekly gate left).
  petitionGate: ActionGateState;
  courtOffer: CourtOfferState;
  // Last global Cycle whose upkeep and Cryo healing have been applied.
  lastCycleApplied: number;
  digest: DigestEntry[];
};

// A bounded-structure guard fired; the service turns these into counters.
export type DukeCounter =
  | "duke_probe_orbit_retired"
  | "duke_intel_evicted"
  | "duke_digest_evicted"
  | "duke_build_rejected"
  | "duke_flight_cap_rejected"
  | "duke_incursion_suppressed_by_court";
