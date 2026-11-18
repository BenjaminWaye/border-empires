import { describe, expect, it } from "vitest";
import type { Tile } from "../client-types.js";
import { hasRelayBeaconBuildTile } from "../client-relay-beacon-site/client-relay-beacon-site.js";
import { coinShortText, formatEta, msUntilCoin, nextSteps, nextStepsHtml, type NextStepInput } from "./client-hud-v2-next-step.js";
import type { NextStepSources } from "./client-hud-v2-next-step-sources.js";
import { trackerHtml, type TrackerInput } from "./client-hud-v2-tracker.js";
import { compactTracker, compactTrackerHtml, trackerSummaryHtml } from "./client-hud-v2-compact.js";

const PER_DAY = 1 / 1440; // coin per minute that makes 1 coin per day
const idle: NextStepInput = { devBusy: 0, queued: 0, manpower: 120, manpowerCap: 400, beaconCost: 50, beaconBuildable: true, nextBatchInMs: 75 * 60_000, gold: 10, netPerMinute: 24 * PER_DAY, nextManifestCost: 40 };

// Playtest 2026-11-18: two testers ran out of coin, saw nothing to build and quit at 9 and 12 minutes.
describe("tracker next step while the slots are idle", () => {
  it("points spare manpower at a Relay Beacon", () => {
    const [manpower] = nextSteps(idle);
    expect(manpower).toMatchObject({ title: "Build a Relay Beacon", sub: "50 MP · garrisoned land · more land to build on", open: { kind: "beacon", key: "RELAY_BEACON" } });
    expect(manpower?.hint).toContain("Reach:");
  });

  // Review of #2845: never suggest a beacon the build path would refuse.
  it("drops the beacon row when no tile can take one, falling through to the coin row", () => {
    const steps = nextSteps({ ...idle, beaconBuildable: false });
    expect(steps.map((s) => s.title)).toEqual(["Next Manifest 40 Coin"]);
    expect(nextSteps({ ...idle, beaconBuildable: false, manpower: 0 }).some((s) => s.title === "Saving MP")).toBe(false);
  });

  it("only offers a beacon where the build path's rule allows one", () => {
    const tile = (x: number, y: number, extra: Record<string, unknown> = {}): Tile => ({ x, y, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", ...extra }) as unknown as Tile;
    const map = (...tiles: Tile[]) => new Map(tiles.map((t) => [`${t.x},${t.y}`, t]));
    expect(hasRelayBeaconBuildTile(map(tile(5, 5)), "me")).toBe(true);
    expect(hasRelayBeaconBuildTile(map(tile(5, 5, { ownershipState: "FRONTIER" })), "me")).toBe(false);
    expect(hasRelayBeaconBuildTile(map(tile(5, 5, { economicStructure: { type: "FARMSTEAD", ownerId: "me", status: "active" } })), "me")).toBe(false);
    // Beside an AFC: the landmark footprint blocks it, as in the placement flow.
    expect(hasRelayBeaconBuildTile(map(tile(5, 5), tile(6, 5, { afc: { ownerId: "x", status: "active" }, ownerId: "x" })), "me")).toBe(false);
  });

  it("says when the next manpower batch lands when the beacon is out of reach", () => {
    const [manpower] = nextSteps({ ...idle, manpower: 30 });
    expect(manpower).toMatchObject({ title: "Saving MP", sub: "Relay Beacon 50 MP · next batch 1h 15m" });
  });

  it("says when coin covers the next Manifest, in coin per day", () => {
    const coin = nextSteps(idle)[1];
    expect(coin).toMatchObject({ title: "Next Manifest 40 Coin", sub: "+24.0/day · ready in 30h" });
    expect(coin?.sub).not.toContain("/min");
  });

  it("names the fix when coin income is zero instead of an endless wait", () => {
    expect(nextSteps({ ...idle, netPerMinute: 0 })[1]).toMatchObject({ sub: "+0.0/day · feed a town for Coin", open: { kind: "chip", key: "coin" } });
  });

  it("offers the Manifest once it is affordable", () => {
    expect(nextSteps({ ...idle, gold: 45 })[1]).toMatchObject({ title: "Manifest affordable", open: { kind: "open", key: "manifest" } });
  });

  it("stays out of the way while anything builds or waits for a slot and nothing is low", () => {
    const comfortable = { ...idle, gold: 45, sources: lowSources };
    expect(nextSteps({ ...comfortable, devBusy: 1 })).toEqual([]);
    expect(nextSteps({ ...comfortable, queued: 2 })).toEqual([]);
  });

  it("renders rows that open what they talk about", () => {
    const html = nextStepsHtml(nextSteps({ ...idle, manpower: 30 }));
    expect(html).toContain("Next step");
    expect(html).toContain('data-hud-v2-open="manpower"');
    expect(html).toContain('data-hud-v2-open="manifest"');
  });

  // UX review: the beacon row looked tappable but did nothing.
  it("renders the beacon step as a button that starts placement", () => {
    expect(nextStepsHtml(nextSteps(idle))).toContain('<button type="button" class="hud-v2-tracker-row hud-v2-next-step" data-hud-v2-beacon="RELAY_BEACON"');
  });
});

const lowSources: NextStepSources = {
  salvage: { x: 3, y: 4, delivered: 1000, loads: 2 },
  waystation: { x: 5, y: 6, owned: true },
  neutralTown: { x: 7, y: 8, name: "Kettlenook" },
  manufactoryTown: { x: 9, y: 9, name: "Ashford" }
};

// Owner feedback 2026-11-18: with MP low the tracker only said "Saving MP", though salvage, a waystation or
// a neutral town would help; with coin low it never mentioned a Manufactory. Shown even while slots are busy.
describe("tracker next step when manpower or coin runs low", () => {
  it("names where more manpower comes from, each row focusing its tile", () => {
    const steps = nextSteps({ ...idle, manpower: 19, gold: 45, sources: lowSources });
    expect(steps.map((s) => s.title)).toEqual(["Saving MP", "Ship salvage to the Court", "Activate a waystation", "Take a neutral town", "Manifest affordable"]);
    expect(steps[1]).toMatchObject({ sub: "+1,000 MP · 2 of 3 loads left", focus: { x: 3, y: 4 } });
    expect(steps[2]).toMatchObject({ sub: "1 in 6 chance of +1,000 MP", focus: { x: 5, y: 6 } });
    expect(steps[3]).toMatchObject({ sub: "Kettlenook · more manpower every batch", focus: { x: 7, y: 8 } });
    expect(nextStepsHtml(steps)).toContain('data-hud-v2-focus-x="3" data-hud-v2-focus-y="4"');
  });

  it("asks to claim a waystation the player doesn't own yet", () => {
    const steps = nextSteps({ ...idle, manpower: 19, sources: { waystation: { x: 1, y: 1, owned: false } } });
    expect(steps.find((s) => s.title === "Claim a waystation")?.sub).toBe("Expand To it, then Activate · 1 in 6 chance of +1,000 MP");
  });

  it("counts manpower as low under a quarter of the cap even when a beacon is affordable", () => {
    const steps = nextSteps({ ...idle, manpower: 99, gold: 45, sources: lowSources });
    expect(steps[0]?.title).toBe("Build a Relay Beacon");
    expect(steps.map((s) => s.title)).toContain("Ship salvage to the Court");
    expect(nextSteps({ ...idle, manpower: 300, gold: 45, sources: lowSources }).map((s) => s.title)).not.toContain("Ship salvage to the Court");
  });

  it("suggests a Manufactory when coin is short of the next Manifest", () => {
    const steps = nextSteps({ ...idle, manpower: 300, sources: lowSources, manufactoryCost: 150 });
    expect(steps.at(-1)).toMatchObject({ title: "Build a Manufactory", sub: "150 MP · more Coin from Ashford", focus: { x: 9, y: 9 } });
  });

  it("still shows while the slots are busy", () => {
    const steps = nextSteps({ ...idle, devBusy: 2, manpower: 19, sources: lowSources, manufactoryCost: 150 });
    expect(steps.map((s) => s.title)).toEqual(["Ship salvage to the Court", "Activate a waystation", "Take a neutral town", "Next Manifest 40 Coin", "Build a Manufactory"]);
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
    slotsOpen: true, waypoints: [], nowMs: 0, nextSteps: nextSteps(idle)
  };

  it("shows the next step under Dev slots; the desktop tracker keeps the Dev slots line to its hover title", () => {
    const html = trackerHtml(input);
    expect(html).toContain("Build a Relay Beacon");
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
    expect(line).toContain('<b class="v2c-track-next" title="Build a Relay Beacon">Next ›</b>');
    expect(line).not.toContain("Dev 0/3");
    expect(trackerSummaryHtml({ ...input, nextSteps: [] })).toContain("Dev 0/3");
    expect(trackerSummaryHtml({ ...input, nextSteps: [] })).not.toContain("v2c-track-next");
  });

  it("lets a decision that needs you lead instead", () => {
    expect(trackerHtml({ ...input, afcReady: 1 })).not.toContain("Build a Relay Beacon");
  });
});
