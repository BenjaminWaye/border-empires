import type { SlotResource } from "@border-empires/shared";

/**
 * Sums two "flat granted supply" maps (e.g. domain-granted +
 * waystation-granted, both Partial<Record<SlotResource, number>>) into one,
 * for passing as the single `domainGrantedSupply` argument
 * resourceSlotSupplyForPlayer expects. Order-independent; either side may be
 * undefined. Split out of resource-slot-view.ts to keep that file under the
 * repo's 500-line cap (see AGENTS.md).
 */
export const mergeResourceSlotGrants = (
  a: Partial<Record<SlotResource, number>> | undefined,
  b: Partial<Record<SlotResource, number>> | undefined
): Partial<Record<SlotResource, number>> | undefined => {
  if (!a) return b;
  if (!b) return a;
  const merged: Partial<Record<SlotResource, number>> = { ...a };
  for (const resource of Object.keys(b) as SlotResource[]) {
    merged[resource] = (merged[resource] ?? 0) + (b[resource] ?? 0);
  }
  return merged;
};
