import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./client-tap-confirm-button-style.css", import.meta.url), "utf8");

// Body of the first top-level rule whose selector is exactly `selector`.
const ruleBody = (selector: string): string => {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(source);
  if (!match) throw new Error(`no rule for ${selector}`);
  return match[2] ?? "";
};

// Regression: the floating "Expand To" prompt was a bright green bubble with
// white system-font text, clashing with the brass/Cinzel art style used by the
// tile sheet's own primary action button.
describe("tap confirm button styling", () => {
  it("uses the steampunk brass palette, not the old green bubble", () => {
    const button = ruleBody(".tap-confirm-btn");
    expect(css).not.toMatch(/#2f9e44|47,\s*158,\s*68/i);
    expect(button).toMatch(/background:[^;]*var\(--sp-brass-/);
    expect(button).toMatch(/border:[^;]*var\(--sp-brass-/);
  });

  it("sets the label in the display face and the cost in the mono face", () => {
    expect(ruleBody(".tap-confirm-btn")).toMatch(/font-family:\s*var\(--sp-font-display/);
    expect(ruleBody(".tap-confirm-cost")).toMatch(/font-family:\s*var\(--sp-font-mono/);
  });
});
