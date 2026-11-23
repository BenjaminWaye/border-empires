import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TOWN_STEP, townTitle, townWhy } from "./tutorial-guide-foothold-copy.js";
import type { GuideInput } from "./tutorial-guide-steps.js";

// Playtest Run 4: first-time players (Rosa, Sam) were lost on "frontier", "reach" and "garrisoned tile".
// The guide's own lines stay short and plain; button names (Garrison, Expand To, Explore) are kept as-is.
// Lowercase prose only: all-caps code constants such as the "FRONTIER" ownership state aren't player text.
const JARGON = [/\b[Ff]rontier\b/, /\b[Yy]our reach\b/, /\bgarrisoned tile\b/, /\bclaim lands\b/, /\bpushes your reach\b/];

const dir = new URL("./", import.meta.url);
/** Every guide source file (not tests), with comments stripped, so ternaries and chapter titles are scanned too. */
const guideSources = readdirSync(dir)
  .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
  .map((file) =>
    readFileSync(new URL(file, dir), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((line) => line.replace(/^\s*\/\/.*$/, "").replace(/\s\/\/ .*$/, ""))
      .join("\n")
  );
/** Every double-quoted or template string literal in the guide's source. */
const literals = guideSources.flatMap((source) => [...source.matchAll(/"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)].map((m) => m[1] ?? m[2] ?? ""));

describe("guide copy in plain words", () => {
  it("finds the guide's strings to check", () => {
    expect(literals.length).toBeGreaterThan(100);
  });

  it("uses no jargon a first-time player can't read, in any guide string", () => {
    expect(literals.filter((line) => JARGON.some((word) => word.test(line)))).toEqual([]);
  });

  it("keeps each town step to one short line", () => {
    for (const { title, why } of Object.values(TOWN_STEP)) {
      expect(title.length).toBeLessThanOrEqual(64);
      expect(why.length).toBeLessThanOrEqual(70);
    }
  });

  // Review of PR #2951: with a town in view but out of range, "No town nearby" contradicted the map.
  it("says a seen but out-of-range town is too far away, not that there's none", () => {
    const input = {
      checklist: { relayBeaconSite: { x: 1, y: 1 } },
      footholdTargets: { town: { outOfReach: 1, unreachable: 0, pending: [], garrison: [], expand: [] }, food: { outOfReach: 0, unreachable: 0, pending: [], garrison: [], expand: [] } },
      scout: "none",
      scoutFlights: 0,
      exploreTarget: () => undefined
    } as unknown as GuideInput;
    expect(townTitle(input)).toBe("Town is too far away: build a Relay Beacon: tap the marked tile, then Build");
    expect(townWhy(input)).toBe("A beacon brings that town in range.");
  });
});
