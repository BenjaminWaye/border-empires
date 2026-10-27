// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { rivalsHtml } from "./client-hud-v2-rivals.js";
import { buildSlotsHtml, handleSlotsToggle } from "./client-hud-v2-tracker.js";

describe("tracker and rival links", () => {
  // Regression: the dev-slot row was plain text, then opened a side panel across the screen; it now folds the slot list.
  it("folds the slot list open and closed from the dev-slot row", () => {
    const html = buildSlotsHtml({ busy: 1, limit: 3 }, false);
    expect(html).toContain("<button");
    expect(html).toContain("data-hud-v2-slots-toggle");
    expect(html).toContain('aria-expanded="false"');
  });

  // Review: the fold waited up to a second for the tracker's own refresh; it now repaints at once.
  it("folds the slot list and repaints the tracker straight away", () => {
    const row = document.createElement("div");
    row.innerHTML = buildSlotsHtml({ busy: 1, limit: 3 }, true);
    const pip = row.querySelector(".hud-v2-slot-pip")!;
    const fold = { open: true };
    let repaints = 0;
    expect(handleSlotsToggle(pip, fold, () => repaints++)).toBe(true);
    expect(fold).toEqual({ open: false });
    expect(repaints).toBe(1);
    expect(handleSlotsToggle(document.createElement("span"), fold, () => repaints++)).toBe(false);
    expect(repaints).toBe(1);
  });

  // Regression: an unexplained hourglass badge repeated the stance line; the stance is spelled out on hover instead.
  it("labels rivals in words, without a corner badge", () => {
    const html = rivalsHtml({
      me: "me", activeTruces: [{ otherPlayerId: "e", otherPlayerName: "Elin", startedAt: 0, endsAt: 22 * 3_600_000, createdByPlayerId: "me" }],
      allies: [], metPlayerIds: [], nameOf: () => "Elin", colorOf: () => "#e0a845", nowMs: 0
    } as unknown as Parameters<typeof rivalsHtml>[0]);
    expect(html).not.toContain("hud-v2-rival-badge");
    expect(html).toMatch(/title="Elin · Truce 22h"/);
  });
});
