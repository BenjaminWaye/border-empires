import { describe, expect, it } from "vitest";

import { manpowerInfoHtml, manpowerNextBatchHtml } from "./client-manpower-panel-info.js";

// Playtest 2026-11-12: the panel read "2800/870 Full" with nothing saying why
// the pool was 3x its cap. Over the cap is legitimate (the landing reserve),
// so the panel now says how far over and that regen waits until it drops.
describe("manpowerNextBatchHtml", () => {
  const base = { manpowerCap: 870, manpowerRegenPerMinute: 1, nextRefillAtMs: 60_000, nowMs: 0 };

  it("says how far over the cap the pool is, and that regen is paused", () => {
    const html = manpowerNextBatchHtml({ ...base, manpower: 2_800 });
    expect(html).toContain("Over cap · no regen");
    expect(html).toContain("+1,930");
    expect(html).not.toContain("Full");
  });

  it("still says Full exactly at the cap", () => {
    expect(manpowerNextBatchHtml({ ...base, manpower: 870 })).toContain("Full");
  });

  it("explains over-cap manpower in the explainer", () => {
    expect(manpowerInfoHtml()).toContain("over the cap");
  });
});
