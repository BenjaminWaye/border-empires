import type { FortVariant, NaturalWonderType, WaystationGoldTier, WaystationGrantedEffect } from "@border-empires/shared";

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
export const PERSONAL_ACTIVITY_RIVAL_CAP = 5;

export type PersonalActivityDirection = "GAINED" | "LOST";

// Something standing on a tile when it changed hands, so a card can say what
// fell with the land ("−3 tiles lost · incl. your Dock") instead of a bare
// count. A built structure carries its structure id (a FortVariant,
// SiegeBatteryVariant, "OBSERVATORY" or an EconomicStructureType -- kept a
// plain string, like BUILDING_COMPLETED's structureType, so a newer server's
// id still renders). Towns are not listed: they get their own TOWN_* cards.
export type PersonalActivityTileFeature =
  | { kind: "STRUCTURE"; structureType: string }
  | { kind: "DOCK" }
  | { kind: "AFC" }
  | { kind: "NATURAL_WONDER"; wonderType: NaturalWonderType; relicVersion?: 1 };

// Each list is what the viewing player lost or gained: a player who took a
// tile is only credited with what survived the capture (siege batteries and
// relay beacons are razed), while the player who lost it lost everything.
// Features are always sent counted by kind, so a long push that took many
// palisades is still one small entry rather than a list that grows per tile.
export type PersonalActivityTileFeatureCount = PersonalActivityTileFeature & { count: number };

export type PersonalActivityTerritoryCard = {
  kind: "TERRITORY_FLIP_GROUP";
  id: string;
  occurredAt: number;
  direction: PersonalActivityDirection;
  counterpartyPlayerId: string | undefined;
  tileCount: number;
  x: number;
  y: number;
  /** What stood on these tiles when they changed hands. */
  features?: PersonalActivityTileFeatureCount[];
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
  /** Fortification defending the target when the attack resolved, if any. */
  defenseVariant?: FortVariant;
  /** A failed attack whose launch tile the defender took in return. */
  originSeized?: boolean;
  /** What stood on the target tile when this attack captured it. */
  capturedFeatures?: PersonalActivityTileFeatureCount[];
  /** What stood on the launch tile the defender seized (with `originSeized`). */
  seizedOriginFeatures?: PersonalActivityTileFeatureCount[];
};

// Several attacks between the player and one rival close together in time
// and place (excluding same-tile sieges), folded into one card. `role` is the
// viewing player's side: ATTACKER for "your assault on Maren", DEFENDER for
// "Maren's raids on your border".
export type PersonalActivityCombatGroupCard = {
  kind: "COMBAT_GROUP";
  id: string;
  /** Time of the latest attack in the group. */
  occurredAt: number;
  role: "ATTACKER" | "DEFENDER";
  counterpartyPlayerId: string | undefined;
  attempts: number;
  /** Attacks that captured their target. */
  captures: number;
  /** Failed attacks whose launch tile the defender took in return. */
  originsSeized: number;
  /** Manpower the attacking side lost across the group. */
  manpowerLoss: number;
  pillagedGold: number;
  defenderGoldLoss: number;
  x: number;
  y: number;
  /** What stood on the tiles the group's attacks captured. */
  capturedFeatures?: PersonalActivityTileFeatureCount[];
  /** What stood on the launch tiles counted in `originsSeized`. */
  seizedOriginFeatures?: PersonalActivityTileFeatureCount[];
};

// Head-to-head tally against one opponent over the timeline window.
export type PersonalActivityRival = {
  playerId: string;
  tilesTaken: number;
  tilesLost: number;
  /** Their attacks on you that failed. */
  attacksRepelled: number;
  /** Your attacks on them that failed. */
  attacksFailed: number;
};

// Several assaults on one of the player's tiles, folded into a single card
// in place of the per-attack COMBAT cards they replace. A siege runs from the
// first logged assault on the tile until the assault that captured it
// (outcome FELL) or, if none has yet, is still HOLDING. Only ever produced
// for the defending player.
export type PersonalActivitySiegeCard = {
  kind: "SIEGE";
  id: string;
  /** Time of the latest assault in the siege (the breaking one when it fell). */
  occurredAt: number;
  startedAt: number;
  x: number;
  y: number;
  outcome: "FELL" | "HOLDING";
  assaultsRepelled: number;
  /** Repelled assaults whose launch tile the player took in return. */
  originsSeized: number;
  /** Distinct attackers in order of first assault. */
  attackerIds: string[];
  /** Manpower attackers lost across every assault, including the breaking one. */
  manpowerSpentAgainst: number;
  /** Fortification defending the tile at the latest assault, if any. */
  defenseVariant?: FortVariant;
  capturedBy?: string;
  /** What stood on the tile when it fell (includes the fortification itself). */
  capturedFeatures?: PersonalActivityTileFeatureCount[];
  /** What stood on the attackers' launch tiles counted in `originsSeized`. */
  seizedOriginFeatures?: PersonalActivityTileFeatureCount[];
};

export type PersonalActivityWaystationCard = {
  kind: "WAYSTATION_ACTIVATED";
  id: string;
  occurredAt: number;
  x: number;
  y: number;
  grantedEffect: WaystationGrantedEffect;
  revealedAtX?: number;
  revealedAtY?: number;
  grantedTechId?: string;
  grantedResource?: "FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE";
  grantedTownName?: string;
  grantedTownX?: number;
  grantedTownY?: number;
  grantedGold?: number;
  grantedGoldTier?: WaystationGoldTier;
  grantedManpower?: number;
  populationBurst?: number;
};

type PersonalActivityTownCardBase = {
  id: string;
  occurredAt: number;
  x: number;
  y: number;
  townName?: string;
  townTier: "SETTLEMENT" | "TOWN" | "CITY" | "GREAT_CITY" | "METROPOLIS";
  townSurvived: boolean;
  populationBefore: number;
  populationAfter: number;
  capturedStructureTypes: string[];
};

export type PersonalActivityTownCard = PersonalActivityTownCardBase & (
  | { kind: "TOWN_CAPTURED" }
  | { kind: "TOWN_LOST" }
);

export type PersonalActivityBuildingCard = {
  kind: "BUILDING_COMPLETED";
  id: string;
  occurredAt: number;
  x: number;
  y: number;
  structureType: string;
  instantGold?: number;
  populationBurst?: number;
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

export type PersonalActivityCard =
  | PersonalActivityTerritoryCard
  | PersonalActivityCombatCard
  | PersonalActivityCombatGroupCard
  | PersonalActivitySiegeCard
  | PersonalActivityWaystationCard
  | PersonalActivityTownCard
  | PersonalActivityBuildingCard
  | PersonalActivityTruncationNoteCard;

export type PersonalActivitySummary = {
  tilesClaimed: number;
  tilesLost: number;
  waystationsActivated: number;
  townsCaptured: number;
  townsLost: number;
  buildingsCompleted: number;
  // What stood on every tile the player lost / took from another player in
  // the window, counted by kind. Optional: an older simulation omits them.
  featuresLost?: PersonalActivityTileFeatureCount[];
  featuresCaptured?: PersonalActivityTileFeatureCount[];
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
  // Most active opponents first, capped at PERSONAL_ACTIVITY_RIVAL_CAP.
  // Optional: a simulation older than this field omits it.
  rivals?: PersonalActivityRival[];
  // True when `from` predates the 24h retention cutoff, i.e. the caller
  // asked for more history than the rolling logs can provide.
  truncated: boolean;
};
