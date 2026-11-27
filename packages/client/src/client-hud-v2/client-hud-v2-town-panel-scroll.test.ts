// Playtest 2026-11-26: a big town's panel (stats, focus card, bonuses) was taller than a laptop screen and could
// not be scrolled, so its lower sections were cut off. happy-dom does not resolve the cascade, so guard the rules.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./client-hud-v2-town-battle.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const rule = (selector: string): string => {
  const match = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find(([, sel]) => sel!.trim() === selector);
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
});
