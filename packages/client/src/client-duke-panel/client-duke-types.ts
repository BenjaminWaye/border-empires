// Client-side mirror of the gateway's Duke status contract
// (apps/realtime-gateway/src/galaxy-duke-service/galaxy-duke-view.ts). The
// client has no shared type package with the gateway for this layer, so the
// shape lives here and is exercised by the panel/HUD tests.
export type DukeDigestKind = "COMBAT" | "ECONOMY" | "INTEL" | "POLITICS" | "COURT";
export type DukeDigestEntry = { at: number; kind: DukeDigestKind; text: string };

// One ended era in the Hall of Fame (design doc §27).
export type DukeHallEntry = {
  era: number;
  endedAt: number;
  emperorAuthUid: string;
  emperorLabel: string;
  domainWeight: number;
  standings: { authUid: string; label: string; weight: number }[];
};

export type DukeIntelView = {
  seasonId: string;
  label: string;
  stability: number;
  defenderHull: number | null;
  at: number;
  live: boolean;
};

export type GalaxyBodyKind = "GAS_GIANT" | "ASTEROID_BELT" | "ICE_MOON";

export type DukeBuildOption = {
  kind: "FIGHTER" | "PROBE" | "REFIT" | "DEVELOP";
  label: string;
  summary: string;
  cost: number;
  daysAtCurrentRate: number | null;
  // Null when it can be started now; otherwise the server's reason code.
  blockedBy: string | null;
};

export type DukeBodyView = {
  index: number;
  kind: GalaxyBodyKind;
  development: { label: string; summary: string } | null;
  option: DukeBuildOption | null;
};

export type DukeSystemView = {
  seasonId: string;
  label: string;
  specialization: string;
  stability: number;
  hitsRemaining: number;
  ratePerDay: number;
  slot: { kind: string; label: string; cost: number; progress: number; daysLeft: number | null } | null;
  idleBank: number;
  fighters: number[];
  probeStock: number;
  options: DukeBuildOption[];
  fortifyMaxPoints: number;
  fortifyBlockedBy: string | null;
  bodies: DukeBodyView[];
  incursionArrivesAt: number | null;
  developmentsOnline: number;
  freeDevelopmentUsed: boolean;
};

export type DukeAttentionKind =
  | "INCURSION_UNDEFENDED"
  | "INCURSION_DEFENDED"
  | "LOW_STABILITY"
  | "SLOT_EMPTY"
  | "FIGHTER_DAMAGED"
  | "COURT_OFFER"
  | "PETITION_READY";

export type DukeAttentionItem = {
  kind: DukeAttentionKind;
  severity: "URGENT" | "NOTICE";
  seasonId: string | null;
  label: string;
  at: number | null;
};

export type DukeStatus = {
  now: number;
  influence: number;
  systems: DukeSystemView[];
  attention: DukeAttentionItem[];
  flights: { kind: "PROBE" | "RAID"; fromSeasonId: string; seasonId: string; arrivesAt: number }[];
  orbiting: { seasonId: string; label: string }[];
  intel: DukeIntelView[];
  petition: { available: boolean; availableAt: number | null };
  court: {
    start: number;
    current: number;
    fallen: boolean;
    capturedSectors: number;
    committedInfluence: number;
    myContribution: number;
    offer: { status: string; protectedUntil: number | null; moveLockedUntil: number | null };
    canMoveAgainstCourt: boolean;
    minWager: number;
    era: number;
    isEmperor: boolean;
    hallOfFame: DukeHallEntry[];
  };
  meters: { domainWeight: number; rank: number; dukeCount: number };
  economy: { developmentUpkeepPerCycle: number; incursionsPerCyclePerSystem: number; wardenPoolPerCycle: number };
  digest: DukeDigestEntry[];
};

export type DukeActionFailure = { ok: false; code: string; availableAt?: number };
export type DukeTargetOption = { seasonId: string; label: string };
export type DukePanelTab = "SYSTEM" | "COURT" | "LOG" | "TARGET";
// A system that is not yours, pressed on a map: what the panel can say about it.
export type DukeTargetInfo = { seasonId: string; label: string; stateText: string };
export type DukeShipKind = "FIGHTER" | "PROBE";
