import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "client-hud-v2.css"), "utf8");

const sidePanelRule = (): string => {
  const match = /body\.hud-v2 #side-panel \{([^}]*)\}/.exec(css);
  if (!match?.[1]) throw new Error("body.hud-v2 #side-panel rule not found");
  return match[1];
};

const px = (rule: string, prop: string): string => {
  const match = new RegExp(`(?:^|;)\\s*${prop}:\\s*([^;]+)`).exec(rule);
  if (!match?.[1]) throw new Error(`${prop} not found`);
  return match[1].trim();
};

// Resolves the two forms this rule uses: "<n>px" and
// "max(<a>px, min(<b>px, calc(100dvh - <c>px)))".
const resolveBottom = (value: string, viewportHeight: number): number => {
  const plain = /^(\d+)px$/.exec(value);
  if (plain) return Number(plain[1]);
  const clamp = /^max\((\d+)px,\s*min\((\d+)px,\s*calc\(100dvh - (\d+)px\)\)\)$/.exec(value);
  if (!clamp) throw new Error(`unrecognised bottom: ${value}`);
  return Math.max(Number(clamp[1]), Math.min(Number(clamp[2]), viewportHeight - Number(clamp[3])));
};

// Regression (playtest): on a laptop-height window the HUD v2 side panel
// (Empire Integrity, Economy, Manpower) ran from 128px down to 236px above the
// bottom -- about a third of a 700px screen -- so Integrity looked cut off
// halfway down.
describe("HUD v2 hosted side panel height", () => {
  const rule = sidePanelRule();
  const top = Number(/^(\d+)px$/.exec(px(rule, "top"))?.[1]);
  const heightAt = (viewportHeight: number): number => viewportHeight - top - resolveBottom(px(rule, "bottom"), viewportHeight);

  it("stays at least 520px tall on a 700px-high window", () => {
    expect(heightAt(700)).toBeGreaterThanOrEqual(520);
  });

  it("still clears the bottom-right orb on a tall window", () => {
    expect(resolveBottom(px(rule, "bottom"), 1080)).toBeGreaterThanOrEqual(236);
  });

  it("draws above the orb (z-index 40) whenever it reaches down over it", () => {
    expect(Number(px(rule, "z-index"))).toBeGreaterThan(40);
  });
});
