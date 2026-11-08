import type { DukeBuildOption, DukeStatus, DukeSystemView } from "./client-duke-types.js";

// Shared test fixtures: a fresh Industrial Duke with one empty planet.
export const NOW = 1_000_000_000;
export const H = 60 * 60 * 1000;
export const D = 24 * H;

export const buildOption = (patch: Partial<DukeBuildOption> = {}): DukeBuildOption => ({
  kind: "FIGHTER",
  label: "Fighter",
  summary: "Defends this system, and can raid",
  durationMs: 8 * H,
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
  lastHitAt: null,
  order: { ready: true, readyAt: null },
  fighters: [],
  probeStock: 0,
  options: [
    buildOption(),
    buildOption({ kind: "PROBE", label: "Probe", summary: "Surveys a system, then watches it", durationMs: 4 * H }),
    buildOption({ kind: "REFIT", label: "Refit", summary: "Repairs every Fighter here", durationMs: 0, blockedBy: "NOTHING_TO_REPAIR" })
  ],
  fortify: { stability: 15, blockedBy: null },
  bodies: [
    { index: 0, kind: "GAS_GIANT", development: null, base: true, baseOption: null, option: buildOption({ kind: "DEVELOP", label: "Gas Harvester", summary: "+3 Production: builds here go faster", durationMs: 16 * H }) },
    { index: 1, kind: "ICE_MOON", development: { label: "Cryo Refinery", summary: "+6 Stability per Cycle here" }, base: true, baseOption: null, option: null },
    {
      index: 2,
      kind: "ASTEROID_BELT",
      development: null,
      base: false,
      baseOption: buildOption({ kind: "BASE", label: "Establish base", summary: "Lets you build a Mining Station here", durationMs: 8 * H }),
      option: buildOption({ kind: "DEVELOP", label: "Mining Station", summary: "+2 Production: builds here go faster", durationMs: 16 * H, blockedBy: "NO_BASE" })
    }
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
    { kind: "ORDER_READY", severity: "NOTICE", seasonId: "s1", label: "Aurelia", at: null }
  ],
  flights: [],
  orbiting: [],
  intel: [],
  decree: { ready: true, readyAt: null },
  court: {
    start: 300,
    current: 280,
    fallen: false,
    capturedSectors: 2,
    committedInfluence: 0,
    myContribution: 0,
    offer: { status: "DECLINED", protectedUntil: null, moveLockedUntil: null },
    canMoveAgainstCourt: true,
    minWager: 5,
    era: 1,
    isEmperor: false,
    hallOfFame: []
  },
  meters: { domainWeight: 13, rank: 1, dukeCount: 2 },
  economy: { developmentUpkeepPerCycle: 0, incursionsPerCyclePerSystem: 1.5, wardenPoolPerCycle: 3 },
  digest: [{ at: NOW - 3 * H, kind: "COMBAT", text: "Incursion hit Aurelia: Stability 100 to 80." }],
  ...patch
});
