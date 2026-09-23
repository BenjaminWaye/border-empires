import type { DukeBuildOption, DukeStatus, DukeSystemView } from "./client-duke-types.js";

// Shared test fixtures: a fresh Industrial Duke with one empty planet.
export const NOW = 1_000_000_000;
export const H = 60 * 60 * 1000;
export const D = 24 * H;

export const buildOption = (patch: Partial<DukeBuildOption> = {}): DukeBuildOption => ({
  kind: "FIGHTER",
  label: "Fighter",
  summary: "Defends this system, and can raid",
  cost: 80,
  daysAtCurrentRate: 14,
  blockedBy: null,
  ...patch
});

export const dukeSystem = (patch: Partial<DukeSystemView> = {}): DukeSystemView => ({
  seasonId: "s1",
  label: "Aurelia",
  specialization: "INDUSTRIAL",
  stability: 80,
  hitsRemaining: 4,
  ratePerDay: 6,
  slot: null,
  idleBank: 12,
  fighters: [],
  probeStock: 0,
  options: [
    buildOption(),
    buildOption({ kind: "PROBE", label: "Probe", summary: "Surveys a system, then watches it", cost: 25, daysAtCurrentRate: 5 }),
    buildOption({ kind: "REFIT", label: "Refit", summary: "Repairs your most damaged Fighter", cost: 0, blockedBy: "NOTHING_TO_REPAIR" })
  ],
  fortifyMaxPoints: 20,
  fortifyBlockedBy: null,
  bodies: [
    { index: 0, kind: "GAS_GIANT", development: null, option: buildOption({ kind: "DEVELOP", label: "Gas Harvester", summary: "+8 Production per Cycle", cost: 80, daysAtCurrentRate: 14 }) },
    { index: 1, kind: "ICE_MOON", development: { label: "Cryo Refinery", summary: "+6 Stability per Cycle here" }, option: null }
  ],
  incursionArrivesAt: NOW + 2 * D,
  developmentsOnline: 1,
  freeDevelopmentUsed: true,
  ...patch
});

export const dukeStatus = (patch: Partial<DukeStatus> = {}): DukeStatus => ({
  now: NOW,
  influence: 12,
  systems: [dukeSystem()],
  attention: [
    { kind: "INCURSION_UNDEFENDED", severity: "URGENT", seasonId: "s1", label: "Aurelia", at: NOW + 2 * D },
    { kind: "SLOT_EMPTY", severity: "NOTICE", seasonId: "s1", label: "Aurelia", at: null }
  ],
  flights: [],
  orbiting: [],
  intel: [],
  petition: { available: true, availableAt: null },
  court: {
    start: 300,
    current: 280,
    fallen: false,
    capturedSectors: 2,
    committedInfluence: 0,
    myContribution: 0,
    offer: { status: "DECLINED", protectedUntil: null, moveLockedUntil: null },
    canMoveAgainstCourt: true,
    minWager: 5
  },
  meters: { domainWeight: 13, rank: 1, dukeCount: 2 },
  economy: { developmentUpkeepPerCycle: 0, incursionsPerCyclePerSystem: 1.5, wardenPoolPerCycle: 3 },
  digest: [{ at: NOW - 3 * H, kind: "COMBAT", text: "Incursion hit Aurelia: Stability 100 to 80." }],
  ...patch
});
