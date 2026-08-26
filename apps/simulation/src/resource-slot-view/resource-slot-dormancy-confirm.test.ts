import { describe, expect, it } from "vitest";

import { isResourceSlotDormancyBlocking } from "./resource-slot-dormancy-confirm.js";

const empty = (): Record<string, Set<string>> => ({ FOOD: new Set(), TITANIUM: new Set(), CRYSTAL: new Set(), UMBRITE: new Set() });

describe("isResourceSlotDormancyBlocking", () => {
  it("is false when every resource's dormant set is empty", () => {
    expect(isResourceSlotDormancyBlocking(empty() as never)).toBe(false);
  });

  it("is true when any single resource has a dormant contributor", () => {
    const result = empty();
    result.CRYSTAL.add("5,5");
    expect(isResourceSlotDormancyBlocking(result as never)).toBe(true);
  });
});
