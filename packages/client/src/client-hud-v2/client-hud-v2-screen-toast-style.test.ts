// Reads the screens stylesheet's source (happy-dom does not paint or resolve stacking) to keep body-level toasts
// off the new HUD's screens.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./client-hud-v2-screens.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

const rulesFor = (selector: string): string[] =>
  [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]
    .filter((match) => match[1]!.split(",").some((part) => part.trim() === selector))
    .map((match) => match[2]!);

describe("new HUD screens and body-level toasts", () => {
  // Regression: on a phone the discovery tip spans the foot of the screen, and because #hud (position: fixed) is its
  // own stacking context the tip painted over Manifest and took the Commission button's taps, so nothing happened.
  it("hides the discovery tip while any screen is open", () => {
    const rules = rulesFor("body.hud-v2-screen-open #discovery-tip-overlay");
    expect(rules.some((body) => /display:\s*none\s*!important/.test(body))).toBe(true);
  });
});
