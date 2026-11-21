import { describe, expect, it } from "vitest";
import { NEXT_STEP_CAP, coinShortText, formatEta, isCoinLow, msUntilCoin, nextSteps, nextStepsHtml, type NextStepInput } from "./client-hud-v2-next-step.js";
import type { NextStepSources } from "./client-hud-v2-next-step-sources.js";
import { trackerHtml, type TrackerInput } from "./client-hud-v2-tracker.js";
import { compactTracker, compactTrackerHtml, trackerSummaryHtml } from "./client-hud-v2-compact.js";

const PER_DAY = 1 / 1440; // coin per minute that makes 1 coin per day
// Comfortable: 300 of 400 MP, the next Manifest 5h away. Nothing low.
const base: NextStepInput = { manpower: 300, manpowerCap: 400, beaconCost: 50, gold: 35, netPerMinute: 24 * PER_DAY, nextManifestCost: 40 };

const lowSources: NextStepSources = {
  salvage: { x: 3, y: 4, delivered: 1000, loads: 2 },
  waystation: { x: 5, y: 6, owned: true },
  neutralTown: { x: 7, y: 8, name: "Kettlenook", capAdded: 300, perBatch: 100 },
  manufactoryTown: { x: 9, y: 9, name: "Ashford" },
  explore: { x: 12, y: 0 }
};

// Owner call 2026-11-20: the tutorial teaches the game; "Next step" must not become a second, never-ending one.
// It only shows no-brainer fixes while something is low.
describe("tracker next step stays quiet unless something is low", () => {
  it("shows nothing with manpower and coin comfortable, whatever the slots are doing", () => {
    expect(nextSteps({ ...base, sources: lowSources, manufactoryCost: 150 })).toEqual([]);
  });

  it("no longer suggests a Relay Beacon or the Manifest countdown just because a slot is idle", () => {
    const titles = nextSteps({ ...base, manpower: 19, netPerMinute: 0, sources: lowSources, manufactoryCost: 150 }).map((s) => s.title);
    expect(titles).not.toContain("Build a Relay Beacon");
    expect(titles.some((t) => t.startsWith("Next Manifest") || t === "Manifest affordable" || t === "Saving MP")).toBe(false);
  });
});

describe("tracker next step when manpower runs low", () => {
  it("lists a town, then a waystation, then salvage, each focusing its tile", () => {
    const steps = nextSteps({ ...base, manpower: 19, sources: lowSources });
    expect(steps.map((s) => s.title)).toEqual(["Take a neutral town", "Activate a waystation", "Ship salvage to the Court"]);
    expect(steps[0]).toMatchObject({ sub: "Kettlenook · +300 MP now · +100 per batch", focus: { x: 7, y: 8 } });
    expect(steps[1]).toMatchObject({ sub: "1 in 6 chance of +1,000 MP", focus: { x: 5, y: 6 } });
    expect(steps[2]).toMatchObject({ sub: "+1,000 MP · 2 of 3 loads left", focus: { x: 3, y: 4 } });
    expect(nextStepsHtml(steps)).toContain('data-hud-v2-focus-x="7" data-hud-v2-focus-y="8"');
  });

  it("asks to claim a waystation the player doesn't own yet", () => {
    const steps = nextSteps({ ...base, manpower: 19, sources: { waystation: { x: 1, y: 1, owned: false } } });
    expect(steps.find((s) => s.title === "Claim a waystation")?.sub).toBe("Expand To it, then Activate · 1 in 6 chance of +1,000 MP");
  });

  it("says explore, at the nearest unexplored tile, when no town, waystation or salvage is in sight", () => {
    const steps = nextSteps({ ...base, manpower: 19, sources: { explore: { x: 12, y: 0 } } });
    expect(steps).toEqual([{ title: "Explore", sub: "Find a town, waystation or salvage · scout drone", focus: { x: 12, y: 0 } }]);
    expect(nextSteps({ ...base, manpower: 19, sources: lowSources }).map((s) => s.title)).not.toContain("Explore");
  });

  it("counts manpower as low under a quarter of the cap or under the next beacon's price", () => {
    expect(nextSteps({ ...base, manpower: 99, sources: lowSources }).map((s) => s.title)).toContain("Take a neutral town");
    expect(nextSteps({ ...base, manpowerCap: 100, manpower: 40, sources: lowSources }).map((s) => s.title)).toContain("Take a neutral town");
    expect(nextSteps({ ...base, manpower: 100, sources: lowSources })).toEqual([]);
  });
});

describe("tracker next step when coin runs low", () => {
  it("counts coin as low only when the next Manifest is over 12h away or income has stopped", () => {
    expect(isCoinLow(base)).toBe(false); // 5h away
    expect(isCoinLow({ ...base, gold: 10 })).toBe(true); // 30h away
    expect(isCoinLow({ ...base, netPerMinute: 0 })).toBe(true);
    expect(isCoinLow({ ...base, gold: 0, netPerMinute: 1 / 60 })).toBe(true);
    expect(isCoinLow({ ...base, nextManifestCost: undefined })).toBe(false);
  });

  it("suggests a Manufactory for its instant Coin", () => {
    const steps = nextSteps({ ...base, netPerMinute: 0, sources: lowSources, manufactoryCost: 150 });
    expect(steps).toEqual([{ title: "Build a Manufactory", sub: "150 MP · +10 Coin when built · Ashford", focus: { x: 9, y: 9 } }]);
  });

  it("shows nothing for coin when no town can take a Manufactory", () => {
    expect(nextSteps({ ...base, netPerMinute: 0, sources: {} })).toEqual([]);
  });

  it("caps the rows so the tracker keeps its other groups in view", () => {
    const steps = nextSteps({ ...base, manpower: 19, netPerMinute: 0, sources: lowSources, manufactoryCost: 150 });
    expect(steps.map((s) => s.title)).toEqual(["Take a neutral town", "Activate a waystation", "Ship salvage to the Court", "Build a Manufactory"]);
    expect(steps.length).toBeLessThanOrEqual(NEXT_STEP_CAP);
  });
});

describe("coin shortfall copy", () => {
  it("counts whole spendable coin and rounds the wait up to whole minutes", () => {
    expect(msUntilCoin(10.9, 40, 1)).toBe(30 * 60_000);
    expect(msUntilCoin(40, 40, 0)).toBe(0);
    expect(msUntilCoin(10, 40, -1)).toBeUndefined();
  });

  it("is undefined when affordable and names the gap otherwise", () => {
    expect(coinShortText(50, 40, 0)).toBeUndefined();
    expect(coinShortText(10, 40, 1)).toBe("Need 30 more Coin · +1440.0/day · ready in 30m");
  });

  // UX review: "ready in 138h" read badly; past two days the wait is in days.
  it("switches long waits to days past 48h", () => {
    expect(formatEta(47 * 3_600_000)).toBe("47h");
    expect(formatEta(138 * 3_600_000)).toBe("5d 18h");
    expect(coinShortText(0, 138, 1 / 60)).toContain("ready in 5d 18h");
  });
});

describe("tracker wiring", () => {
  const input: TrackerInput = {
    buildSlots: { busy: 0, limit: 3 }, afcReady: 0, flags: [], flagCap: 0, manpowerCap: 720, building: [], queue: [],
    slotsOpen: true, waypoints: [], nowMs: 0, nextSteps: nextSteps({ ...base, manpower: 19, sources: lowSources })
  };

  it("shows the next step under Dev slots; the desktop tracker keeps the Dev slots line to its hover title", () => {
    const html = trackerHtml(input);
    expect(html).toContain("Take a neutral town");
    expect(html).toContain('title="Garrisons and builds running at once"');
    expect(html).not.toContain("hud-v2-slots-hint");
  });

  it("explains Dev slots as visible text in the phone's unfolded tracker (opened by a tap)", () => {
    compactTracker.open = true;
    try {
      expect(compactTrackerHtml(input)).toContain('<div class="hud-v2-tracker-sub hud-v2-slots-hint">Garrisons and builds running at once</div>');
    } finally {
      compactTracker.open = false;
    }
  });

  // Owner: the phone HUD is crowded; the next step replaces Dev on the one folded line instead of adding a row.
  it("puts the next step on the folded phone line in place of Dev slots", () => {
    const line = trackerSummaryHtml(input);
    expect(line).toContain('<b class="v2c-track-next" title="Take a neutral town">Next ›</b>');
    expect(line).not.toContain("Dev 0/3");
    expect(trackerSummaryHtml({ ...input, nextSteps: [] })).toContain("Dev 0/3");
    expect(trackerSummaryHtml({ ...input, nextSteps: [] })).not.toContain("v2c-track-next");
  });

  // Review of #2867: busy slots keep their count on the folded phone line; "Next" follows it.
  it("keeps Dev on the folded phone line while slots are busy", () => {
    const line = trackerSummaryHtml({ ...input, buildSlots: { busy: 2, limit: 3 } });
    expect(line).toContain("Dev 2/3");
    expect(line).toContain("v2c-track-next");
  });

  it("lets a decision that needs you lead instead", () => {
    expect(trackerHtml({ ...input, afcReady: 1 })).not.toContain("Take a neutral town");
  });
});
