import { describe, expect, it } from "vitest";
import { integrityChipHtml, integrityWarningTipHtml, selfPlayerChipHtml } from "./client-stat-chips.js";

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

describe("integrityChipHtml", () => {
  // Playtest feedback: a new player watched the top-bar integrity number fall
  // while expanding and read it as being punished, even though it was still a
  // bonus. It now lives in the Economy panel and only surfaces up here once
  // it actually costs coin/growth.
  it("stays off the top bar while integrity is still a bonus (50% and up)", () => {
    expect(integrityChipHtml({ pct: 94, defClass: "", showWarning: false, mobile: false })).toBe("");
    expect(integrityChipHtml({ pct: 50, defClass: "", showWarning: false, mobile: false })).toBe("");
    // Would otherwise render "50%" next to "Integrity below 50%".
    expect(integrityChipHtml({ pct: 49.6, defClass: "", showWarning: true, mobile: false })).toBe("");
  });
  it("appears with the warning once integrity drops into the penalty range", () => {
    const html = integrityChipHtml({ pct: 42, defClass: "", showWarning: true, mobile: false });
    expect(html).toContain("Empire Integrity");
    expect(html).toContain("42%");
    expect(html).toContain("Integrity below 50%");
    expect(html).toContain('data-defensibility-open="true"');
  });
});
