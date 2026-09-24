import { describe, expect, it } from "vitest";

import { manpowerFullStatusText, renderManpowerPanelHtml } from "./client-side-panel-html.js";

const baseArgs = {
  manpower: 100,
  manpowerCap: 200,
  manpowerRegenPerMinute: 1,
  manpowerBreakdown: { cap: [], regen: [] },
  formatManpowerAmount: (value: number) => `${value}`,
  rateToneClass: () => "",
  formatDuration: (ms: number) => `${Math.round(ms / 60_000)}m`
};

describe("renderManpowerPanelHtml muster flags section", () => {
  it("shows an empty state when there are no active muster flags", () => {
    const html = renderManpowerPanelHtml({ ...baseArgs, musterFlags: [] });
    expect(html).toContain("Active muster flags");
    expect(html).toContain("No active muster flags.");
  });

  it("renders a clickable row per active muster flag with focus coordinates", () => {
    const html = renderManpowerPanelHtml({
      ...baseArgs,
      musterFlags: [
        { x: 12, y: 18, amount: 340, mode: "HOLD" },
        // ADVANCE has no fixed target of its own (it auto-fires at whatever
        // enemy tile is nearest) — while cooling down between searches, the
        // row shows nextActionAt's countdown instead of a target coordinate.
        { x: 20, y: 22, amount: 90, mode: "ADVANCE", nextActionAt: Date.now() + 5_000 }
      ]
    });
    expect(html).toContain('data-muster-focus-x="12"');
    expect(html).toContain('data-muster-focus-y="18"');
    expect(html).toContain("340");
    expect(html).toContain('data-muster-focus-x="20"');
    expect(html).toContain("Planning next move");
  });

  it("shows a MARCH flag's real-time status instead of falling back to generic text", () => {
    const html = renderManpowerPanelHtml({
      ...baseArgs,
      musterFlags: [{ x: 5, y: 5, amount: 40, mode: "MARCH", targetX: 8, targetY: 8, inFlight: true, fightX: 6, fightY: 5 }]
    });
    expect(html).toContain("Fighting at (6, 5)");
  });
});

// docs/replenishment-update-plan.md D1/D11: "Manpower full in 3h 42min", the
// personal no-turns countdown, and the "Manpower full"/"Regen paused" states
// it degrades to.
describe("manpowerFullStatusText", () => {
  const formatDuration = (ms: number) => `${Math.floor(ms / 3_600_000)}h ${Math.round((ms % 3_600_000) / 60_000)}m`;

  it("reports full once manpower has reached the cap", () => {
    expect(manpowerFullStatusText(200, 200, 5, formatDuration)).toBe("Manpower full.");
    expect(manpowerFullStatusText(250, 200, 5, formatDuration)).toBe("Manpower full.");
  });

  it("formats a countdown from the cap, current value, and regen per minute", () => {
    // (200 - 20) / 3 per minute = 60 minutes = 1h 0m
    expect(manpowerFullStatusText(20, 200, 3, formatDuration)).toBe("Manpower full in 1h 0m.");
  });

  it("reads as paused, not an infinite countdown, when regen is zero or negative", () => {
    expect(manpowerFullStatusText(20, 200, 0, formatDuration)).toBe("Regen paused.");
    expect(manpowerFullStatusText(20, 200, -1, formatDuration)).toBe("Regen paused.");
  });
});
