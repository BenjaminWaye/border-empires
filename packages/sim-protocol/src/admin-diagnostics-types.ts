// Admin/diagnostics-surface types -- extracted out of index.ts (already at
// the repo's per-file line cap) to keep the main barrel from crossing it.
// No local dependencies; safe to move verbatim.
export type AdminPlayerRow = {
  id: string;
  name: string;
  isAi: boolean;
  gold: number;
  settledTiles: number;
  ownedTiles: number;
  incomePerMinute: number;
  techs: number;
  manpower: number;
  /**
   * FOOD/TITANIUM/CRYSTAL/UMBRITE run on the resource-slots pillar
   * (docs/manpower-economy-rewrite-plan.md §5): supply from settled resource
   * tiles vs. demand occupied by existing structures, not a spendable
   * stockpile — there is no banked quantity to report for these.
   */
  resourceSlotSupply: { FOOD: number; TITANIUM: number; CRYSTAL: number; UMBRITE: number };
  resourceSlotDemand: { FOOD: number; TITANIUM: number; CRYSTAL: number; UMBRITE: number };
  /** SHARD is the one strategic resource still a real banked stockpile. */
  shardStockpile: number;
  /** Persistent reach-border tile count granted to this player (see packages/shared/src/reach/reach.ts). */
  reachTiles: number;
  /** ownedTiles - settledTiles, i.e. FRONTIER-state tiles this player owns. */
  frontierTiles: number;
  /**
   * barbarian-* rows only: how many tiles owned by ANY barbarian-* player
   * (not just this row's) are currently visible to at least one
   * non-barbarian player — exportBarbActivationVisibleUnion computes one
   * combined union across every barbarian, it does not break the count down
   * per barbarian id. This is the eligibility set the barbarian AI planner
   * acts from (see system-job-barbarian-planner.ts). Identical on every
   * barbarian-* row; omitted for every non-barbarian row.
   */
  barbActivationVisibleTiles?: number;
};

export type RecentCommand = {
  playerId: string;
  type: string;
  commandId: string;
  issuedAt: number;
};

export type GetRecentCommandsResponse = {
  ok: boolean;
  commands: RecentCommand[];
};

export type AiDecisionDiagnostic = {
  playerId: string;
  tick: number;
  canExpand: boolean;
  canAttack: boolean;
  scores: Record<string, number>;
  vetoes: Record<string, string | undefined>;
  frontierState: {
    neutralCount: number;
    economicCount: number;
    townSupportCount: number;
    scoutCount: number;
    enemyCount: number;
    barbarianCount: number;
  };
  points: number;
  manpower: number;
  devSlotAvailable: boolean;
  winner: string;
  winnerScore: number;
};

export type GetAiDecisionDiagnosticsResponse = {
  ok: boolean;
  diagnostics: AiDecisionDiagnostic[];
};
