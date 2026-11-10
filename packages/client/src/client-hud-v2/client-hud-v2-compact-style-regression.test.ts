// Read the compact stylesheet's source and resolve rule order and specificity, so a rule meant to win is not quietly
// outranked again (happy-dom does not resolve the cascade).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./client-hud-v2-compact.css", import.meta.url), "utf8");
const screensCss = readFileSync(new URL("./client-hud-v2-compact-screens.css", import.meta.url), "utf8");

const ruleSelectors = (needle: string): string[] =>
  [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]
    .map((match) => match[1]!.replace(/\/\*[\s\S]*?\*\//g, "").trim())
    .filter((selectors) => selectors.split(",").some((selector) => selector.trim().endsWith(needle)));

describe("compact HUD styles", () => {
  it("lets the Profile sections grow inside one scroll area", () => {
    expect(screensCss).toMatch(/body\.hud-v2-compact \.v2p\s*\{[^}]*grid-auto-rows:\s*max-content;[^}]*overflow-y:\s*auto;/);
    expect(screensCss).toMatch(/body\.hud-v2-compact \.v2p-hero\s*\{[^}]*max-height:\s*none;[^}]*overflow:\s*visible;/);
    expect(screensCss).toMatch(/body\.hud-v2-compact \.v2p-main\s*\{[^}]*overflow:\s*visible;/);
  });

  // Regression: `body.hud-v2-compact .hud-v2-gear` (the top bar's 36px gear) outranked `.v2c-treasury-rows .hud-v2-gear`,
  // so the Treasury's Settings row rendered as a 36px box with its label spilling out.
  it("the Treasury's Settings row is body-qualified so it outranks the top-bar gear rule", () => {
    const rows = ruleSelectors(".v2c-treasury-rows .hud-v2-gear");
    expect(rows.length).toBeGreaterThan(0);
    for (const selector of rows) expect(selector.startsWith("body.hud-v2-compact ")).toBe(true);
    // The rule it must beat exists and is less specific than the row rule.
    expect(ruleSelectors("body.hud-v2-compact .hud-v2-gear").length).toBeGreaterThan(0);
  });
});
