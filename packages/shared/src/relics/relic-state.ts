import type { NaturalWonderState, NaturalWonderType } from "../natural-wonder-types.js";
import { RELIC_DEFINITIONS } from "./relic-catalog.js";

export type RelicOperationalState = "dormant" | "active" | "depleted";

/** Old saved wonders retain their original rules until a new world is seeded. */
export const isRedesignedRelic = (state: NaturalWonderState | null | undefined): boolean => state?.relicVersion === 1;

export const createRelicState = (type: NaturalWonderType): NaturalWonderState => {
  const reserve = RELIC_DEFINITIONS[type].reserve;
  return { type, relicVersion: 1, ...(reserve === undefined ? {} : { remainingUses: reserve }) };
};

/** A missing new-world counter initializes to capacity; an explicit zero never refills. */
export const relicRemainingUses = (state: NaturalWonderState): number | undefined => {
  if (!isRedesignedRelic(state)) return undefined;
  const capacity = RELIC_DEFINITIONS[state.type].reserve;
  if (capacity === undefined) return undefined;
  const saved = state.remainingUses;
  if (saved === undefined) return capacity;
  if (!Number.isFinite(saved)) return 0;
  return Math.min(capacity, Math.max(0, Math.floor(saved)));
};

export const relicOperationalState = (state: NaturalWonderState, garrisoned: boolean): RelicOperationalState => {
  if (relicRemainingUses(state) === 0) return "depleted";
  return garrisoned ? "active" : "dormant";
};

/** Return a new persisted state. Ownership is deliberately absent from reserve accounting. */
export const consumeRelicUse = (state: NaturalWonderState): { state: NaturalWonderState; consumed: boolean } => {
  const remaining = relicRemainingUses(state);
  if (remaining === undefined || remaining === 0) return { state, consumed: false };
  return { state: { ...state, remainingUses: remaining - 1 }, consumed: true };
};

export const relicReserveLabel = (state: NaturalWonderState): string | undefined => {
  const remaining = relicRemainingUses(state);
  if (remaining === undefined) return undefined;
  if (remaining === 0) return "Depleted";
  return `${remaining}/${RELIC_DEFINITIONS[state.type].reserve} ${RELIC_DEFINITIONS[state.type].unit} remaining`;
};

/** Casting reach is independent of ordinary tower protection and vision. */
export const relicCastRadius = (state: NaturalWonderState | null | undefined, ordinaryRange: number): number =>
  isRedesignedRelic(state) && state?.type === "WATCHTOWER_ENGINE" ? 50 : ordinaryRange;
