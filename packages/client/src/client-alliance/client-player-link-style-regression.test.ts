import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// Brace depth at which each rule with exactly this selector opens; 0 means a
// top-level rule, anything deeper means it sits inside an @media/@supports block.
const ruleDepths = (css: string, selector: string): number[] => {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const depths: number[] = [];
  let depth = 0;
  let prelude = "";
  for (const char of source) {
    if (char === "{") {
      if (prelude.trim() === selector) depths.push(depth);
      depth += 1;
      prelude = "";
    } else if (char === "}") {
      depth -= 1;
      prelude = "";
    } else if (char === ";") {
      prelude = "";
    } else {
      prelude += char;
    }
  }
  return depths;
};

describe("player-link style regression", () => {
  const source = readFileSync(new URL("../style.css", import.meta.url), "utf8");

  it("resets the player-name button at top level, not only inside the mobile media query", () => {
    // When this rule was stranded inside @media (max-width: 900px), wider
    // screens drew Alliances-tab names as light default browser buttons with
    // parchment text on top, which was unreadable.
    expect(ruleDepths(source, ".player-link")).toEqual([0]);
    expect(ruleDepths(source, ".player-link:hover")).toEqual([0]);
  });

  it("keeps the social and manpower card spacing at top level", () => {
    expect(ruleDepths(source, ".social-inspect-card,\n.manpower-summary-card,\n.manpower-detail-card")).toEqual([0]);
  });
});
