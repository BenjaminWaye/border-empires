// Why a House can't supply the resource slots a deal promises. Playtest
// 2026-11-16: a House that simply lacked the slots was told they were
// "already in use or committed to another deal", which sent her looking
// for a deal that didn't exist.
import { TRADABLE_SUPPLY_RESOURCES, supplyResourceLabel, type ResourceSupplyOffer } from "@border-empires/shared";

export const supplyShortfallMessage = (
  name: string,
  promised: ResourceSupplyOffer,
  available: ResourceSupplyOffer,
  /** Slots this House already supplies to other deals. */
  committed: Readonly<Partial<Record<string, number>>> | undefined
): string | undefined => {
  const resource = TRADABLE_SUPPLY_RESOURCES.find((candidate) => (promised[candidate] ?? 0) > (available[candidate] ?? 0));
  if (!resource) return undefined;
  const need = promised[resource] ?? 0;
  const have = available[resource] ?? 0;
  const inOtherDeals = committed?.[resource] ?? 0;
  const label = supplyResourceLabel(resource);
  return `${name} has ${have} spare ${label} supply slot${have === 1 ? "" : "s"}, but this deal needs ${need}` +
    (inOtherDeals > 0 ? ` (${inOtherDeals} already committed to other deals)` : "");
};
