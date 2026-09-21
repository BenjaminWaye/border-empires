// Shared response types for the personal Activity dashboard's 24h "Yours"
// timeline (docs/activity-dashboard-plan.md), mirroring
// activity-dashboard-types.ts's placement: kept in game-domain so
// apps/simulation (RPC producer, apps/simulation/src/personal-activity-aggregation/)
// and apps/realtime-gateway (RPC consumer, relays as the PERSONAL_ACTIVITY_TIMELINE
// WS message) share one definition instead of two structurally-compatible
// but separate ones.
//
// Phase 0 only: the aggregator can only produce TERRITORY_FLIP_GROUP/COMBAT
// cards today (from territory-flip-log/combat-manpower-log). Waystation/town/
// building card kinds are added in Phase 2 once
// apps/simulation/src/personal-impact-log exists -- not stubbed here ahead
// of a real producer.
export const PERSONAL_ACTIVITY_TIMELINE_CARD_CAP = 100;

export type PersonalActivityDirection = "GAINED" | "LOST";

export type PersonalActivityTerritoryCard = {
  kind: "TERRITORY_FLIP_GROUP";
  id: string;
  occurredAt: number;
  direction: PersonalActivityDirection;
  counterpartyPlayerId: string | undefined;
  tileCount: number;
  x: number;
  y: number;
};

export type PersonalActivityCombatCard = {
  kind: "COMBAT";
  id: string;
  occurredAt: number;
  attackerId: string;
  defenderId: string | undefined;
  attackerWon: boolean;
  manpowerLoss: number;
  x: number;
  y: number;
  // Directional gold transfer from this specific combat, 0 when it wasn't a
  // settled-tile capture. Mirrors CombatManpowerLoss's fields (Phase 1).
  pillagedGold: number;
  defenderGoldLoss: number;
  targetWasSettled: boolean;
};

// Synthetic card the aggregator inserts when it drops lower-impact cards to
// stay under PERSONAL_ACTIVITY_TIMELINE_CARD_CAP -- truthful about what was
// hidden rather than silently dropping it.
export type PersonalActivityTruncationNoteCard = {
  kind: "TRUNCATION_NOTE";
  id: string;
  occurredAt: number;
  hiddenCount: number;
};

export type PersonalActivityCard = PersonalActivityTerritoryCard | PersonalActivityCombatCard | PersonalActivityTruncationNoteCard;

export type PersonalActivitySummary = {
  tilesClaimed: number;
  tilesLost: number;
  waystationsActivated: number;
  townsCaptured: number;
  townsLost: number;
  buildingsCompleted: number;
};

export type PersonalActivityTimeline = {
  playerId: string;
  from: number;
  to: number;
  summary: PersonalActivitySummary;
  // Directional gold transfer totals (spec 2.3) -- real data as of Phase 1,
  // summed from CombatManpowerLoss.pillagedGold/defenderGoldLoss.
  goldPlundered: number;
  goldRaidedFromYou: number;
  // Sum of the player's own attack manpower cost in the window (spec 2.3) --
  // real data today, sourced from CombatManpowerLoss.manpowerLoss where
  // attackerId === playerId.
  manpowerSpentAttacking: number;
  cards: PersonalActivityCard[];
  // True when `from` predates the 24h retention cutoff, i.e. the caller
  // asked for more history than the rolling logs can provide.
  truncated: boolean;
};
