import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TOWN_STEP } from "./tutorial-guide-foothold-copy.js";

// Playtest Run 4: first-time players (Rosa, Sam) were lost on "frontier", "garrisoned tile" and an unexplained
// "reach". The guide's own lines stay short and plain; button names (Garrison, Expand To, Explore) are kept
// as-is. "Reach" stays, because the tile menus say "Outside your reach": the beacon step explains it once.
// Lowercase prose only: all-caps code constants such as the "FRONTIER" ownership state aren't player text.
const JARGON = [/\b[Ff]rontier\b/, /\bgarrisoned tile\b/, /\bclaim lands\b/, /\bpushes your reach\b/];

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

  it("explains reach once, where the guide first asks for a beacon, since the tile menus say \"Outside your reach\"", () => {
    expect(literals.some((line) => /Your reach is the land close to your towns and beacons/.test(line))).toBe(true);
  });
});
