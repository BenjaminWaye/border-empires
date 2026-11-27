// Playtest 2026-11-26: a big town's panel (stats, focus card, bonuses) was taller than a laptop screen and could
// not be scrolled, so its lower sections were cut off. happy-dom does not resolve the cascade, so guard the rules.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (file: string): string => readFileSync(new URL(file, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const css = read("./client-hud-v2-town-battle.css");
const compact = read("./client-hud-v2-compact-screens.css");
const rule = (selector: string, sheet = css): string => {
  const match = [...sheet.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find(([, sel]) => sel!.trim() === selector);
  return match?.[2] ?? "";
};

describe("town panel scrolling", () => {
  it("scrolls the whole left panel and keeps its sections at full height", () => {
    expect(rule(".v2t-left")).toMatch(/overflow-y:\s*auto/);
    expect(rule(".v2t-left > *")).toMatch(/flex-shrink:\s*0/);
  });

  it("keeps the Grow button in view at the panel's foot while scrolling", () => {
    expect(rule(".v2t-grow-wrap")).toMatch(/position:\s*sticky/);
  });

  // Review of #3028: on phones both the Grow foot and a previewed focus's Confirm pinned to the panel's foot and overlapped.
  it("does not pin the Grow button on phones, where a previewed focus pins its Confirm", () => {
    expect(rule("body.hud-v2-compact .v2t-grow-wrap", compact)).toMatch(/position:\s*static/);
  });
});
