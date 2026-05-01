import type { OwnershipState, TileKey } from "@border-empires/shared";
import type { StrategicResource } from "./server-shared-types.js";

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
  attackerWon: boolean;
  changes: CombatResultChange[];
  winnerId?: string;
  defenderOwnerId?: string;
  pointsDelta: number;
  manpowerDelta: number;
  pillagedGold: number;
  pillagedShare: number;
  pillagedStrategic: Partial<Record<StrategicResource, number>>;
};

export interface PendingCapture {
  resolvesAt: number;
  origin: TileKey;
  target: TileKey;
  attackerId: string;
  staminaCost: number;
  manpowerCost: number;
  cancelled: boolean;
  actionType?: "EXPAND" | "ATTACK" | "DEEP_STRIKE_ATTACK" | "NAVAL_INFILTRATION_ATTACK";
  startedAt?: number;
  traceId?: string;
  precomputedCombat?: PrecomputedFrontierCombat;
  precomputedCombatPromise?: Promise<PrecomputedFrontierCombat>;
  timeout?: NodeJS.Timeout;
}
