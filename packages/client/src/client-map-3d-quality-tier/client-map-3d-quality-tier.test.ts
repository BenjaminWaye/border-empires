import { describe, expect, it } from "vitest";
import { MIN_QUALITY_TIER, qualitySettingsFor, qualityTierFor } from "./client-map-3d-quality-tier.js";
import { MIN_TILE_BUDGET } from "../client-map-3d-tile-budget/client-map-3d-tile-budget.js";
import type { RendererBreadcrumb } from "../client-renderer-crash-breadcrumb/client-renderer-crash-breadcrumb.js";

const breadcrumb = (overrides: Partial<RendererBreadcrumb>): RendererBreadcrumb => ({
  atMs: 1_000,
  phase: "init-completed",
  tileBudget: 6000,
  failedAttempts: 0,
  ...overrides
});

const tierFor = (previousAttempt: RendererBreadcrumb | undefined, uncleanly = false): number =>
  qualityTierFor({ previousAttempt, previousSessionEndedUncleanly: uncleanly });

describe("qualityTierFor", () => {
  it("runs full quality on a device with no history", () => {
    expect(tierFor(undefined)).toBe(0);
  });

  it("runs full quality after a session that survived", () => {
    expect(tierFor(breadcrumb({ phase: "survived", failedAttempts: 0 }))).toBe(0);
  });

  // The regression this module exists for. The reported iPhone breadcrumb was
  // exactly this: allocation succeeded ("init-completed"), the tab died anyway
  // before the 8s survival timer, twice. The old code only de-escalated on
  // "init-started", so both attempts ran at the identical full-quality
  // configuration and the third gave up on 3D entirely — the device was never
  // offered a cheaper 3D at all.
  it("steps down a rung for each consecutive startup death that is not an allocation death", () => {
    expect(tierFor(breadcrumb({ phase: "init-completed", failedAttempts: 1 }))).toBe(1);
    expect(tierFor(breadcrumb({ phase: "init-completed", failedAttempts: 2 }))).toBe(MIN_QUALITY_TIER);
  });

  it("drops straight to the bottom on the allocation-death signature", () => {
    expect(tierFor(breadcrumb({ phase: "init-started", failedAttempts: 1 }))).toBe(MIN_QUALITY_TIER);
  });

  it("never goes below the bottom rung however long the streak", () => {
    expect(tierFor(breadcrumb({ phase: "init-completed", failedAttempts: 99 }))).toBe(MIN_QUALITY_TIER);
  });

  // The second gap: a session that lived past the 8s timer has already had
  // failedAttempts reset to 0, so a jetsam kill minutes later reads as a
  // perfect run and would loop at full quality forever. The unclean-shutdown
  // signal existed but drove nothing before this.
  it("backs off after a session that ran healthy and was then killed mid-play", () => {
    expect(tierFor(breadcrumb({ phase: "survived", failedAttempts: 0 }), true)).toBe(1);
  });

  it("does not let a clean mid-play shutdown undo a worse startup streak", () => {
    expect(tierFor(breadcrumb({ phase: "init-completed", failedAttempts: 2 }), true)).toBe(MIN_QUALITY_TIER);
  });
});

describe("qualitySettingsFor", () => {
  it("keeps today's full-quality allocation for a healthy device", () => {
    const settings = qualitySettingsFor({ previousAttempt: undefined, previousSessionEndedUncleanly: false });
    expect(settings).toEqual({ tier: 0, maxPixelRatio: 2, antialias: true, tileBudgetFloor: MIN_TILE_BUDGET });
  });

  // MSAA allocates the color *and* depth attachments at the sample count plus
  // a resolve target, so it is the largest single saving and goes first.
  it("gives up MSAA before it gives up resolution", () => {
    const settings = qualitySettingsFor({
      previousAttempt: breadcrumb({ failedAttempts: 1 }),
      previousSessionEndedUncleanly: false
    });
    expect(settings.antialias).toBe(false);
    expect(settings.maxPixelRatio).toBe(1.5);
    expect(settings.tileBudgetFloor).toBe(MIN_TILE_BUDGET);
  });

  it("drops the tile-budget floor only at the bottom rung", () => {
    const settings = qualitySettingsFor({
      previousAttempt: breadcrumb({ failedAttempts: 2 }),
      previousSessionEndedUncleanly: false
    });
    expect(settings).toEqual({ tier: MIN_QUALITY_TIER, maxPixelRatio: 1, antialias: false, tileBudgetFloor: 0 });
  });

  it("only ever gets cheaper as the tier drops", () => {
    const tiers = [
      qualitySettingsFor({ previousAttempt: undefined, previousSessionEndedUncleanly: false }),
      qualitySettingsFor({ previousAttempt: breadcrumb({ failedAttempts: 1 }), previousSessionEndedUncleanly: false }),
      qualitySettingsFor({ previousAttempt: breadcrumb({ failedAttempts: 2 }), previousSessionEndedUncleanly: false })
    ];
    for (let i = 1; i < tiers.length; i += 1) {
      const previous = tiers[i - 1]!;
      const current = tiers[i]!;
      expect(current.maxPixelRatio).toBeLessThanOrEqual(previous.maxPixelRatio);
      expect(Number(current.antialias)).toBeLessThanOrEqual(Number(previous.antialias));
      expect(current.tileBudgetFloor).toBeLessThanOrEqual(previous.tileBudgetFloor);
    }
  });
});
