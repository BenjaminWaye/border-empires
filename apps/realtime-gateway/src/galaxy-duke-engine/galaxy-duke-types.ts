import type { ActionGateState } from "../galaxy-action-gate/galaxy-action-gate.js";
import type { CourtOfferState } from "../galaxy-court-offer/galaxy-court-offer.js";

export type DukeBuildKind = "FIGHTER" | "PROBE" | "FORTIFY" | "REFIT";

// The one build slot (§21.8). FORTIFY carries the Sector it heals.
export type DukeBuild = {
  kind: DukeBuildKind;
  label: string;
  cost: number;
  progress: number;
  seasonId?: string;
  points?: number;
};

export type DukeFighter = { hull: number };

export type OrbitingProbe = { seasonId: string; arrivedAt: number };

// Timestamped intel on a Surveyed system (§17.2). `live` is true while a
// Probe orbits it (§26.7); otherwise it is a dated snapshot.
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
  | { kind: "PROBE"; seasonId: string; launchedAt: number; arrivesAt: number }
  | { kind: "RAID"; seasonId: string; launchedAt: number; arrivesAt: number; fighterHull: number };

export type DukeIncursionState = {
  // Accumulates 1/(Dukes in the region) per Cycle; an incursion is warned at 1.
  credit: number;
  arrivesAt: number | null;
  count: number;
  lastCreditCycle: number;
};

export type DigestKind = "COMBAT" | "ECONOMY" | "INTEL" | "POLITICS" | "COURT";
export type DigestEntry = { at: number; kind: DigestKind; text: string };

export type DukeState = {
  authUid: string;
  createdAt: number;
  lastAdvancedAt: number;
  slot: DukeBuild | null;
  idleBank: number;
  fighters: DukeFighter[];
  probeStock: number;
  orbiting: OrbitingProbe[];
  intel: DukeIntel[];
  inFlight: InFlightOrder | null;
  actionGate: ActionGateState;
  courtOffer: CourtOfferState;
  incursion: DukeIncursionState;
  digest: DigestEntry[];
};

// A bounded-structure guard fired; the service turns these into counters.
export type DukeCounter =
  | "duke_probe_orbit_retired"
  | "duke_intel_evicted"
  | "duke_digest_evicted"
  | "duke_build_rejected"
  | "duke_incursion_suppressed_by_court";
