import { describe, expect, it } from "vitest";
import { selfPlayerChipHtml } from "./client-stat-chips.js";

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
