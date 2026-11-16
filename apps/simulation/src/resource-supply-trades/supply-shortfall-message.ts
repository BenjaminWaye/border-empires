// Why a House can't supply the resource slots a deal promises. Playtest
// 2026-11-16: a House that simply lacked the slots was told they were
// "already in use or committed to another deal", which sent her looking
// for a deal that didn't exist.
//
// Both sides of the deal can see this message, so it names only what the
// deal asked for: a House's spare inventory and its other agreements stay
// private (see "keeps another House's spare inventory ... private").
import { TRADABLE_SUPPLY_RESOURCES, supplyResourceLabel, type ResourceSupplyOffer } from "@border-empires/shared";

export const supplyShortfallMessage = (
  name: string,
  promised: ResourceSupplyOffer,
  available: ResourceSupplyOffer
): string | undefined => {
  const resource = TRADABLE_SUPPLY_RESOURCES.find((candidate) => (promised[candidate] ?? 0) > (available[candidate] ?? 0));
  if (!resource) return undefined;
  const need = promised[resource] ?? 0;
  return `${name} doesn't have ${need} spare ${supplyResourceLabel(resource)} supply slot${need === 1 ? "" : "s"} for this deal`;
};
