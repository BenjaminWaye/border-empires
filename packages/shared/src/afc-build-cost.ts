import { techGoldCostForResearchedCount } from "./tech-economy.js";

/** The first additional AFC costs the same as a player's ninth Manifest. */
export const AFC_BUILD_COST_ANCHOR_TECH_COUNT = 8;
export const AFC_BUILD_COST_GROWTH = 2;

/** Coin price for the next AFC, based on all AFCs currently owned (including captured ones). */
export const afcBuildCost = (ownedAfcCount: number): number =>
  techGoldCostForResearchedCount(AFC_BUILD_COST_ANCHOR_TECH_COUNT) * AFC_BUILD_COST_GROWTH ** Math.max(0, ownedAfcCount - 1);

/** Campaign-wide replacement supply: the first recorded loss quotes 20 Coin. */
export const afcReplacementCost = (globalLosses: number): number =>
  20 + 10 * Math.max(0, globalLosses - 1);
export const AFC_REPLACEMENT_DELIVERY_MS = 60_000;

/** One delivery per player; no history or timer cache is persisted. */
export interface AfcRecoveryState {
  globalLosses: number;
  requiredSince?: number;
  pending?: { x: number; y: number; arrivesAt: number; cost: number; commandId: string };
  cancellation?: string;
}
