import { describe, expect, it } from "vitest";
import { turnFinishTitle, turnFinishWhy } from "./tutorial-guide-turn-finish.js";

describe("guide last step copy", () => {
  it("titles the last step as a send-off, not a chore to do before Finish (playtest: 'Spend your 2,447 manpower')", () => {
    expect(turnFinishTitle()).toBe("That's the basics.");
    expect(turnFinishTitle()).not.toMatch(/manpower|Spend/);
  });

  it("tells a player over the cap to spend, not to come back (playtest: quit on 2,712 / 1,170)", () => {
    const why = turnFinishWhy({ current: 2712, cap: 1170 }, "Chronicle");
    expect(why).toMatch(/^Spend your 2,712 manpower: explore for towns and resources, push your reach with beacons, garrison, build defences, improve your economy, attack\. No refill until you're under 1,170\./);
    expect(why).not.toMatch(/refills every/);
  });

  it("tells a player exactly at the cap to spend too: the sim pays no batch while manpower >= cap", () => {
    expect(turnFinishWhy({ current: 1170, cap: 1170 }, "Chronicle")).toMatch(/^Spend your 1,170 manpower/);
  });

  it("keeps the refill message under the cap, or before manpower is known", () => {
    for (const m of [{ current: 869, cap: 870 }, { current: 120, cap: 870 }, undefined]) {
      expect(turnFinishWhy(m, "Chronicle")).toMatch(/^Manpower refills every 4 hours: explore for towns and resources, push your reach/);
    }
  });
});
