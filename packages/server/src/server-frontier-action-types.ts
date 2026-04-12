import type { OwnershipState, TileKey } from "@border-empires/shared";

export type CombatResultChange = {
  x: number;
  y: number;
  ownerId?: string;
  ownershipState?: OwnershipState | "BARBARIAN";
};

export type BasicFrontierActionType = "EXPAND" | "ATTACK";

export type PrecomputedFrontierCombat = {
  atkEff: number;
  defEff: number;
  winChance: number;
  win: boolean;
  previewChanges: CombatResultChange[];
  previewWinnerId?: string;
  defenderOwnerId?: string;
  previewManpowerDelta?: number;
};

export interface PendingCapture {
  resolvesAt: number;
  origin: TileKey;
  target: TileKey;
  attackerId: string;
  staminaCost: number;
  manpowerCost: number;
  cancelled: boolean;
  actionType?: "EXPAND" | "ATTACK" | "BREAKTHROUGH_ATTACK" | "DEEP_STRIKE_ATTACK" | "NAVAL_INFILTRATION_ATTACK";
  startedAt?: number;
  traceId?: string;
  precomputedCombat?: PrecomputedFrontierCombat;
  precomputedCombatPromise?: Promise<PrecomputedFrontierCombat>;
  timeout?: NodeJS.Timeout;
}
