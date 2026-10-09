import { describe, expect, it } from "vitest";

import { manpowerFullStatusText, musterStatusText, renderManpowerPanelHtml } from "./client-side-panel-html.js";

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
// it degrades to. Regen is credited in whole refill windows (4h), so the
// countdown is the wait for the next refill plus any further refills needed.
describe("manpowerFullStatusText", () => {
  const formatDuration = (ms: number) => `${Math.floor(ms / 3_600_000)}h ${Math.round((ms % 3_600_000) / 60_000)}m`;
  const NOW = 1_000_000_000_000;
  const HOUR = 3_600_000;

  it("reports full once manpower has reached the cap", () => {
    expect(manpowerFullStatusText(200, 200, 5, formatDuration, NOW + HOUR, NOW)).toBe("Manpower full.");
    expect(manpowerFullStatusText(250, 200, 5, formatDuration, NOW + HOUR, NOW)).toBe("Manpower full.");
  });

  it("waits only for the next refill when one refill reaches the cap", () => {
    // 3/min x 240 min = 720 per refill, far more than the 180 missing: full at the next refill, 1h 20m away.
    expect(manpowerFullStatusText(20, 200, 3, formatDuration, NOW + HOUR + 20 * 60_000, NOW)).toBe("Manpower full in 1h 20m.");
  });

  it("counts every further whole refill needed after the next one", () => {
    // 0.5/min x 240 min = 120 per refill; 450 missing needs 4 refills: next in 1h, then 3 more windows = 13h.
    expect(manpowerFullStatusText(0, 450, 0.5, formatDuration, NOW + HOUR, NOW)).toBe("Manpower full in 13h 0m.");
  });

  it("reads as paused, not an infinite countdown, when regen is zero or negative", () => {
    expect(manpowerFullStatusText(20, 200, 0, formatDuration, NOW + HOUR, NOW)).toBe("Regen paused.");
    expect(manpowerFullStatusText(20, 200, -1, formatDuration, NOW + HOUR, NOW)).toBe("Regen paused.");
  });
});

describe("musterStatusText for a clearing ADVANCE flag", () => {
  const flag = { x: 5, y: 5, amount: 90.7, mode: "ADVANCE" as const };

  it("says it is clearing the area once it has engaged, instead of scouting", () => {
    expect(musterStatusText({ ...flag, clearing: true })).toBe("Clearing the area — 90 manpower staged.");
    expect(musterStatusText(flag)).toBe("Advancing 90 manpower — scouting for a target.");
  });

  it("still shows live fighting status while clearing", () => {
    expect(musterStatusText({ ...flag, clearing: true, inFlight: true, inFlightCount: 2, fightX: 7, fightY: 8 })).toBe(
      "Fighting at (7, 8) (2 actions active)."
    );
  });
});
