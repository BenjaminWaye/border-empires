import { describe, expect, it } from "vitest";
import { techGrantedFishFoodSlotBonus } from "./fish-food-slot-bonus.js";

describe("techGrantedFishFoodSlotBonus", () => {
  it("is 1 once Agrarian Works is researched, 0 otherwise", () => {
    expect(techGrantedFishFoodSlotBonus({ techIds: new Set(["agriculture"]) })).toBe(1);
    expect(techGrantedFishFoodSlotBonus({ techIds: new Set() })).toBe(0);
  });

  it("accepts a wire-format array of techIds, not just a Set", () => {
    expect(techGrantedFishFoodSlotBonus({ techIds: ["agriculture"] })).toBe(1);
    expect(techGrantedFishFoodSlotBonus({ techIds: [] })).toBe(0);
  });
});
