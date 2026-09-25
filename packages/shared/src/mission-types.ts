// Mission-related types, extracted from types.ts (500-line source budget,
// see AGENTS.md) to make room for the Manifest tree naming/lore pass's
// ANCILLARY_DEPOT/RESERVE_LATTICE structure types without growing that
// already-oversized file further.

export type MissionKind =
  | "NEUTRAL_CAPTURES"
  | "ENEMY_CAPTURES"
  | "COMBAT_WINS"
  | "TILES_HELD"
  | "SETTLED_TILES_HELD"
  | "FARMS_HELD"
  | "CONTINENTS_HELD"
  | "TECH_PICKS";

export interface MissionState {
  id: string;
  kind: MissionKind;
  name: string;
  description: string;
  unlockPoints: number;
  prerequisiteId?: string;
  target: number;
  progress: number;
  rewardPoints: number;
  rewardLabel?: string;
  expiresAt?: number;
  completed: boolean;
  claimed: boolean;
}

export interface MissionStats {
  neutralCaptures: number;
  enemyCaptures: number;
  combatWins: number;
  maxTilesHeld: number;
  maxSettledTilesHeld: number;
  maxFarmsHeld: number;
  maxContinentsHeld: number;
  maxTechPicks: number;
}

export interface PendingResearch {
  techId: string;
  startedAt: number;
  completesAt: number;
}
