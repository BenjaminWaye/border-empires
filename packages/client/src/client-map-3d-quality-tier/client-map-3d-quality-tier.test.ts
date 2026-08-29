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

const tierFor = (
  previousAttempt: RendererBreadcrumb | undefined,
  uncleanly = false,
  isIOSSafari = false
): number => qualityTierFor({ previousAttempt, previousSessionEndedUncleanly: uncleanly, isIOSSafari });

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

  // iOS Safari's reported ~300-500MB WebGL ceiling means a first-ever attempt
  // at tier 0 is disproportionately likely to be the thing that crashes it —
  // every iOS user otherwise eats at least one guaranteed crash-and-reload
  // before the crash ladder has any history to act on.
  it("starts a first-ever iOS Safari attempt at tier 1 instead of full quality", () => {
    expect(tierFor(undefined, false, true)).toBe(1);
  });

  it("leaves non-iOS devices with no history at full quality", () => {
    expect(tierFor(undefined, false, false)).toBe(0);
  });

  // The trap this module's own comment warns about: once a breadcrumb exists,
  // the ladder's evidence must win over the platform guess. An iPhone that has
  // *proven* it survives at tier 0 must not be strapped back down to tier 1
  // just because it's iOS — that would silently and permanently degrade a
  // healthy device with no way to recover.
  it("does not re-apply the iOS floor once a breadcrumb proves the device survives at full quality", () => {
    expect(tierFor(breadcrumb({ phase: "survived", failedAttempts: 0 }), false, true)).toBe(0);
  });

  it("does not let the iOS floor override a worse ladder position either", () => {
    expect(tierFor(breadcrumb({ phase: "init-started", failedAttempts: 1 }), false, true)).toBe(MIN_QUALITY_TIER);
  });
});

describe("qualitySettingsFor", () => {
  it("keeps today's full-quality allocation for a healthy device", () => {
    const settings = qualitySettingsFor({
      previousAttempt: undefined,
      previousSessionEndedUncleanly: false,
      isIOSSafari: false
    });
    expect(settings).toEqual({ tier: 0, maxPixelRatio: 2, antialias: true, tileBudgetFloor: MIN_TILE_BUDGET });
  });

  it("starts a first-ever iOS attempt at reduced quality, not full and not minimum", () => {
    const settings = qualitySettingsFor({
      previousAttempt: undefined,
      previousSessionEndedUncleanly: false,
      isIOSSafari: true
    });
    expect(settings).toEqual({ tier: 1, maxPixelRatio: 1.5, antialias: false, tileBudgetFloor: MIN_TILE_BUDGET });
  });

  // MSAA allocates the color *and* depth attachments at the sample count plus
  // a resolve target, so it is the largest single saving and goes first.
  it("gives up MSAA before it gives up resolution", () => {
    const settings = qualitySettingsFor({
      previousAttempt: breadcrumb({ failedAttempts: 1 }),
      previousSessionEndedUncleanly: false,
      isIOSSafari: false
    });
    expect(settings.antialias).toBe(false);
    expect(settings.maxPixelRatio).toBe(1.5);
    expect(settings.tileBudgetFloor).toBe(MIN_TILE_BUDGET);
  });

  it("drops the tile-budget floor only at the bottom rung", () => {
    const settings = qualitySettingsFor({
      previousAttempt: breadcrumb({ failedAttempts: 2 }),
      previousSessionEndedUncleanly: false,
      isIOSSafari: false
    });
    expect(settings).toEqual({ tier: MIN_QUALITY_TIER, maxPixelRatio: 1, antialias: false, tileBudgetFloor: 0 });
  });

  it("only ever gets cheaper as the tier drops", () => {
    const tiers = [
      qualitySettingsFor({ previousAttempt: undefined, previousSessionEndedUncleanly: false, isIOSSafari: false }),
      qualitySettingsFor({
        previousAttempt: breadcrumb({ failedAttempts: 1 }),
        previousSessionEndedUncleanly: false,
        isIOSSafari: false
      }),
      qualitySettingsFor({
        previousAttempt: breadcrumb({ failedAttempts: 2 }),
        previousSessionEndedUncleanly: false,
        isIOSSafari: false
      })
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
