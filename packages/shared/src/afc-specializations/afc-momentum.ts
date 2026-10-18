import { AFC_SPECIALIZATION_BALANCE } from "./afc-specializations.js";
export interface AfcFlagMomentum { stacks: number; decayAt: number }
/** Lazy decay is independent of tick frequency and never needs an expiry timer per flag. */
export function afcMomentumStacks(momentum: AfcFlagMomentum | undefined, now: number): number {
  if (!momentum) return 0;
  const decayed = now < momentum.decayAt ? 0 : 1 + Math.floor((now - momentum.decayAt) / AFC_SPECIALIZATION_BALANCE.momentumIdleMs);
  return Math.max(0, Math.min(AFC_SPECIALIZATION_BALANCE.momentumMaxStacks, momentum.stacks) - decayed);
}
export function afcMomentumAfterVictory(momentum: AfcFlagMomentum | undefined, garrisoned: boolean, now: number): AfcFlagMomentum | undefined {
  const stacks = Math.min(AFC_SPECIALIZATION_BALANCE.momentumMaxStacks, afcMomentumStacks(momentum, now) + (garrisoned ? 1 : 0));
  return stacks > 0 ? { stacks, decayAt: now + AFC_SPECIALIZATION_BALANCE.momentumIdleMs } : undefined;
}
