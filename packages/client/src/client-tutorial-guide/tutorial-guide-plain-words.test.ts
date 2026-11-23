import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TOWN_STEP } from "./tutorial-guide-foothold-copy.js";

// Playtest Run 4: first-time players (Rosa, Sam) were lost on "frontier", "reach" and "garrisoned tile".
// The guide's own lines stay short and plain; button names (Garrison, Expand To, Explore) are kept as-is.
const JARGON = [/\bfrontier\b/i, /\byour reach\b/i, /\bgarrisoned tile\b/i, /\bclaim lands\b/i, /\bpushes your reach\b/i];

const quotedCopy = (file: string): string[] =>
  [...readFileSync(new URL(file, import.meta.url), "utf8").matchAll(/(?:title|why|waitingNote): (?:\(\w*\) => )?[`"]([^`"]+)[`"]/g)].map((m) => m[1]!);

describe("guide copy in plain words", () => {
  const lines = [...quotedCopy("./tutorial-guide-foothold-copy.ts"), ...quotedCopy("./tutorial-guide-steps.ts")];

  it("finds the guide's lines to check", () => {
    expect(lines.length).toBeGreaterThan(20);
  });

  it("uses no jargon a first-time player can't read", () => {
    expect(lines.filter((line) => JARGON.some((word) => word.test(line)))).toEqual([]);
  });

  it("keeps each town step to one short line", () => {
    for (const { title, why } of Object.values(TOWN_STEP)) {
      expect(title.length).toBeLessThanOrEqual(60);
      expect(why.length).toBeLessThanOrEqual(70);
    }
  });
});
