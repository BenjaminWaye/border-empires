// Disabled-button text for a build that needs free resource slots. Pure (no state import), so the tier
// picker, Relay Beacon, town growth and placement gates all word it the same way.
//
// `free` is supply minus demand and goes negative when the empire uses more slots than it makes (playtest
// 2026-11-19: 8 FOOD used against 3 produced). The requirement stays first and the deficit follows it,
// "Need a free FOOD slot · 5 short", so it never reads as the building costing 5 or 6 FOOD.
import type { SlotResource } from "@border-empires/shared";

export const resourceSlotReasonText = (resource: SlotResource, count: number, free: number): string => {
  const deficit = free < 0 ? ` · ${-free} short` : "";
  if (count <= 1) return `Need a free ${resource} slot${deficit}`;
  return deficit ? `Need ${count} free ${resource} slots${deficit}` : `Need ${count} free ${resource} slots (have ${Math.max(0, free)})`;
};

/** Supply minus demand for one slot resource; negative in deficit. */
export const freeSlotsOf = (slots: { supply: Partial<Record<SlotResource, number>>; demand: Partial<Record<SlotResource, number>> } | undefined, resource: SlotResource): number =>
  (slots?.supply[resource] ?? 0) - (slots?.demand[resource] ?? 0);
