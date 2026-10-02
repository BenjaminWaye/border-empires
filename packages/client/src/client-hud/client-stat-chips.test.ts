import { describe, expect, it } from "vitest";
import { integrityWarningTipHtml, selfPlayerChipHtml } from "./client-stat-chips.js";

describe("selfPlayerChipHtml", () => {
  it("renders a profile-opening button when the self id is known", () => {
    const html = selfPlayerChipHtml("ok", "Ben", { selfOverall: { id: "p1" } });
    expect(html).toContain("<button");
    expect(html).toContain('data-player-name-id="p1"');
  });
  it("falls back to a static chip without a self id", () => {
    const html = selfPlayerChipHtml("ok", "", {});
    expect(html).not.toContain("data-player-name-id");
    expect(html).toContain("Player</strong>");
  });
});

describe("integrityWarningTipHtml", () => {
  it("renders nothing when hidden", () => {
    expect(integrityWarningTipHtml(false)).toBe("");
  });
  it("names what integrity affects in a few words and links to the full panel", () => {
    const html = integrityWarningTipHtml(true);
    expect(html).toContain("Coin");
    expect(html).toContain("Growth");
    expect(html).toContain('data-defensibility-open="true"');
    expect(html).toContain('data-dismiss-integrity-warning="ok"');
    expect(html).not.toContain("exposed borders");
    expect(html.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length).toBeLessThan(16);
  });
});
