import type { DukeStatus } from "./client-duke-types.js";

// Shared test fixture: a fresh Industrial Duke mid-Cycle with nothing built.
export const NOW = 1_000_000_000;

export const dukeStatus = (patch: Partial<DukeStatus> = {}): DukeStatus => ({
  now: NOW,
  influence: 12,
  production: { ratePerDay: 6, slot: null, idleBank: 12 },
  ships: { fighterHulls: [], probeStock: 0, inFlight: null, orbiting: [] },
  intel: [],
  gate: { available: true, availableAt: null, cycleMs: 7 * 24 * 60 * 60 * 1000 },
  court: {
    start: 300,
    current: 280,
    fallen: false,
    capturedSectors: 2,
    committedInfluence: 0,
    myContribution: 0,
    offer: { status: "DECLINED", protectedUntil: null, moveLockedUntil: null }
  },
  meters: {
    sectors: [{ seasonId: "s1", label: "Aurelia", stability: 80, hitsRemaining: 4 }],
    domainWeight: 13,
    rank: 1,
    dukeCount: 2
  },
  docket: { incursionArrivesAt: NOW + 2 * 24 * 60 * 60 * 1000, slotState: "EMPTY", canMoveAgainstCourt: true, minMoveAgainstCourtWager: 5 },
  digest: [{ at: NOW - 3 * 60 * 60 * 1000, kind: "COMBAT", text: "Incursion hit Aurelia: Stability 100 to 80." }],
  ...patch
});
