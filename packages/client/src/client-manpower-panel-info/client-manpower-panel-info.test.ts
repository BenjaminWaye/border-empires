import { describe, expect, it } from "vitest";

import { manpowerInfoHtml, manpowerNextBatchHtml } from "./client-manpower-panel-info.js";

// Playtest 2026-11-12: the panel read "2800/870 Full" with nothing saying why
// the pool was 3x its cap. Over the cap is legitimate (the landing reserve),
// so the panel now says how far over and that regen waits until it drops.
describe("manpowerNextBatchHtml", () => {
  const base = { manpowerCap: 870, manpowerRegenPerMinute: 1, nextRefillAtMs: 60_000, nowMs: 0 };

  it("says how far over the cap the pool is, and that regen is paused", () => {
    const html = manpowerNextBatchHtml({ ...base, manpower: 2_800 });
    expect(html).toContain("Over cap");
    expect(html).toContain("+1,930");
    expect(html).not.toContain("Full");
  });

  it("still says Full exactly at the cap", () => {
    expect(manpowerNextBatchHtml({ ...base, manpower: 870 })).toContain("Full");
  });

  it("explains over-cap manpower in the explainer", () => {
    expect(manpowerInfoHtml()).toContain("over the cap");
  });

  // First-15 playtest 2026-11-28: the Chronicle said "next batch in 3m" while this panel, over the cap, gave no time
  // and its explainer said only "every 4 hours", which read as three different schedules.
  it("gives the next batch time over the cap and at full, from the same schedule", () => {
    const at = { ...base, nextRefillAtMs: 3 * 60_000 };
    expect(manpowerNextBatchHtml({ ...at, manpower: 2_800 })).toContain("Over cap · batch in 0h 3m adds nothing");
    expect(manpowerNextBatchHtml({ ...at, manpower: 870 })).toContain("batch in 0h 3m adds nothing");
  });

  it("puts the player's next batch beside \"every 4 hours\", and says new capacity lands at once", () => {
    const html = manpowerInfoHtml(3 * 60_000, 0);
    expect(html).toContain("every 4 hours (your next: in 0h 3m)");
    expect(html).toContain("added to your manpower at once, even over the cap");
  });
});
