// Regression: the town panel's Coin cell went blank ("—") after a
// population-growth tick, because that tick's town record carries isFed and
// the growth rate but not goldPerMinute, and gatewayTownSummary replaced the
// town wholesale.
import { describe, expect, it } from "vitest";

import { gatewayTownSummary } from "./client-gateway-sync-town-summary.js";
import type { Tile } from "../client-types.js";

const fullTown = {
  name: "Arcfocus Ring",
  type: "MARKET",
  populationTier: "TOWN",
  population: 45_719,
  maxPopulation: 100_000,
  isFed: true,
  goldPerMinute: 2.4,
  populationGrowthPerMinute: 17.9
} as const;

const existingTile = (town: Partial<NonNullable<Tile["town"]>> = {}): Tile =>
  ({ x: 10, y: 20, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", town: { ...fullTown, ...town } }) as Tile;

// What runtime-population-growth.ts sends: the stored record, no goldPerMinute.
const growthTickTownJson = (overrides: Record<string, unknown> = {}): string => {
  const { goldPerMinute: _omitted, ...rest } = fullTown;
  return JSON.stringify({ ...rest, population: 45_737, ...overrides });
};

describe("gatewayTownSummary — coin figure across growth ticks", () => {
  it("keeps the previous goldPerMinute when a growth-tick town omits it", () => {
    const { town } = gatewayTownSummary({ x: 10, y: 20, townJson: growthTickTownJson() }, existingTile());
    expect(town?.population).toBe(45_737);
    expect(town?.goldPerMinute).toBe(2.4);
  });

  it("prefers the incoming goldPerMinute when the update carries one", () => {
    const townJson = JSON.stringify({ ...fullTown, goldPerMinute: 3.1 });
    const { town } = gatewayTownSummary({ x: 10, y: 20, townJson }, existingTile());
    expect(town?.goldPerMinute).toBe(3.1);
  });

  it("does not carry the figure across a fed-state change", () => {
    const { town } = gatewayTownSummary({ x: 10, y: 20, townJson: growthTickTownJson({ isFed: false }) }, existingTile());
    expect(town?.goldPerMinute).toBeUndefined();
  });

  it("does not carry the figure across an owner change", () => {
    const { town } = gatewayTownSummary({ x: 10, y: 20, ownerId: "ai-3", townJson: growthTickTownJson() }, existingTile());
    expect(town?.goldPerMinute).toBeUndefined();
  });
});
