import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { resourceSlotSupplyForPlayer } from "./resource-slot-view.js";

const tile = (overrides: Partial<DomainTileState> & Pick<DomainTileState, "x" | "y">): DomainTileState =>
  ({ terrain: "LAND", ...overrides }) as DomainTileState;

describe("resourceSlotSupplyForPlayer fishFoodSlotBonus (Agrarian Works)", () => {
  it("adds +1 FOOD slot per owned FISH tile, independent of any structure", () => {
    const totals = resourceSlotSupplyForPlayer([tile({ x: 5, y: 5, resource: "FISH" })], new Set(), new Set(), undefined, 1);
    expect(totals.FOOD).toBe(3);
  });

  it("does not apply to FARM tiles", () => {
    const totals = resourceSlotSupplyForPlayer([tile({ x: 5, y: 5, resource: "FARM" })], new Set(), new Set(), undefined, 1);
    expect(totals.FOOD).toBe(1);
  });

  it("defaults to 0 (no bonus) when the argument is omitted", () => {
    const totals = resourceSlotSupplyForPlayer([tile({ x: 5, y: 5, resource: "FISH" })]);
    expect(totals.FOOD).toBe(2);
  });
});
