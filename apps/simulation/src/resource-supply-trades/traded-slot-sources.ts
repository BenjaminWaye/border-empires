import { UPKEEP_TRADE_RESOURCES, type ResourceSlotSources, type ResourceSupplyFlow } from "@border-empires/shared";

/** Show physical generation and the rights imported or committed to other Houses. */
export function tradedSlotSources(physical: ResourceSlotSources, flow: ResourceSupplyFlow | undefined): ResourceSlotSources {
  if (!flow) return physical;
  const result: ResourceSlotSources = {
    FOOD: [...physical.FOOD], TITANIUM: [...physical.TITANIUM],
    CRYSTAL: [...physical.CRYSTAL], UMBRITE: [...physical.UMBRITE]
  };
  for (const resource of UPKEEP_TRADE_RESOURCES) {
    const incoming = flow.incoming[resource] ?? 0, outgoing = flow.outgoing[resource] ?? 0;
    if (incoming) result[resource].push({ kind: "TRADE_IMPORT", id: "", slots: incoming, count: 1 });
    if (outgoing) result[resource].push({ kind: "TRADE_EXPORT", id: "", slots: -outgoing, count: 1 });
  }
  return result;
}
