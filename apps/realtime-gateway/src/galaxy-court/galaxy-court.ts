// Court Strength and Domain Weight (design doc §21.2, §21.5, §23). Both are
// derived on read from facts we already store, so there is no counter to drift
// out of sync with reality.
import { influenceTrickleFor } from "../galaxy-cycle-tick/galaxy-cycle-tick.js";
import {
  COURT_STRENGTH_PER_SECTOR,
  MOVE_AGAINST_COURT_DIVISOR,
  SECTOR_CAPTURE_REDUCTION
} from "../galaxy-duke-engine/galaxy-duke-config.js";
import { WRIT_COURT_STRENGTH_GAIN } from "../galaxy-duke-engine/galaxy-duke-politics-config.js";
import type { HeldSector } from "../galaxy-duke-engine/galaxy-duke-systems.js";

export type CourtStrength = {
  start: number;
  current: number;
  fallen: boolean;
  capturedSectors: number;
  committedInfluence: number;
  writsAccepted: number;
};

// Start = 10 x total Sector count. A captured Sector (a won season) is -10; a
// passed Move Against the Court is -(Influence / 5). The only increase is an
// accepted Writ (+3, §21.3), and it never lifts the Court above its start.
export const computeCourtStrength = (input: {
  totalSectors: number;
  capturedSectors: number;
  committedInfluence: number;
  writsAccepted?: number;
}): CourtStrength => {
  const start = input.totalSectors * COURT_STRENGTH_PER_SECTOR;
  const writsAccepted = input.writsAccepted ?? 0;
  const reduction = input.capturedSectors * SECTOR_CAPTURE_REDUCTION + Math.floor(input.committedInfluence / MOVE_AGAINST_COURT_DIVISOR);
  const current = Math.min(start, Math.max(0, start - reduction + writsAccepted * WRIT_COURT_STRENGTH_GAIN));
  return { start, current, fallen: current === 0, capturedSectors: input.capturedSectors, committedInfluence: input.committedInfluence, writsAccepted };
};

// Domain Weight decides the throne (§21.5): Planet 10 + its Influence output,
// Outpost 3 + its Influence output, Stability / 100, and Influence committed
// to Move Against the Court / 5, plus Renown from grievances (§29.2). Wonders
// and Developments are cut from the MVP.
export const computeDomainWeight = (input: {
  holdings: ReadonlyArray<HeldSector>;
  totalStability: number;
  committedInfluence: number;
  renown?: number;
}): number => {
  const holdingsWeight = input.holdings.reduce(
    (sum, h) => sum + (h.tier === "PLANET" ? 10 : 3) + influenceTrickleFor(h.specialization, h.tier),
    0
  );
  const raw = holdingsWeight + input.totalStability / 100 + input.committedInfluence / MOVE_AGAINST_COURT_DIVISOR + (input.renown ?? 0);
  return Math.round(raw * 10) / 10;
};

export type DomainRank = { authUid: string; weight: number; rank: number };

// Dense-by-position ranking, ties broken by authUid so it is deterministic.
export const rankDomainWeights = (weights: ReadonlyMap<string, number>): DomainRank[] =>
  [...weights.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([authUid, weight], i) => ({ authUid, weight, rank: i + 1 }));
