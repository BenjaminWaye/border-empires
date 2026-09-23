// Client-side mirror of the gateway's Duke status contract
// (apps/realtime-gateway/src/galaxy-duke-service/galaxy-duke-view.ts). The
// client has no shared type package with the gateway for this layer, so the
// shape lives here and is exercised by the panel/HUD tests.
export type DukeDigestKind = "COMBAT" | "ECONOMY" | "INTEL" | "POLITICS" | "COURT";
export type DukeDigestEntry = { at: number; kind: DukeDigestKind; text: string };

export type DukeIntelView = {
  seasonId: string;
  label: string;
  stability: number;
  defenderHull: number | null;
  at: number;
  live: boolean;
};

export type DukeStatus = {
  now: number;
  influence: number;
  production: {
    ratePerDay: number;
    slot: { kind: string; label: string; cost: number; progress: number; daysLeft: number | null } | null;
    idleBank: number;
  };
  ships: {
    fighterHulls: number[];
    probeStock: number;
    inFlight: { kind: "PROBE" | "RAID"; seasonId: string; arrivesAt: number } | null;
    orbiting: { seasonId: string; label: string }[];
  };
  intel: DukeIntelView[];
  gate: { available: boolean; availableAt: number | null; cycleMs: number };
  court: {
    start: number;
    current: number;
    fallen: boolean;
    capturedSectors: number;
    committedInfluence: number;
    myContribution: number;
    offer: { status: string; protectedUntil: number | null; moveLockedUntil: number | null };
  };
  meters: {
    sectors: { seasonId: string; label: string; stability: number; hitsRemaining: number }[];
    domainWeight: number;
    rank: number;
    dukeCount: number;
  };
  docket: {
    incursionArrivesAt: number | null;
    slotState: "EMPTY" | "BUILDING";
    canMoveAgainstCourt: boolean;
    minMoveAgainstCourtWager: number;
  };
  digest: DukeDigestEntry[];
};

export type DukeActionFailure = { ok: false; code: string; availableAt?: number };
export type DukeTargetOption = { seasonId: string; label: string };
