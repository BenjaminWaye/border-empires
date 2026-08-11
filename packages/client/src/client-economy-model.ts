export type EconomyFocusKey = "ALL" | "GOLD" | "FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE";

export type EconomyResourceKey = Exclude<EconomyFocusKey, "ALL"> | "SHARD";

export type EconomyBucket = {
  label: string;
  amountPerMinute: number;
  count: number;
  resourceKey?: EconomyResourceKey;
  note?: string;
  dormantCount?: number;
};

export type EconomyBreakdownResource = {
  sources: EconomyBucket[];
  sinks: EconomyBucket[];
};

export type EconomyBreakdown = Record<EconomyResourceKey, EconomyBreakdownResource>;

const emptyResourceBreakdown = (): EconomyBreakdownResource => ({ sources: [], sinks: [] });

export const emptyEconomyBreakdown = (): EconomyBreakdown => ({
  GOLD: emptyResourceBreakdown(),
  FOOD: emptyResourceBreakdown(),
  TITANIUM: emptyResourceBreakdown(),
  CRYSTAL: emptyResourceBreakdown(),
  UMBRITE: emptyResourceBreakdown(),
  SHARD: emptyResourceBreakdown()
});
