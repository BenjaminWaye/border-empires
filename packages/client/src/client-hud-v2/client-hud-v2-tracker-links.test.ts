import { describe, expect, it } from "vitest";
import { rivalsHtml } from "./client-hud-v2-rivals.js";
import { buildSlotsHtml } from "./client-hud-v2-tracker.js";

describe("tracker and rival links", () => {
  // Regression: the dev-slot row was plain text, then opened a side panel across the screen; it now folds the slot list.
  it("folds the slot list open and closed from the dev-slot row", () => {
    const html = buildSlotsHtml({ busy: 1, limit: 3 }, false);
    expect(html).toContain("<button");
    expect(html).toContain("data-hud-v2-slots-toggle");
    expect(html).toContain('aria-expanded="false"');
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
