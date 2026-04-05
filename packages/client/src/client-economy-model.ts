export type EconomyFocusKey = "ALL" | "GOLD" | "FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD";

export type EconomyResourceKey = Exclude<EconomyFocusKey, "ALL"> | "OIL";

export type EconomyBucket = {
  label: string;
  amountPerMinute: number;
  count: number;
  note?: string;
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
  IRON: emptyResourceBreakdown(),
  CRYSTAL: emptyResourceBreakdown(),
  SUPPLY: emptyResourceBreakdown(),
  SHARD: emptyResourceBreakdown(),
  OIL: emptyResourceBreakdown()
});
