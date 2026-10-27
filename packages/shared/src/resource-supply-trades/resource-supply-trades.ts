import { z } from "zod";
import { NETWORK_RESOURCES, RESOURCE_NETWORKS } from "../resource-networks/resource-networks.js";

export const UPKEEP_TRADE_RESOURCES = ["FOOD", "TITANIUM", "CRYSTAL", "UMBRITE"] as const;
export const TRADABLE_SUPPLY_RESOURCES = [...UPKEEP_TRADE_RESOURCES, ...NETWORK_RESOURCES] as const;
export type TradableSupplyResource = typeof TRADABLE_SUPPLY_RESOURCES[number];
export type ResourceSupplyOffer = z.infer<typeof ResourceSupplyOfferSchema>;
export type ResourceSupplyAmounts = Record<TradableSupplyResource, number>;
export const MAX_RESOURCE_TRADE_SLOTS = 10_000;
export const MAX_RESOURCE_SUPPLY_AGREEMENTS = 256;
export const MAX_RESOURCE_SUPPLY_AGREEMENTS_PER_PLAYER = 16;
const amount = z.number().int().min(0).max(MAX_RESOURCE_TRADE_SLOTS).optional();
export const ResourceSupplyOfferSchema = z.object({
  FOOD: amount, TITANIUM: amount, CRYSTAL: amount, UMBRITE: amount,
  NEURAL_RESIN: amount, CONDUCTIVE_MINERALS: amount, CATALYTIC_DEPOSIT: amount,
  LUXURY_BIOTA: amount, PRECURSOR_SALVAGE: amount
}).strict();
export const ResourceSupplyAgreementSchema = z.object({
  id: z.string().min(1).max(160), proposerId: z.string().min(1).max(128), targetId: z.string().min(1).max(128),
  proposerGives: ResourceSupplyOfferSchema, targetGives: ResourceSupplyOfferSchema,
  startedAt: z.number().int().nonnegative(), expiresAt: z.number().int().nonnegative().optional()
}).refine(row => row.proposerId !== row.targetId && (row.expiresAt === undefined || row.expiresAt > row.startedAt) &&
  TRADABLE_SUPPLY_RESOURCES.some(resource => (row.proposerGives[resource] ?? 0) + (row.targetGives[resource] ?? 0) > 0));
export type ResourceSupplyAgreement = z.infer<typeof ResourceSupplyAgreementSchema>;

export const emptyResourceSupplyAmounts = (): ResourceSupplyAmounts => ({
  FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, NEURAL_RESIN: 0,
  CONDUCTIVE_MINERALS: 0, CATALYTIC_DEPOSIT: 0, LUXURY_BIOTA: 0, PRECURSOR_SALVAGE: 0
});
export const hasResourceSupplyOffer = (offer: ResourceSupplyOffer | undefined): boolean =>
  TRADABLE_SUPPLY_RESOURCES.some(resource => (offer?.[resource] ?? 0) > 0);
export const supplyResourceLabel = (resource: TradableSupplyResource): string =>
  resource in RESOURCE_NETWORKS ? RESOURCE_NETWORKS[resource as keyof typeof RESOURCE_NETWORKS].name
    : resource === "FOOD" ? "FOOD" : resource === "CRYSTAL" ? "Crystal" : resource === "TITANIUM" ? "Titanium" : "Umbrite";

export type ResourceSupplyFlow = { readonly incoming: Readonly<ResourceSupplyAmounts>; readonly outgoing: Readonly<ResourceSupplyAmounts> };
export type ResourceSupplyAllocation = {
  readonly flows: ReadonlyMap<string, ResourceSupplyFlow>;
  readonly fulfilled: ReadonlySet<string>;
  readonly suspended: ReadonlySet<string>;
};
export type ResourceSupplyCapacity = (playerId: string, phase: "upkeep" | "network",
  upkeepFlows: ReadonlyMap<string, ResourceSupplyFlow>) => ResourceSupplyOffer;

/** Physical domestic supply backs exports. Received slots never become export capacity.
 * Upkeep transfers resolve first, so imported FOOD can power a resource supplier.
 * A shortage suspends both directions of a deal. Drop one failed deal per pass,
 * then recompute, giving older commitments stable priority without phantom slots.
 * All transient maps/sets are bounded by the capped agreement participant count.
 */
export const allocateResourceSupplyAgreements = (agreements: readonly ResourceSupplyAgreement[], now: number,
  capacityFor: ResourceSupplyCapacity): ResourceSupplyAllocation => {
  if (agreements.length > MAX_RESOURCE_SUPPLY_AGREEMENTS) throw new RangeError("Resource supply agreement capacity exceeded");
  if (new Set(agreements.map(row => row.id)).size !== agreements.length) throw new Error("Duplicate resource supply agreement identity");
  const active = agreements.filter(row => row.startedAt <= now && (row.expiresAt === undefined || row.expiresAt > now))
    .sort((a, b) => a.startedAt - b.startedAt || a.id.localeCompare(b.id));
  const suspended = new Set<string>();
  let remaining = active;
  // Capacity reads can traverse a House's territory. Keep them bounded across
  // shortage retries: domestic upkeep is invariant within this allocation,
  // network capacity changes only when the complete upkeep-flow state changes.
  const upkeepCapacity = new Map<string, ResourceSupplyOffer>();
  const networkCapacity = new Map<string, ResourceSupplyOffer>();
  let networkUpkeepSignature: string | undefined;
  for (let pass = 0; pass <= active.length; pass += 1) {
    const flows = new Map<string, { incoming: ResourceSupplyAmounts; outgoing: ResourceSupplyAmounts }>();
    const deliveries = new Map<string, { give: ResourceSupplyAmounts; ask: ResourceSupplyAmounts }>();
    for (const row of remaining) {
      for (const id of [row.proposerId, row.targetId]) if (!flows.has(id))
        flows.set(id, { incoming: emptyResourceSupplyAmounts(), outgoing: emptyResourceSupplyAmounts() });
      deliveries.set(row.id, { give: emptyResourceSupplyAmounts(), ask: emptyResourceSupplyAmounts() });
    }
    for (const phase of ["upkeep", "network"] as const) {
      const resources: readonly TradableSupplyResource[] = phase === "upkeep" ? UPKEEP_TRADE_RESOURCES : NETWORK_RESOURCES;
      if (!remaining.some(row => resources.some(resource => (row.proposerGives[resource] ?? 0) + (row.targetGives[resource] ?? 0) > 0))) continue;
      if (phase === "network") {
        const signature = JSON.stringify([...flows].flatMap(([id, flow]) => {
          const values = UPKEEP_TRADE_RESOURCES.flatMap(resource => [flow.incoming[resource], flow.outgoing[resource]]);
          return values.some(value => value !== 0) ? [[id, ...values]] : [];
        }).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
        if (signature !== networkUpkeepSignature) { networkCapacity.clear(); networkUpkeepSignature = signature; }
      }
      const capacities = phase === "upkeep" ? upkeepCapacity : networkCapacity;
      for (const id of flows.keys()) if (!capacities.has(id)) capacities.set(id, { ...capacityFor(id, phase, flows) });
      for (const row of remaining) {
        const transfer = (fromId: string, toId: string, offered: ResourceSupplyOffer, delivered: ResourceSupplyAmounts): void => {
          const from = flows.get(fromId)!, to = flows.get(toId)!, capacity = capacities.get(fromId)!;
          for (const resource of resources) {
            const rawCapacity = capacity[resource] ?? 0;
            const available = Number.isFinite(rawCapacity) ? Math.max(0, Math.floor(rawCapacity) - from.outgoing[resource]) : 0;
            const quantity = Math.min(offered[resource] ?? 0, available);
            from.outgoing[resource] += quantity; to.incoming[resource] += quantity; delivered[resource] = quantity;
          }
        };
        const delivered = deliveries.get(row.id)!;
        transfer(row.proposerId, row.targetId, row.proposerGives, delivered.give);
        transfer(row.targetId, row.proposerId, row.targetGives, delivered.ask);
      }
    }
    const failed = remaining.find(row => TRADABLE_SUPPLY_RESOURCES.some(resource => {
      const delivered = deliveries.get(row.id)!;
      return delivered.give[resource] < (row.proposerGives[resource] ?? 0) || delivered.ask[resource] < (row.targetGives[resource] ?? 0);
    }));
    if (!failed) return { flows, fulfilled: new Set(remaining.map(row => row.id)), suspended };
    suspended.add(failed.id); remaining = remaining.filter(row => row.id !== failed.id);
  }
  throw new Error("Resource supply allocation did not converge within its agreement bound");
};
