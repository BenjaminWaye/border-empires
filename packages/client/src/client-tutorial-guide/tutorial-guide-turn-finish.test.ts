import { describe, expect, it } from "vitest";
import { turnFinishTitle, turnFinishWhy } from "./tutorial-guide-turn-finish.js";

describe("guide last step copy", () => {
  it("tells a player over the cap to spend, not to come back (playtest: quit on 2,712 / 1,170)", () => {
    const m = { current: 2712, cap: 1170 };
    expect(turnFinishTitle(m)).toBe("That's the basics. Spend your 2,712 manpower.");
    expect(turnFinishTitle(m)).not.toMatch(/refills/);
    expect(turnFinishWhy(m, "Chronicle")).toMatch(/^Expand, garrison, build and attack\. No refill until you're under 1,170\./);
    expect(turnFinishWhy(m, "Chronicle")).not.toMatch(/Come back/);
  });

  it("tells a player exactly at the cap to spend too: the sim pays no batch while manpower >= cap", () => {
    const m = { current: 1170, cap: 1170 };
    expect(turnFinishTitle(m)).toBe("That's the basics. Spend your 1,170 manpower.");
    expect(turnFinishWhy(m, "Chronicle")).not.toMatch(/Come back/);
  });

  it("keeps the refill message under the cap, or before manpower is known", () => {
    for (const m of [{ current: 869, cap: 870 }, { current: 120, cap: 870 }, undefined]) {
      expect(turnFinishTitle(m)).toBe("That's the basics. Your manpower refills every 4 hours.");
      expect(turnFinishWhy(m, "Chronicle")).toMatch(/^Come back, spend it on expanding, garrisoning, building and attacking/);
    }
  });
});
