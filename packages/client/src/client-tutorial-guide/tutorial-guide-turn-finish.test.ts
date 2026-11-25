import { describe, expect, it } from "vitest";
import { turnFinishTitle, turnFinishWhy } from "./tutorial-guide-turn-finish.js";

const sentences = (text: string): string[] => text.split(/(?<=\.)\s+/).filter(Boolean);
const words = (sentence: string): number => sentence.trim().split(/\s+/).length;

describe("guide last step copy", () => {
  it("titles the last step as a send-off, not a chore to do before Finish (playtest: 'Spend your 2,447 manpower')", () => {
    expect(turnFinishTitle()).toBe("That's the basics.");
    expect(turnFinishTitle()).not.toMatch(/manpower|Spend/);
  });

  it("tells a player over the cap to spend, not to come back (playtest: quit on 2,712 / 1,170)", () => {
    const why = turnFinishWhy({ current: 2712, cap: 1170 });
    expect(why).toBe("Spend your 2,712 manpower. No refill while full.");
    expect(why).not.toMatch(/refills every/);
  });

  it("tells a player exactly at the cap to spend too: the sim pays no batch while manpower >= cap", () => {
    expect(turnFinishWhy({ current: 1170, cap: 1170 })).toMatch(/^Spend your 1,170 manpower\./);
  });

  it("keeps the refill message under the cap, or before manpower is known", () => {
    for (const m of [{ current: 869, cap: 870 }, { current: 120, cap: 870 }, undefined]) {
      expect(turnFinishWhy(m)).toBe("Manpower refills every 4 hours.");
    }
  });

  // Owner, 2026-11-24: anything over about six words goes unread.
  it("keeps every sentence on the last card to six words or fewer, with no 'expand' verb", () => {
    for (const text of [turnFinishTitle(), turnFinishWhy({ current: 2712, cap: 1170 }), turnFinishWhy({ current: 100, cap: 720 })]) {
      for (const sentence of sentences(text)) expect(words(sentence), sentence).toBeLessThanOrEqual(6);
      expect(text).not.toMatch(/\bexpand\b/i);
    }
  });
});
